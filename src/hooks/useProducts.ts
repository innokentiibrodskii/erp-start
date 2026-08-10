import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/* ───────────────────────────────────────────────────────────
   Types
─────────────────────────────────────────────────────────── */

export interface ProductMaterialLink {
  materialId: string
  qty: number
  unitId: string
  unitShortName: string
  operationId: string | null
}

export interface ProductOperationLink {
  id: string
  operationId: string
  taskId: string | null
  taskName: string
  durationMinutes: number | null
  cost: number | null
}

export interface ProductAttributeLink {
  valueId: string
  value: string
  attributeId: string
  attributeName: string
}

export interface Product {
  id: string
  name: string
  description: string
  sku: string
  categoryId: string | null
  statusId: string | null
  photo: string | null
  createdAt: number
  updatedAt: number
  materials: ProductMaterialLink[]
  operations: ProductOperationLink[]
  attributes: ProductAttributeLink[]
}

export type { Material } from './useMaterials'
export { useMaterials } from './useMaterials'

export interface ProductStatus {
  id: string
  code: string
  name: string
  color: string
  isDefault: boolean
}

export function useProductStatuses() {
  return useQuery({
    queryKey: ['product-statuses'],
    queryFn: async (): Promise<ProductStatus[]> => {
      const { data, error } = await supabase
        .from('product_statuses')
        .select('id, code, name, color, is_default')
        .order('name')
      if (error) throw error
      return data.map(s => ({ id: s.id, code: s.code, name: s.name, color: s.color ?? '#94a3b8', isDefault: s.is_default }))
    },
  })
}

export interface PhotoItem {
  /** Стабільний ключ для React list (не id з бази) */
  key: string
  /** Прев'ю: object URL для нових файлів або публічний URL з бази */
  url: string
  /** Заповнено лише для щойно доданих (ще не завантажених) фото */
  file?: File
}

function friendlyError(error: { message: string; code?: string }): string {
  if (error.code === '23503') return 'Неможливо видалити: запис використовується в інших довідниках'
  if (error.code === '23505') return 'Такий запис уже існує'
  return error.message
}

/* ───────────────────────────────────────────────────────────
   Products
─────────────────────────────────────────────────────────── */

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          id, name, description, sku, category_id, status_id, created_at, updated_at,
          product_images(url, position),
          product_materials(material_id, qty, unit_id, operation_id, units(short_name)),
          product_operations(id, operation_id, task_id, tasks!product_operations_task_id_fkey(name, duration_minutes, cost)),
          product_attribute_values(attribute_value_id, attribute_values(value, attribute_id, attributes(name)))
        `)
        .order('name')
      if (error) throw error

      return data.map(p => {
        const images = (p.product_images ?? []).slice().sort((a, b) => a.position - b.position)
        return {
          id: p.id,
          name: p.name,
          description: p.description ?? '',
          sku: p.sku,
          categoryId: p.category_id,
          statusId: p.status_id,
          photo: images[0]?.url ?? null,
          createdAt: new Date(p.created_at).getTime(),
          updatedAt: new Date(p.updated_at).getTime(),
          materials: (p.product_materials ?? []).map(m => ({
            materialId: m.material_id,
            qty: Number(m.qty),
            unitId: m.unit_id,
            unitShortName: (m.units as unknown as { short_name: string } | null)?.short_name ?? '',
            operationId: m.operation_id,
          })),
          operations: (p.product_operations ?? []).map(o => {
            const task = o.tasks as unknown as { name: string; duration_minutes: number | null; cost: number | null } | null
            return {
              id: o.id,
              operationId: o.operation_id,
              taskId: o.task_id,
              taskName: task?.name ?? '',
              durationMinutes: task?.duration_minutes !== undefined && task?.duration_minutes !== null ? Number(task.duration_minutes) : null,
              cost: task?.cost !== undefined && task?.cost !== null ? Number(task.cost) : null,
            }
          }),
          attributes: (p.product_attribute_values ?? []).map(pav => {
            const av = pav.attribute_values as unknown as { value: string; attribute_id: string; attributes: { name: string } | null } | null
            return {
              valueId: pav.attribute_value_id,
              value: av?.value ?? '',
              attributeId: av?.attribute_id ?? '',
              attributeName: av?.attributes?.name ?? '',
            }
          }),
        }
      })
    },
  })
}

async function persistPhotos(productId: string, photos: PhotoItem[]) {
  const resolvedUrls = await Promise.all(
    photos.map(async (p, i) => {
      if (!p.file) return p.url
      const path = `${productId}/${Date.now()}-${i}-${p.file.name}`
      const { error: uploadError } = await supabase.storage.from('product-photos').upload(path, p.file)
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('product-photos').getPublicUrl(path)
      return data.publicUrl
    })
  )

  const { error: deleteError } = await supabase.from('product_images').delete().eq('product_id', productId)
  if (deleteError) throw deleteError

  if (resolvedUrls.length > 0) {
    const rows = resolvedUrls.map((url, position) => ({ product_id: productId, url, position }))
    const { error: insertError } = await supabase.from('product_images').insert(rows)
    if (insertError) throw insertError
  }
}

async function getDefaultStatusId(): Promise<string | null> {
  const { data, error } = await supabase.from('product_statuses').select('id').eq('is_default', true).limit(1).maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

export function useProductMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['products'] })
  const onErr = (error: { message: string; code?: string }) => alert(friendlyError(error))

  const create = useMutation({
    mutationFn: async ({ name, description, categoryId, photos }: { name: string; description: string; categoryId: string | null; photos: PhotoItem[] }) => {
      // Новий продукт завжди отримує дефолтний статус каталогу (зазвичай "Активний")
      const statusId = await getDefaultStatusId()
      const { data, error } = await supabase
        .from('products')
        .insert({ name, description, category_id: categoryId, status_id: statusId })
        .select('id')
        .single()
      if (error) throw error
      await persistPhotos(data.id, photos)
      return data.id as string
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const update = useMutation({
    mutationFn: async ({ id, name, description, categoryId, statusId, photos }: { id: string; name: string; description: string; categoryId: string | null; statusId: string | null; photos: PhotoItem[] }) => {
      const { error } = await supabase.from('products').update({ name, description, category_id: categoryId, status_id: statusId }).eq('id', id)
      if (error) throw error
      await persistPhotos(id, photos)
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  return {
    createProduct: (args: { name: string; description: string; categoryId: string | null; photos: PhotoItem[] }) => create.mutateAsync(args),
    updateProduct: (args: { id: string; name: string; description: string; categoryId: string | null; statusId: string | null; photos: PhotoItem[] }) => update.mutateAsync(args),
    removeProduct: (id: string) => remove.mutate(id),
    isSaving: create.isPending || update.isPending,
  }
}

/* ───────────────────────────────────────────────────────────
   Повний список фото продукту (для редактора — не лише перше)
─────────────────────────────────────────────────────────── */

export function useProductPhotos(productId: string | null) {
  return useQuery({
    queryKey: ['product-photos', productId],
    enabled: productId !== null,
    queryFn: async (): Promise<PhotoItem[]> => {
      const { data, error } = await supabase
        .from('product_images')
        .select('id, url, position')
        .eq('product_id', productId as string)
        .order('position')
      if (error) throw error
      return data.map(img => ({ key: img.id, url: img.url }))
    },
  })
}

