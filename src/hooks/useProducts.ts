import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { uploadFileWithProgress } from '../lib/storageUpload'
import { useActiveOrgId } from '../OrgContext'
import { useLocale } from '../LocaleContext'
import type { TranslationKey } from '../i18n'
import { friendlyReferenceOrDuplicateError as friendlyError } from '../lib/errors'
import { showErrorToast } from '../lib/toast'

/* ───────────────────────────────────────────────────────────
   Types
─────────────────────────────────────────────────────────── */

// Ліміти на клієнті — щоб відхиляти завеликі файли одразу при виборі,
// а не після тривалого завантаження, яке все одно впаде на боці Storage.
export const MAX_PHOTO_SIZE = 10 * 1024 * 1024 // 10 МБ
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024 // 100 МБ

export interface ProductMaterialLink {
  /** Рядок специфікації (не сам матеріал) — потрібен окремо від materialId,
   *  бо один матеріал тепер можна додати кілька разів з різними операціями. */
  id: string
  materialId: string
  qty: number
  unitId: string
  unitShortName: string
  unitShortNameEn: string | null
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
  valueEn: string | null
  attributeId: string
  attributeName: string
  attributeNameEn: string | null
}

export interface Product {
  id: string
  name: string
  description: string
  sku: string
  categoryId: string | null
  statusId: string | null
  photo: string | null
  /** Усі фото галереї продукту (відсортовані за position, обкладинка — перша).
   *  isVisible — з photo_statuses.is_visible (гейтить показ: друкована форма
   *  й перегляд продукту пропускають фото з isVisible=false, якщо шаблон
   *  друку не обрав конкретні статуси явно — statusId саме для цього).
   *  Наразі використовується у друкованій формі (PrintFormsPage.tsx), щоб
   *  показати кілька фото на картці, не лише обкладинку. */
  photos: { url: string; isVisible: boolean; statusId: string | null }[]
  createdAt: number
  updatedAt: number
  /** Специфікація (матеріали+операції) зараз у режимі редагування ("чернетка") —
   *  sql/product_specifications.sql. Поки false, product_materials/product_operations
   *  реально заборонено міняти на рівні БД, не лише в інтерфейсі. */
  specificationEditing: boolean
  /** Архівований продукт не показується в загальному списку (лише через
   *  фільтр "Архів") — той самий підхід, що materials.archived. */
  archived: boolean
  materials: ProductMaterialLink[]
  operations: ProductOperationLink[]
  attributes: ProductAttributeLink[]
}

export type { Material } from './useMaterials'
export { useMaterials } from './useMaterials'

/** Артикул продукту: P + поточний рік + порядковий номер за цей рік
 *  (напр. "P-2026-01") — лічильник скидається щороку. */
export function genProductArticle(products: Product[], now = new Date()): string {
  const prefix = `P-${now.getFullYear()}-`
  const seq = products.filter(p => p.sku.startsWith(prefix)).length + 1
  return `${prefix}${String(seq).padStart(2, '0')}`
}

export interface ProductStatus {
  id: string
  code: string
  name: string
  nameEn: string | null
  color: string
  isDefault: boolean
}

export function useProductStatuses() {
  const orgId = useActiveOrgId()
  return useQuery({
    queryKey: ['product-statuses', orgId],
    queryFn: async (): Promise<ProductStatus[]> => {
      const { data, error } = await supabase
        .from('product_statuses')
        .select('id, code, name, name_en, color, is_default')
        .eq('organization_id', orgId)
        .order('name')
      if (error) throw error
      return data.map(s => ({ id: s.id, code: s.code, name: s.name, nameEn: s.name_en, color: s.color ?? '#94a3b8', isDefault: s.is_default }))
    },
  })
}

/** Стабільний внутрішній код на основі назви (унікальність — через фолбек-суфікс при колізії).
 *  Використовується лише як службовий ключ; не показується користувачу і ніколи не змінюється при редагуванні. */
function slugifyStatusCode(name: string): string {
  const base = name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  return base || 'status'
}

export function useProductStatusMutations() {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const { t } = useLocale()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['product-statuses', orgId] })
  const onErr = (error: { message: string; code?: string }) => showErrorToast(friendlyError(error, t))

  const add = useMutation({
    mutationFn: async ({ name, nameEn, color }: { name: string; nameEn: string | null; color: string }) => {
      const base = slugifyStatusCode(name)
      let code = base
      for (let attempt = 0; attempt < 6; attempt++) {
        const { error } = await supabase.from('product_statuses').insert({ name, name_en: nameEn, color, code, organization_id: orgId })
        if (!error) return
        if (error.code === '23505') { code = `${base}-${attempt + 2}`; continue }
        throw error
      }
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const update = useMutation({
    mutationFn: async ({ id, name, nameEn, color }: { id: string; name: string; nameEn: string | null; color: string }) => {
      const { error } = await supabase.from('product_statuses').update({ name, name_en: nameEn, color }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('product_statuses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      const { error: e1 } = await supabase.from('product_statuses').update({ is_default: false }).eq('organization_id', orgId).neq('id', id)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('product_statuses').update({ is_default: true }).eq('id', id)
      if (e2) throw e2
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  return {
    addStatus: (name: string, color: string, nameEn: string | null = null) => add.mutateAsync({ name, nameEn, color }),
    updateStatus: (id: string, name: string, color: string, nameEn: string | null = null) => update.mutateAsync({ id, name, nameEn, color }),
    removeStatus: (id: string) => remove.mutate(id),
    setDefaultStatus: (id: string) => setDefault.mutate(id),
    isSaving: add.isPending || update.isPending,
  }
}

/* ───────────────────────────────────────────────────────────
   Статуси фото (довідник для окремих фото в галереї продукту, Довідники →
   "Статуси фото") — прямий дублікат product_statuses, + isVisible: гейтить
   показ фото в ProductPhotoGallery (ProductView.tsx) і в друкованій формі
   (printProductForm.ts).
─────────────────────────────────────────────────────────── */

export interface PhotoStatus {
  id: string
  code: string
  name: string
  nameEn: string | null
  color: string
  isDefault: boolean
  isVisible: boolean
}

export function usePhotoStatuses() {
  const orgId = useActiveOrgId()
  return useQuery({
    queryKey: ['photo-statuses', orgId],
    queryFn: async (): Promise<PhotoStatus[]> => {
      const { data, error } = await supabase
        .from('photo_statuses')
        .select('id, code, name, name_en, color, is_default, is_visible')
        .eq('organization_id', orgId)
        .order('name')
      if (error) throw error
      return data.map(s => ({ id: s.id, code: s.code, name: s.name, nameEn: s.name_en, color: s.color ?? '#94a3b8', isDefault: s.is_default, isVisible: s.is_visible }))
    },
  })
}

export function usePhotoStatusMutations() {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const { t } = useLocale()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['photo-statuses', orgId] })
  const onErr = (error: { message: string; code?: string }) => showErrorToast(friendlyError(error, t))

  const add = useMutation({
    mutationFn: async ({ name, nameEn, color, isVisible }: { name: string; nameEn: string | null; color: string; isVisible: boolean }) => {
      const base = slugifyStatusCode(name)
      let code = base
      for (let attempt = 0; attempt < 6; attempt++) {
        const { error } = await supabase.from('photo_statuses').insert({ name, name_en: nameEn, color, code, is_visible: isVisible, organization_id: orgId })
        if (!error) return
        if (error.code === '23505') { code = `${base}-${attempt + 2}`; continue }
        throw error
      }
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const update = useMutation({
    mutationFn: async ({ id, name, nameEn, color, isVisible }: { id: string; name: string; nameEn: string | null; color: string; isVisible: boolean }) => {
      const { error } = await supabase.from('photo_statuses').update({ name, name_en: nameEn, color, is_visible: isVisible }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('photo_statuses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      const { error: e1 } = await supabase.from('photo_statuses').update({ is_default: false }).eq('organization_id', orgId).neq('id', id)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('photo_statuses').update({ is_default: true }).eq('id', id)
      if (e2) throw e2
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  return {
    addStatus: (name: string, color: string, isVisible: boolean, nameEn: string | null = null) => add.mutateAsync({ name, nameEn, color, isVisible }),
    updateStatus: (id: string, name: string, color: string, isVisible: boolean, nameEn: string | null = null) => update.mutateAsync({ id, name, nameEn, color, isVisible }),
    removeStatus: (id: string) => remove.mutate(id),
    setDefaultStatus: (id: string) => setDefault.mutate(id),
    isSaving: add.isPending || update.isPending,
  }
}

export interface PhotoItem {
  /** Стабільний ключ для React list (не завжди дорівнює dbId — для щойно
   *  доданих, ще не збережених фото це crypto.randomUUID()). */
  key: string
  /** Прев'ю: object URL для нових файлів або публічний URL з бази */
  url: string
  /** Заповнено лише для щойно доданих (ще не завантажених) фото */
  file?: File
  /** id рядка product_images у базі — null для ще не збереженого фото.
   *  persistPhotos() використовує це для точкового upsert/delete замість
   *  delete-all+insert (щоб statusId/originalUrl не губились при кожному
   *  збереженні продукту). */
  dbId: string | null
  statusId: string | null
  /** Посилання на нестиснений оригінал файлу — заповнюється лише якщо
   *  користувач при завантаженні увімкнув "Зберігати оригінал". */
  originalUrl: string | null
  /** Сирий (нестиснений) файл — заповнюється для щойно доданого фото
   *  завжди (сам об'єкт File нічого не коштує тримати в пам'яті); реально
   *  вивантажується persistPhotos() лише якщо keepOriginal увімкнено для
   *  цього конкретного фото — рішення приймається per-фото, а не глобально
   *  на всі нові фото одразу (ProductEditor.tsx). */
  originalFile?: File
  keepOriginal?: boolean
  /** Час додавання (product_images.created_at) — null для щойно доданого,
   *  ще не збереженого фото (ProductEditor.tsx сортує такі як "найновіші"). */
  createdAt: number | null
}

export interface VideoItem {
  /** Стабільний ключ для React list (не завжди дорівнює dbId). */
  key: string
  /** Прев'ю: object URL для нових файлів або публічний URL з бази */
  url: string
  /** Заповнено лише для щойно доданих (ще не завантажених) відео */
  file?: File
  /** id рядка product_videos у базі — null для ще не збереженого відео. */
  dbId: string | null
  /** Час додавання (product_videos.created_at) — null для щойно доданого. */
  createdAt: number | null
}

/* ───────────────────────────────────────────────────────────
   Products
─────────────────────────────────────────────────────────── */

export function useProducts() {
  const orgId = useActiveOrgId()
  return useQuery({
    queryKey: ['products', orgId],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          id, name, description, sku, category_id, status_id, created_at, updated_at, specification_editing, archived,
          product_images(url, position, status_id, photo_statuses(is_visible)),
          product_materials(id, material_id, qty, unit_id, operation_id, units(short_name, short_name_en)),
          product_operations(id, operation_id, task_id, tasks!product_operations_task_id_fkey(name, duration_minutes, cost)),
          product_attribute_values(attribute_value_id, attribute_values(value, value_en, attribute_id, attributes(name, name_en)))
        `)
        .eq('organization_id', orgId)
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
          photos: images.map(img => ({
            url: img.url,
            isVisible: (img.photo_statuses as unknown as { is_visible: boolean } | null)?.is_visible ?? true,
            statusId: img.status_id,
          })),
          createdAt: new Date(p.created_at).getTime(),
          updatedAt: new Date(p.updated_at).getTime(),
          specificationEditing: p.specification_editing,
          archived: p.archived,
          materials: (p.product_materials ?? []).map(m => ({
            id: m.id,
            materialId: m.material_id,
            qty: Number(m.qty),
            unitId: m.unit_id,
            unitShortName: (m.units as unknown as { short_name: string; short_name_en: string | null } | null)?.short_name ?? '',
            unitShortNameEn: (m.units as unknown as { short_name: string; short_name_en: string | null } | null)?.short_name_en ?? null,
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
            const av = pav.attribute_values as unknown as { value: string; value_en: string | null; attribute_id: string; attributes: { name: string; name_en: string | null } | null } | null
            return {
              valueId: pav.attribute_value_id,
              value: av?.value ?? '',
              valueEn: av?.value_en ?? null,
              attributeId: av?.attribute_id ?? '',
              attributeName: av?.attributes?.name ?? '',
              attributeNameEn: av?.attributes?.name_en ?? null,
            }
          }),
        }
      })
    },
  })
}

async function getDefaultPhotoStatusId(orgId: string): Promise<string | null> {
  const { data, error } = await supabase.from('photo_statuses').select('id').eq('organization_id', orgId).eq('is_default', true).limit(1).maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

/** Точковий diff (upsert наявних за id + insert нових + delete прибраних)
 *  замість delete-all+insert — щоб statusId/originalUrl не губились і не
 *  переприв'язувались на новий id при кожному збереженні продукту (кожне
 *  фото — окремий рядок product_images, id стабільний між збереженнями). */
async function persistPhotos(orgId: string, productId: string, photos: PhotoItem[], onProgress?: (key: string, loadedBytes: number) => void) {
  const defaultStatusId = photos.some(p => p.statusId === null) ? await getDefaultPhotoStatusId(orgId) : null

  const resolved = await Promise.all(
    photos.map(async (p, i) => {
      let url = p.url
      if (p.file) {
        const path = `${productId}/${Date.now()}-${i}-${p.file.name}`
        await uploadFileWithProgress('product-photos', path, p.file, loaded => onProgress?.(p.key, loaded))
        url = supabase.storage.from('product-photos').getPublicUrl(path).data.publicUrl
      }
      let originalUrl = p.originalUrl
      // keepOriginal — рішення per-фото (не глобальне на всі нові фото).
      if (p.originalFile && p.keepOriginal) {
        const originalPath = `${productId}/originals/${Date.now()}-${i}-${p.originalFile.name}`
        await uploadFileWithProgress('product-photos', originalPath, p.originalFile)
        originalUrl = supabase.storage.from('product-photos').getPublicUrl(originalPath).data.publicUrl
      }
      return { id: p.dbId ?? crypto.randomUUID(), url, statusId: p.statusId ?? defaultStatusId, originalUrl }
    })
  )

  const { data: existingRows, error: existingError } = await supabase.from('product_images').select('id').eq('product_id', productId)
  if (existingError) throw existingError
  const keepIds = new Set(resolved.map(p => p.id))
  const toDelete = (existingRows ?? []).map(r => r.id).filter(id => !keepIds.has(id))
  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase.from('product_images').delete().in('id', toDelete)
    if (deleteError) throw deleteError
  }

  if (resolved.length > 0) {
    const rows = resolved.map((p, position) => ({
      id: p.id, product_id: productId, url: p.url, position, organization_id: orgId,
      status_id: p.statusId, original_url: p.originalUrl,
    }))
    const { error: upsertError } = await supabase.from('product_images').upsert(rows)
    if (upsertError) throw upsertError
  }
}

/** Той самий точковий diff, що й persistPhotos — id відео стабільний між збереженнями. */
async function persistVideos(orgId: string, productId: string, videos: VideoItem[], onProgress?: (key: string, loadedBytes: number) => void) {
  const resolved = await Promise.all(
    videos.map(async (v, i) => {
      let url = v.url
      if (v.file) {
        const path = `${productId}/${Date.now()}-${i}-${v.file.name}`
        await uploadFileWithProgress('product-videos', path, v.file, loaded => onProgress?.(v.key, loaded))
        url = supabase.storage.from('product-videos').getPublicUrl(path).data.publicUrl
      }
      return { id: v.dbId ?? crypto.randomUUID(), url }
    })
  )

  const { data: existingRows, error: existingError } = await supabase.from('product_videos').select('id').eq('product_id', productId)
  if (existingError) throw existingError
  const keepIds = new Set(resolved.map(v => v.id))
  const toDelete = (existingRows ?? []).map(r => r.id).filter(id => !keepIds.has(id))
  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase.from('product_videos').delete().in('id', toDelete)
    if (deleteError) throw deleteError
  }

  if (resolved.length > 0) {
    const rows = resolved.map((v, position) => ({ id: v.id, product_id: productId, url: v.url, position, organization_id: orgId }))
    const { error: upsertError } = await supabase.from('product_videos').upsert(rows)
    if (upsertError) throw upsertError
  }
}

async function getDefaultStatusId(orgId: string): Promise<string | null> {
  const { data, error } = await supabase.from('product_statuses').select('id').eq('organization_id', orgId).eq('is_default', true).limit(1).maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

export function useProductMutations() {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const { t } = useLocale()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['products', orgId] })
  const onErr = (error: { message: string; code?: string }) => showErrorToast(friendlyError(error, t))

  const create = useMutation({
    mutationFn: async ({ name, description, categoryId, sku, photos, videos, onProgress }: { name: string; description: string; categoryId: string | null; sku: string; photos: PhotoItem[]; videos: VideoItem[]; onProgress?: (key: string, loadedBytes: number) => void }) => {
      // Новий продукт завжди отримує дефолтний статус каталогу (зазвичай "Активний")
      const statusId = await getDefaultStatusId(orgId)
      const { data, error } = await supabase
        .from('products')
        .insert({ name, description, category_id: categoryId, status_id: statusId, sku, organization_id: orgId })
        .select('id')
        .single()
      if (error) throw error
      // Фото й відео вантажаться паралельно, а не одне за одним — на повільній мережі
      // це помітно скорочує загальний час збереження продукту.
      await Promise.all([
        persistPhotos(orgId, data.id, photos, onProgress),
        persistVideos(orgId, data.id, videos, onProgress),
      ])
      return data.id as string
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const update = useMutation({
    mutationFn: async ({ id, name, description, categoryId, statusId, photos, videos, onProgress }: { id: string; name: string; description: string; categoryId: string | null; statusId: string | null; photos: PhotoItem[]; videos: VideoItem[]; onProgress?: (key: string, loadedBytes: number) => void }) => {
      const { error } = await supabase.from('products').update({ name, description, category_id: categoryId, status_id: statusId }).eq('id', id)
      if (error) throw error
      await Promise.all([
        persistPhotos(orgId, id, photos, onProgress),
        persistVideos(orgId, id, videos, onProgress),
      ])
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

  // Архівувати може будь-хто з доступом до редагування продукту (звичайна
  // update-політика) — видалити насправді може лише адмін, це вже
  // забезпечує тригер у БД (sql/product_archive_and_delete.sql).
  const setArchived = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from('products').update({ archived }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  return {
    createProduct: (args: { name: string; description: string; categoryId: string | null; sku: string; photos: PhotoItem[]; videos: VideoItem[]; onProgress?: (key: string, loadedBytes: number) => void }) => create.mutateAsync(args),
    updateProduct: (args: { id: string; name: string; description: string; categoryId: string | null; statusId: string | null; photos: PhotoItem[]; videos: VideoItem[]; onProgress?: (key: string, loadedBytes: number) => void }) => update.mutateAsync(args),
    removeProduct: (id: string) => remove.mutate(id),
    archiveProduct: (id: string, archived: boolean) => setArchived.mutate({ id, archived }),
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
        .select('id, url, position, status_id, original_url, created_at')
        .eq('product_id', productId as string)
        .order('position')
      if (error) throw error
      return data.map(img => ({
        key: img.id, url: img.url, dbId: img.id, statusId: img.status_id, originalUrl: img.original_url,
        createdAt: new Date(img.created_at).getTime(),
      }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Повний список відео продукту (для редактора)
─────────────────────────────────────────────────────────── */

export function useProductVideos(productId: string | null) {
  return useQuery({
    queryKey: ['product-videos', productId],
    enabled: productId !== null,
    queryFn: async (): Promise<VideoItem[]> => {
      const { data, error } = await supabase
        .from('product_videos')
        .select('id, url, position, created_at')
        .eq('product_id', productId as string)
        .order('position')
      if (error) throw error
      return data.map(v => ({ key: v.id, url: v.url, dbId: v.id, createdAt: new Date(v.created_at).getTime() }))
    },
  })
}

