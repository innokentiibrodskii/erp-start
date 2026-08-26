import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { createOperationDirect } from './useCatalog'
import { useActiveOrgId } from '../OrgContext'
import { useLocale } from '../LocaleContext'
import type { TranslationKey } from '../i18n'

/* ───────────────────────────────────────────────────────────
   Додавання/редагування матеріалів продукту:
   матеріал з каталогу + кількість + (опційно) операція, у межах
   якої матеріал використовується. Якщо операції ще немає у продукту,
   для неї автоматично створюється рядок у product_operations.
   Якщо потрібної операції немає взагалі в каталозі — її можна
   створити тут же (createOperation).
─────────────────────────────────────────────────────────── */

function friendlyError(error: { message: string; code?: string }, t: (key: TranslationKey) => string): string {
  if (error.code === '23505') return t('errors.materialAlreadyAdded')
  if (error.code === '23503') return t('errors.referenceError')
  return error.message
}

async function ensureProductOperation(orgId: string, productId: string, operationId: string) {
  // Рядок-"мітка" (без завдання) для пари продукт+операція має бути лише один —
  // якщо він уже є, нічого не робимо.
  const { data: existing, error: selectError } = await supabase
    .from('product_operations')
    .select('id')
    .eq('product_id', productId)
    .eq('operation_id', operationId)
    .is('task_id', null)
    .limit(1)
    .maybeSingle()
  if (selectError) throw selectError
  if (existing) return
  const { error: insertError } = await supabase
    .from('product_operations')
    .insert({ product_id: productId, operation_id: operationId, organization_id: orgId })
  if (insertError) throw insertError
}

export function useProductMaterialMutations() {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const { t } = useLocale()
  const invalidateProducts = () => qc.invalidateQueries({ queryKey: ['products'] })
  const invalidateOperations = () => qc.invalidateQueries({ queryKey: ['operations', orgId] })
  const onErr = (error: { message: string; code?: string }) => alert(friendlyError(error, t))

  const add = useMutation({
    mutationFn: async ({ productId, materialId, qty, unitId, operationId }: {
      productId: string; materialId: string; qty: number; unitId: string; operationId: string | null
    }) => {
      if (operationId) await ensureProductOperation(orgId, productId, operationId)
      const { error } = await supabase.from('product_materials').insert({
        product_id: productId, material_id: materialId, qty, unit_id: unitId, operation_id: operationId, organization_id: orgId,
      })
      if (error) throw error
    },
    onSuccess: invalidateProducts,
    onError: onErr,
  })

  const update = useMutation({
    mutationFn: async ({ id, productId, qty, operationId }: {
      id: string; productId: string; qty: number; operationId: string | null
    }) => {
      if (operationId) await ensureProductOperation(orgId, productId, operationId)
      const { error } = await supabase
        .from('product_materials')
        .update({ qty, operation_id: operationId })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidateProducts,
    onError: onErr,
  })

  const remove = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from('product_materials').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidateProducts,
    onError: onErr,
  })

  const createOperation = useMutation({
    mutationFn: async ({ name }: { name: string }) => createOperationDirect(orgId, name),
    onSuccess: invalidateOperations,
    onError: onErr,
  })

  return {
    addMaterial: (args: { productId: string; materialId: string; qty: number; unitId: string; operationId: string | null }) => add.mutateAsync(args),
    updateMaterial: (args: { id: string; productId: string; qty: number; operationId: string | null }) => update.mutateAsync(args),
    removeMaterial: (args: { id: string }) => remove.mutate(args),
    createOperation: (args: { name: string }) => createOperation.mutateAsync(args),
    isSaving: add.isPending || update.isPending || createOperation.isPending,
  }
}
