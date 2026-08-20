import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useActiveOrgId } from '../OrgContext'
import { useLocale } from '../LocaleContext'
import type { TranslationKey } from '../i18n'

/* ───────────────────────────────────────────────────────────
   Каталог матеріалів (повний CRUD): назва, фото, категорія
   матеріалів, одиниця виміру, постачальники — основний
   (primary_supplier_id) + додаткові (багато-до-багатьох).
─────────────────────────────────────────────────────────── */

export interface Material {
  id: string
  name: string
  nameEn: string | null
  code: string | null
  photo: string | null
  categoryId: string | null
  categoryName: string
  categoryNameEn: string | null
  unitId: string
  unitShortName: string
  unitShortNameEn: string | null
  /** Базова вартість матеріалу з довідника (у валюті організації) —
   *  саме вона використовується для розрахунку собівартості продукту,
   *  а не ціна останньої поставки. */
  cost: number | null
  primarySupplierId: string | null
  supplierIds: string[]
  archived: boolean
}

export function genCode() { return `MAT-${Math.floor(100 + Math.random() * 900)}` }

function friendlyError(error: { message: string; code?: string }, t: (key: TranslationKey) => string): string {
  if (error.code === '23503') return t('errors.cannotDeleteInUse')
  if (error.code === '23505') return t('errors.alreadyExists')
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
          id, name, name_en, code, photo_url, category_id, unit_id, cost, archived, primary_supplier_id,
          material_categories(name, name_en),
          units(short_name, short_name_en),
          material_suppliers(supplier_id)
        `)
        .eq('organization_id', orgId)
        .order('name')
      if (error) throw error
      return data.map(m => ({
        id: m.id,
        name: m.name,
        nameEn: m.name_en,
        code: m.code,
        photo: m.photo_url,
        categoryId: m.category_id,
        categoryName: (m.material_categories as unknown as { name: string; name_en: string | null } | null)?.name ?? '',
        categoryNameEn: (m.material_categories as unknown as { name: string; name_en: string | null } | null)?.name_en ?? null,
        unitId: m.unit_id,
        unitShortName: (m.units as unknown as { short_name: string; short_name_en: string | null } | null)?.short_name ?? '',
        unitShortNameEn: (m.units as unknown as { short_name: string; short_name_en: string | null } | null)?.short_name_en ?? null,
        cost: m.cost !== null ? Number(m.cost) : null,
        primarySupplierId: m.primary_supplier_id,
        supplierIds: (m.material_suppliers ?? []).map((s: { supplier_id: string }) => s.supplier_id),
        archived: m.archived,
      }))
    },
  })
}

interface MaterialFormArgs {
  name: string
  nameEn?: string | null
  code?: string
  categoryId: string | null
  unitId: string
  cost: number | null
  photoFile?: File | null
  photoUrl?: string | null
  primarySupplierId: string | null
  supplierIds: string[]
}

async function uploadMaterialPhoto(materialId: string, file: File): Promise<string> {
  const path = `${materialId}/${Date.now()}-${file.name}`
  const { error } = await supabase.storage.from('material-photos').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('material-photos').getPublicUrl(path)
  return data.publicUrl
}

/** Додаткові постачальники не повинні дублювати основного */
function dedupeSupplierIds(supplierIds: string[], primarySupplierId: string | null): string[] {
  return supplierIds.filter(id => id !== primarySupplierId)
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
  const { t } = useLocale()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['materials', orgId] })
  const onErr = (error: { message: string; code?: string }) => alert(friendlyError(error, t))

  const create = useMutation({
    mutationFn: async ({ name, nameEn, code, categoryId, unitId, cost, photoFile, primarySupplierId, supplierIds }: MaterialFormArgs) => {
      const { data, error } = await supabase
        .from('materials')
        .insert({ name, name_en: nameEn ?? null, code: code ?? genCode(), category_id: categoryId, unit_id: unitId, cost, primary_supplier_id: primarySupplierId, organization_id: orgId })
        .select('id')
        .single()
      if (error) throw error
      const materialId = data.id as string
      if (photoFile) {
        const url = await uploadMaterialPhoto(materialId, photoFile)
        const { error: photoError } = await supabase.from('materials').update({ photo_url: url }).eq('id', materialId)
        if (photoError) throw photoError
      }
      await syncSuppliers(orgId, materialId, dedupeSupplierIds(supplierIds, primarySupplierId))
      return materialId
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const update = useMutation({
    mutationFn: async ({ id, name, nameEn, categoryId, unitId, cost, photoFile, photoUrl, primarySupplierId, supplierIds }: MaterialFormArgs & { id: string }) => {
      let finalPhotoUrl = photoUrl ?? null
      if (photoFile) finalPhotoUrl = await uploadMaterialPhoto(id, photoFile)
      const { error } = await supabase
        .from('materials')
        .update({ name, name_en: nameEn ?? null, category_id: categoryId, unit_id: unitId, cost, photo_url: finalPhotoUrl, primary_supplier_id: primarySupplierId })
        .eq('id', id)
      if (error) throw error
      await syncSuppliers(orgId, id, dedupeSupplierIds(supplierIds, primarySupplierId))
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
