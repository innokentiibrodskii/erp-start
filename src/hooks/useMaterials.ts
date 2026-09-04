import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { safeStorageFileName } from '../lib/storageUpload'
import { useActiveOrgId } from '../OrgContext'
import { useMaterialSkuMode } from './useOrgSettings'
import { useLocale } from '../LocaleContext'
import type { TranslationKey } from '../i18n'
import { friendlyReferenceOrDuplicateError as friendlyError } from '../lib/errors'
import { showErrorToast } from '../lib/toast'

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
  /** Ціна від основного постачальника (material_suppliers.price для
   *  рядка supplier_id = primary_supplier_id) — окремо від materials.cost
   *  ("Ціна матеріалу", використовується для собівартості продукту). */
  primarySupplierPrice: number | null
  supplierIds: string[]
  archived: boolean
}

export function genCode() { return `MAT-${Math.floor(100 + Math.random() * 900)}` }

/** Safety-net для режиму "Авто" (organizations.material_sku_mode) при 23505 у
 *  create-мутації нижче: код, порахований на клієнті (genMaterialArticle,
 *  lib/materialFormat.ts) з кешу useMaterials(), міг устигнути застаріти
 *  (напр. другий матеріал тієї ж категорії створюють одразу за першим).
 *  Префікс (усе до кінцевого "-NN") беремо з коду, що вже не підійшов, і
 *  перераховуємо максимальний номер саме для нього напряму з БД. */
async function nextAvailableCodeForPrefix(orgId: string, prefix: string): Promise<string> {
  const { data, error } = await supabase.from('materials').select('code').eq('organization_id', orgId).like('code', `${prefix}-%`)
  if (error) throw error
  let maxSeq = 0
  for (const m of data ?? []) {
    const n = Number((m.code as string).slice(prefix.length + 1))
    if (Number.isFinite(n) && n > maxSeq) maxSeq = n
  }
  return `${prefix}-${String(maxSeq + 1).padStart(2, '0')}`
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
          material_suppliers(supplier_id, price)
        `)
        .eq('organization_id', orgId)
        .order('name')
      if (error) throw error
      return data.map(m => {
        const supplierRows = (m.material_suppliers ?? []) as { supplier_id: string; price: number | null }[]
        const primaryRow = supplierRows.find(s => s.supplier_id === m.primary_supplier_id)
        return {
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
          primarySupplierPrice: primaryRow?.price !== undefined && primaryRow.price !== null ? Number(primaryRow.price) : null,
          // material_suppliers тепер містить і рядок основного постачальника
          // (для його price) — supplierIds лишається "додатковими" постачальниками.
          supplierIds: supplierRows.filter(s => s.supplier_id !== m.primary_supplier_id).map(s => s.supplier_id),
          archived: m.archived,
        }
      })
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
  primarySupplierPrice: number | null
  supplierIds: string[]
}

async function uploadMaterialPhoto(materialId: string, file: File): Promise<string> {
  const path = `${materialId}/${Date.now()}-${safeStorageFileName(file.name)}`
  const { error } = await supabase.storage.from('material-photos').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('material-photos').getPublicUrl(path)
  return data.publicUrl
}

/** Додаткові постачальники не повинні дублювати основного */
function dedupeSupplierIds(supplierIds: string[], primarySupplierId: string | null): string[] {
  return supplierIds.filter(id => id !== primarySupplierId)
}

/** Перезаписує рядки material_suppliers для матеріалу: додаткові
 *  постачальники (без ціни) + окремий рядок для основного постачальника
 *  з його ціною (materials.primary_supplier_id — сам той самий id, тут
 *  просто зберігаємо material_suppliers.price для нього, щоб було звідки
 *  читати "Ціну постачальника" на картці матеріалу). */
async function syncSuppliers(orgId: string, materialId: string, supplierIds: string[], primarySupplierId: string | null, primarySupplierPrice: number | null) {
  const { error: deleteError } = await supabase.from('material_suppliers').delete().eq('material_id', materialId)
  if (deleteError) throw deleteError
  const rows = supplierIds.map(supplierId => ({ material_id: materialId, supplier_id: supplierId, organization_id: orgId, price: null as number | null }))
  if (primarySupplierId) rows.push({ material_id: materialId, supplier_id: primarySupplierId, organization_id: orgId, price: primarySupplierPrice })
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('material_suppliers').insert(rows)
    if (insertError) throw insertError
  }
}

export function useMaterialMutations() {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const { t } = useLocale()
  const skuModeQ = useMaterialSkuMode()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['materials', orgId] })
  const onErr = (error: { message: string; code?: string }) => showErrorToast(friendlyError(error, t))

  const create = useMutation({
    mutationFn: async ({ name, nameEn, code, categoryId, unitId, cost, photoFile, primarySupplierId, primarySupplierPrice, supplierIds }: MaterialFormArgs) => {
      // Режим "Авто" — код, переданий з форми, порахований із кешу
      // useMaterials() на клієнті й теоретично може вже застаріти (напр.
      // другий матеріал створюють одразу за першим). Якщо БД відхилить через
      // колізію (materials_org_code_unique, 23505) — перерахувати напряму з
      // БД і спробувати ще раз, до 5 разів. У режимі "Вручну" колізія — це
      // саме те, що мало статись (код зайнятий) — просто дружня помилка,
      // без силентного підбору іншого коду замість того, що ввів користувач.
      const isAuto = (skuModeQ.data ?? 'auto') === 'auto'
      const trimmedCode = code?.trim() || null
      let attemptCode: string | null = trimmedCode ?? (isAuto ? genCode() : null)
      let materialId: string | null = null
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data, error } = await supabase
          .from('materials')
          .insert({ name, name_en: nameEn ?? null, code: attemptCode, category_id: categoryId, unit_id: unitId, cost, primary_supplier_id: primarySupplierId, organization_id: orgId })
          .select('id')
          .single()
        if (!error) { materialId = data.id; break }
        if (error.code === '23505' && isAuto && attempt < 4) {
          // Префікс — усе до кінцевого "-NN" коду, що не підійшов (напр.
          // "T-O-05" → "T-O"); якщо код узагалі без цього шаблону (напр.
          // random-фолбек genCode()) — просто новий random-код.
          const m = /^(.+)-\d+$/.exec(attemptCode ?? '')
          attemptCode = m ? await nextAvailableCodeForPrefix(orgId, m[1]) : genCode()
          continue
        }
        throw error
      }
      if (!materialId) throw new Error('Не вдалось згенерувати унікальний код матеріалу')
      if (photoFile) {
        const url = await uploadMaterialPhoto(materialId, photoFile)
        const { error: photoError } = await supabase.from('materials').update({ photo_url: url }).eq('id', materialId)
        if (photoError) throw photoError
      }
      await syncSuppliers(orgId, materialId, dedupeSupplierIds(supplierIds, primarySupplierId), primarySupplierId, primarySupplierPrice)
      return materialId
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const update = useMutation({
    mutationFn: async ({ id, name, nameEn, code, categoryId, unitId, cost, photoFile, photoUrl, primarySupplierId, primarySupplierPrice, supplierIds }: MaterialFormArgs & { id: string }) => {
      let finalPhotoUrl = photoUrl ?? null
      if (photoFile) finalPhotoUrl = await uploadMaterialPhoto(id, photoFile)
      // Код зазвичай не змінюється при редагуванні (він приходить сюди
      // рівно editing.code, MaterialEditorPage.tsx) — це update у той самий
      // рядок, тож жодного конфлікту немає. Єдиний випадок реальної зміни —
      // перегенерація артикулу після зміни категорії (кнопка біля поля
      // "Код матеріалу", лише skuMode "Авто"); тоді можлива колізія з іншим
      // матеріалом, створеним щойно з тим самим порядковим номером — той
      // самий safety-net retry-on-23505, що й у create вище.
      const isAuto = (skuModeQ.data ?? 'auto') === 'auto'
      let attemptCode: string | null = code?.trim() || null
      for (let attempt = 0; attempt < 5; attempt++) {
        const { error } = await supabase
          .from('materials')
          .update({ name, name_en: nameEn ?? null, category_id: categoryId, unit_id: unitId, cost, photo_url: finalPhotoUrl, primary_supplier_id: primarySupplierId, code: attemptCode })
          .eq('id', id)
        if (!error) break
        if (error.code === '23505' && isAuto && attempt < 4) {
          const m = /^(.+)-\d+$/.exec(attemptCode ?? '')
          attemptCode = m ? await nextAvailableCodeForPrefix(orgId, m[1]) : attemptCode
          continue
        }
        throw error
      }
      await syncSuppliers(orgId, id, dedupeSupplierIds(supplierIds, primarySupplierId), primarySupplierId, primarySupplierPrice)
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
