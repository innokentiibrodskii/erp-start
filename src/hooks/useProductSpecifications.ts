import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { ProductMaterialLink, ProductOperationLink } from './useProducts'

/* ───────────────────────────────────────────────────────────
   Статуси й версії специфікації продукту (матеріали + операції) —
   за макетом Figma (node 41-30607). Специфікація за замовчуванням
   read-only; "Редагувати" вмикає режим чернетки (products.specification_editing)
   — лише тоді можна міняти product_materials/product_operations (це ще й
   реально заборонено на рівні БД тригером, не лише в інтерфейсі). "Зберегти"
   фіксує поточний вміст як нову версію (product_specifications) зі знімком
   (product_specification_materials/_operations) і закриває попередню активну
   версію. "Відновити" версію N — це, по суті, "Редагувати", але стартова
   точка чернетки — вміст версії N, а не поточний живий стан (sql/product_specifications.sql).
─────────────────────────────────────────────────────────── */

export type ProductSpecificationVersionStatus = 'active' | 'closed'

export interface ProductSpecificationVersion {
  id: string
  versionNumber: number
  status: ProductSpecificationVersionStatus
  createdByName: string
  createdAt: number
  statusChangedByName: string | null
  statusChangedAt: number | null
  restoredFromVersionNumber: number | null
}

type PersonRef = { first_name: string; last_name: string } | null

function personName(p: PersonRef): string {
  return p ? `${p.first_name} ${p.last_name}`.trim() : '—'
}

/** Усі версії специфікації продукту, найновіша перша. `data[0]` (якщо є) — активна/остання версія. */
export function useProductSpecifications(productId: string | null) {
  return useQuery({
    queryKey: ['product-specifications', productId],
    enabled: productId !== null,
    queryFn: async (): Promise<ProductSpecificationVersion[]> => {
      // restored_from_id навмисно НЕ embed-иться (product_specifications на саму
      // себе) — PostgREST інколи не одразу підхоплює self-referencing FK у
      // кеші схеми; номер версії-джерела резолвимо нижче по вже отриманому
      // списку версій цього ж продукту, без додаткового запиту.
      const { data, error } = await supabase
        .from('product_specifications')
        .select(`
          id, version_number, status, created_at, status_changed_at, restored_from_id,
          created_by_user:users!product_specifications_created_by_fkey(first_name, last_name),
          status_changed_by_user:users!product_specifications_status_changed_by_fkey(first_name, last_name)
        `)
        .eq('product_id', productId as string)
        .order('version_number', { ascending: false })
      if (error) throw error
      const versionNumberById = new Map(data.map(s => [s.id, s.version_number]))
      return data.map(s => ({
        id: s.id,
        versionNumber: s.version_number,
        status: s.status as ProductSpecificationVersionStatus,
        createdByName: personName(s.created_by_user as unknown as PersonRef),
        createdAt: new Date(s.created_at).getTime(),
        statusChangedByName: s.status_changed_by_user ? personName(s.status_changed_by_user as unknown as PersonRef) : null,
        statusChangedAt: s.status_changed_at ? new Date(s.status_changed_at).getTime() : null,
        restoredFromVersionNumber: s.restored_from_id ? (versionNumberById.get(s.restored_from_id) ?? null) : null,
      }))
    },
  })
}

export interface ProductSpecificationMaterialSnapshot {
  id: string
  materialId: string
  qty: number
  unitShortName: string
  unitShortNameEn: string | null
  operationId: string | null
}

export interface ProductSpecificationOperationSnapshot {
  id: string
  operationId: string
  taskName: string
  durationMinutes: number | null
  cost: number | null
}

export interface ProductSpecificationDetail {
  materials: ProductSpecificationMaterialSnapshot[]
  operations: ProductSpecificationOperationSnapshot[]
}

/** Незмінний знімок вмісту однієї версії — для перегляду в "Історії змін версій". */
export function useProductSpecificationDetail(specificationId: string | null) {
  return useQuery({
    queryKey: ['product-specification-detail', specificationId],
    enabled: specificationId !== null,
    queryFn: async (): Promise<ProductSpecificationDetail> => {
      const [{ data: mats, error: matErr }, { data: ops, error: opErr }] = await Promise.all([
        supabase.from('product_specification_materials')
          .select('id, material_id, qty, operation_id, units(short_name, short_name_en)')
          .eq('specification_id', specificationId as string),
        supabase.from('product_specification_operations')
          .select('id, operation_id, task_name, duration_minutes, cost')
          .eq('specification_id', specificationId as string),
      ])
      if (matErr) throw matErr
      if (opErr) throw opErr
      return {
        materials: (mats ?? []).map(m => {
          const unit = m.units as unknown as { short_name: string; short_name_en: string | null } | null
          return {
            id: m.id,
            materialId: m.material_id,
            qty: Number(m.qty),
            unitShortName: unit?.short_name ?? '',
            unitShortNameEn: unit?.short_name_en ?? null,
            operationId: m.operation_id,
          }
        }),
        operations: (ops ?? []).map(o => ({
          id: o.id,
          operationId: o.operation_id,
          taskName: o.task_name ?? '',
          durationMinutes: o.duration_minutes !== null ? Number(o.duration_minutes) : null,
          cost: o.cost !== null ? Number(o.cost) : null,
        })),
      }
    },
  })
}

export type ProductSpecificationEventType = 'draft_started' | 'version_saved' | 'status_changed'

export interface ProductSpecificationEvent {
  id: string
  versionNumber: number | null
  eventType: ProductSpecificationEventType
  actorName: string
  oldValue: string | { version_number: number } | null
  newValue: string | { version_number: number } | null
  occurredAt: number
}

/** Стрічка подій "хто і коли" почав редагування / зберіг версію / закрив попередню. */
export function useProductSpecificationEvents(productId: string | null) {
  return useQuery({
    queryKey: ['product-specification-events', productId],
    enabled: productId !== null,
    queryFn: async (): Promise<ProductSpecificationEvent[]> => {
      const { data, error } = await supabase
        .from('product_specification_events')
        .select('id, event_type, old_value, new_value, occurred_at, actor:users!product_specification_events_actor_id_fkey(first_name, last_name), specification:product_specifications(version_number)')
        .eq('product_id', productId as string)
        .order('occurred_at', { ascending: false })
      if (error) throw error
      return data.map(e => ({
        id: e.id,
        versionNumber: (e.specification as unknown as { version_number: number } | null)?.version_number ?? null,
        eventType: e.event_type as ProductSpecificationEventType,
        actorName: personName(e.actor as unknown as PersonRef),
        oldValue: e.old_value,
        newValue: e.new_value,
        occurredAt: new Date(e.occurred_at).getTime(),
      }))
    },
  })
}

/** Перезаписує живі product_materials/product_operations(+tasks) продукту
 *  знімком обраної версії — спільна логіка для "Відновити" (стара версія)
 *  і "Скасувати" (стан ДО чернетки, тобто ще не закрита остання версія).
 *  Викликач сам відповідає за products.specification_editing навколо
 *  виклику (тригер блокування дозволяє писати лише поки editing = true). */
async function applySnapshotToLiveTables(productId: string, organizationId: string, specificationId: string) {
  const [{ data: snapMaterials, error: matErr }, { data: snapOperations, error: opErr }] = await Promise.all([
    supabase.from('product_specification_materials').select('material_id, qty, unit_id, operation_id').eq('specification_id', specificationId),
    supabase.from('product_specification_operations').select('operation_id, task_name, duration_minutes, cost').eq('specification_id', specificationId),
  ])
  if (matErr) throw matErr
  if (opErr) throw opErr

  const { error: delMatError } = await supabase.from('product_materials').delete().eq('product_id', productId)
  if (delMatError) throw delMatError
  const { error: delOpError } = await supabase.from('product_operations').delete().eq('product_id', productId)
  if (delOpError) throw delOpError
  const { error: delTaskError } = await supabase.from('tasks').delete().eq('product_id', productId)
  if (delTaskError) throw delTaskError

  if (snapMaterials && snapMaterials.length > 0) {
    const { error } = await supabase.from('product_materials').insert(
      snapMaterials.map(m => ({ product_id: productId, material_id: m.material_id, qty: m.qty, unit_id: m.unit_id, operation_id: m.operation_id, organization_id: organizationId }))
    )
    if (error) throw error
  }
  for (const op of snapOperations ?? []) {
    if (op.task_name) {
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({ name: op.task_name, product_id: productId, operation_id: op.operation_id, duration_minutes: op.duration_minutes, cost: op.cost, organization_id: organizationId })
        .select('id')
        .single()
      if (taskError) throw taskError
      const { error: linkError } = await supabase.from('product_operations').insert({ product_id: productId, operation_id: op.operation_id, task_id: task.id, organization_id: organizationId })
      if (linkError) throw linkError
    } else {
      const { error: linkError } = await supabase.from('product_operations').insert({ product_id: productId, operation_id: op.operation_id, organization_id: organizationId })
      if (linkError) throw linkError
    }
  }
}

export function useProductSpecificationMutations() {
  const qc = useQueryClient()
  const invalidateAfter = (productId: string) => {
    qc.invalidateQueries({ queryKey: ['products'] })
    qc.invalidateQueries({ queryKey: ['product-specifications', productId] })
    qc.invalidateQueries({ queryKey: ['product-specification-events', productId] })
    qc.invalidateQueries({ queryKey: ['product-material-events', productId] })
  }
  const onErr = (error: { message: string }) => alert(error.message)

  const startEditing = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase.from('products').update({ specification_editing: true }).eq('id', productId)
      if (error) throw error
    },
    onSuccess: (_d, productId) => invalidateAfter(productId),
    onError: onErr,
  })

  const saveVersion = useMutation({
    mutationFn: async ({ productId, materials, operations }: {
      productId: string
      materials: ProductMaterialLink[]
      operations: ProductOperationLink[]
    }) => {
      const { data: productRow, error: productError } = await supabase
        .from('products')
        .select('organization_id, specification_restore_source_id')
        .eq('id', productId)
        .single()
      if (productError) throw productError
      const organizationId = productRow.organization_id as string

      const { data: maxRow } = await supabase
        .from('product_specifications')
        .select('version_number')
        .eq('product_id', productId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()
      const nextVersion = (maxRow?.version_number ?? 0) + 1

      // Закриваємо попередню активну версію ДО вставки нової — тригер сам
      // проставляє status_changed_by/at і пише подію status_changed.
      const { error: closeError } = await supabase
        .from('product_specifications')
        .update({ status: 'closed' })
        .eq('product_id', productId)
        .eq('status', 'active')
      if (closeError) throw closeError

      const { data: newSpec, error: insertError } = await supabase
        .from('product_specifications')
        .insert({
          product_id: productId,
          organization_id: organizationId,
          version_number: nextVersion,
          status: 'active',
          restored_from_id: (productRow.specification_restore_source_id as string | null) ?? null,
        })
        .select('id')
        .single()
      if (insertError) throw insertError

      if (materials.length > 0) {
        const { error } = await supabase.from('product_specification_materials').insert(
          materials.map(m => ({ specification_id: newSpec.id, material_id: m.materialId, qty: m.qty, unit_id: m.unitId, operation_id: m.operationId }))
        )
        if (error) throw error
      }
      if (operations.length > 0) {
        const { error } = await supabase.from('product_specification_operations').insert(
          operations.map(o => ({ specification_id: newSpec.id, operation_id: o.operationId, task_name: o.taskName || null, duration_minutes: o.durationMinutes, cost: o.cost }))
        )
        if (error) throw error
      }

      // "Закриваємо" пачку подій "Історії змін", накопичену за час цієї
      // чернетки, під щойно збережену версію.
      const { error: tagError } = await supabase
        .from('product_material_events')
        .update({ specification_id: newSpec.id })
        .eq('product_id', productId)
        .is('specification_id', null)
      if (tagError) throw tagError

      const { error: unlockError } = await supabase
        .from('products')
        .update({ specification_editing: false, specification_restore_source_id: null })
        .eq('id', productId)
      if (unlockError) throw unlockError
    },
    onSuccess: (_d, vars) => invalidateAfter(vars.productId),
    onError: onErr,
  })

  const restoreVersion = useMutation({
    mutationFn: async ({ specificationId, productId }: { specificationId: string; productId: string }) => {
      const { data: productRow, error: productError } = await supabase.from('products').select('organization_id').eq('id', productId).single()
      if (productError) throw productError
      const organizationId = productRow.organization_id as string

      // Розблоковуємо ДО зміни живих таблиць — інакше спрацює тригер
      // блокування на product_materials/product_operations.
      const { error: unlockError } = await supabase
        .from('products')
        .update({ specification_editing: true, specification_restore_source_id: specificationId })
        .eq('id', productId)
      if (unlockError) throw unlockError

      await applySnapshotToLiveTables(productId, organizationId, specificationId)
    },
    onSuccess: (_d, vars) => invalidateAfter(vars.productId),
    onError: onErr,
  })

  // "Скасувати" — якщо в чернетці нічого змінювати не хотіли (або передумали),
  // повертає живі таблиці до вмісту останньої версії (вона ще не закрита, поки
  // не було "Зберегти") і вимикає режим редагування — без створення нової версії.
  const cancelEditing = useMutation({
    mutationFn: async ({ productId, latestSpecificationId }: { productId: string; latestSpecificationId: string }) => {
      const { data: productRow, error: productError } = await supabase.from('products').select('organization_id').eq('id', productId).single()
      if (productError) throw productError
      const organizationId = productRow.organization_id as string

      await applySnapshotToLiveTables(productId, organizationId, latestSpecificationId)

      const { error: lockError } = await supabase
        .from('products')
        .update({ specification_editing: false, specification_restore_source_id: null })
        .eq('id', productId)
      if (lockError) throw lockError
    },
    onSuccess: (_d, vars) => invalidateAfter(vars.productId),
    onError: onErr,
  })

  return {
    startEditing: (productId: string) => startEditing.mutateAsync(productId),
    saveVersion: (args: { productId: string; materials: ProductMaterialLink[]; operations: ProductOperationLink[] }) => saveVersion.mutateAsync(args),
    restoreVersion: (args: { specificationId: string; productId: string }) => restoreVersion.mutateAsync(args),
    cancelEditing: (args: { productId: string; latestSpecificationId: string }) => cancelEditing.mutateAsync(args),
    isSaving: startEditing.isPending || saveVersion.isPending || restoreVersion.isPending || cancelEditing.isPending,
  }
}
