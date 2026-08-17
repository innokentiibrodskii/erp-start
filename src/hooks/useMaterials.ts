import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useActiveOrgId } from '../OrgContext'

/* ───────────────────────────────────────────────────────────
   Каталог матеріалів (повний CRUD): назва, фото, категорія
   матеріалів, одиниця виміру, постачальники (багато-до-багатьох).
─────────────────────────────────────────────────────────── */

export interface Material {
  id: string
  name: string
  code: string | null
  photo: string | null
  categoryId: string | null
  categoryName: string
  unitId: string
  unitShortName: string
  supplierIds: string[]
  archived: boolean
}

function genCode() { return `MAT-${Math.floor(100 + Math.random() * 900)}` }

function friendlyError(error: { message: string; code?: string }): string {
  if (error.code === '23503') return 'Неможливо видалити: запис використовується в інших довідниках'
  if (error.code === '23505') return 'Такий запис уже існує'
  return error.message
}

export function useMaterials() {
  const orgId = useActiveOrgId()
  return useQuery({
    queryKey: ['materials', orgId],
    queryFn: async (): Promise<Material[]> => {
      const { data, error } = await supabase
        .from('materials')
        .select(`
          id, name, code, photo_url, category_id, unit_id, archived,
          material_categories(name),
          units(short_name),
          material_suppliers(supplier_id)
        `)
        .eq('organization_id', orgId)
        .order('name')
      if (error) throw error
      return data.map(m => ({
        id: m.id,
        name: m.name,
        code: m.code,
        photo: m.photo_url,
        categoryId: m.category_id,
        categoryName: (m.material_categories as unknown as { name: string } | null)?.name ?? '',
        unitId: m.unit_id,
        unitShortName: (m.units as unknown as { short_name: string } | null)?.short_name ?? '',
        supplierIds: (m.material_suppliers ?? []).map((s: { supplier_id: string }) => s.supplier_id),
        archived: m.archived,
      }))
    },
  })
}

interface MaterialFormArgs {
  name: string
  categoryId: string | null
  unitId: string
  photoFile?: File | null
  photoUrl?: string | null
  supplierIds: string[]
}

async function uploadMaterialPhoto(materialId: string, file: File): Promise<string> {
  const path = `${materialId}/${Date.now()}-${file.name}`
  const { error } = await supabase.storage.from('material-photos').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('material-photos').getPublicUrl(path)
  return data.publicUrl
}

async function syncSuppliers(orgId: string, materialId: string, supplierIds: string[]) {
  const { error: deleteError } = await supabase.from('material_suppliers').delete().eq('material_id', materialId)
  if (deleteError) throw deleteError
  if (supplierIds.length > 0) {
    const rows = supplierIds.map(supplierId => ({ material_id: materialId, supplier_id: supplierId, organization_id: orgId }))
    const { error: insertError } = await supabase.from('material_suppliers').insert(rows)
    if (insertError) throw insertError
  }
}

export function useMaterialMutations() {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['materials', orgId] })
  const onErr = (error: { message: string; code?: string }) => alert(friendlyError(error))

  const create = useMutation({
    mutationFn: async ({ name, categoryId, unitId, photoFile, supplierIds }: MaterialFormArgs) => {
      const { data, error } = await supabase
        .from('materials')
        .insert({ name, code: genCode(), category_id: categoryId, unit_id: unitId, organization_id: orgId })
        .select('id')
        .single()
      if (error) throw error
      const materialId = data.id as string
      if (photoFile) {
        const url = await uploadMaterialPhoto(materialId, photoFile)
        const { error: photoError } = await supabase.from('materials').update({ photo_url: url }).eq('id', materialId)
        if (photoError) throw photoError
      }
      await syncSuppliers(orgId, materialId, supplierIds)
      return materialId
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const update = useMutation({
    mutationFn: async ({ id, name, categoryId, unitId, photoFile, photoUrl, supplierIds }: MaterialFormArgs & { id: string }) => {
      let finalPhotoUrl = photoUrl ?? null
      if (photoFile) finalPhotoUrl = await uploadMaterialPhoto(id, photoFile)
      const { error } = await supabase
        .from('materials')
        .update({ name, category_id: categoryId, unit_id: unitId, photo_url: finalPhotoUrl })
        .eq('id', id)
      if (error) throw error
      await syncSuppliers(orgId, id, supplierIds)
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('materials').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const setArchived = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from('materials').update({ archived }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  return {
    createMaterial: (args: MaterialFormArgs) => create.mutateAsync(args),
    updateMaterial: (args: MaterialFormArgs & { id: string }) => update.mutateAsync(args),
    removeMaterial: (id: string) => remove.mutate(id),
    archiveMaterial: (id: string, archived: boolean) => setArchived.mutate({ id, archived }),
    isSaving: create.isPending || update.isPending,
  }
}
