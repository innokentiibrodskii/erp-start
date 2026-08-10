import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { createOperationDirect } from './useCatalog'

/* ───────────────────────────────────────────────────────────
   Додавання/редагування матеріалів продукту:
   матеріал з каталогу + кількість + (опційно) операція, у межах
   якої матеріал використовується. Якщо операції ще немає у продукту,
   для неї автоматично створюється рядок у product_operations.
   Якщо потрібної операції немає взагалі в каталозі — її можна
   створити тут же (createOperation).
─────────────────────────────────────────────────────────── */

function friendlyError(error: { message: string; code?: string }): string {
  if (error.code === '23505') return 'Цей матеріал уже додано до продукту'
  if (error.code === '23503') return 'Помилка зв\'язку з довідником'
  return error.message
}

async function ensureProductOperation(productId: string, operationId: string) {
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
    .insert({ product_id: productId, operation_id: operationId })
  if (insertError) throw insertError
}

export function useProductMaterialMutations() {
  const qc = useQueryClient()
  const invalidateProducts = () => qc.invalidateQueries({ queryKey: ['products'] })
  const invalidateOperations = () => qc.invalidateQueries({ queryKey: ['operations'] })
  const onErr = (error: { message: string; code?: string }) => alert(friendlyError(error))

  const add = useMutation({
    mutationFn: async ({ productId, materialId, qty, unitId, operationId }: {
      productId: string; materialId: string; qty: number; unitId: string; operationId: string | null
    }) => {
      if (operationId) await ensureProductOperation(productId, operationId)
      const { error } = await supabase.from('product_materials').insert({
        product_id: productId, material_id: materialId, qty, unit_id: unitId, operation_id: operationId,
      })
      if (error) throw error
    },
    onSuccess: invalidateProducts,
    onError: onErr,
  })

  const update = useMutation({
    mutationFn: async ({ productId, materialId, qty, operationId }: {
      productId: string; materialId: string; qty: number; operationId: string | null
    }) => {
      if (operationId) await ensureProductOperation(productId, operationId)
      const { error } = await supabase
        .from('product_materials')
        .update({ qty, operation_id: operationId })
        .eq('product_id', productId).eq('material_id', materialId)
      if (error) throw error
    },
    onSuccess: invalidateProducts,
    onError: onErr,
  })

  const remove = useMutation({
    mutationFn: async ({ productId, materialId }: { productId: string; materialId: string }) => {
      const { error } = await supabase.from('product_materials').delete().eq('product_id', productId).eq('material_id', materialId)
      if (error) throw error
    },
    onSuccess: invalidateProducts,
    onError: onErr,
  })

  const createOperation = useMutation({
    mutationFn: async ({ name }: { name: string }) => createOperationDirect(name),
    onSuccess: invalidateOperations,
    onError: onErr,
  })

  return {
    addMaterial: (args: { productId: string; materialId: string; qty: number; unitId: string; operationId: string | null }) => add.mutateAsync(args),
    updateMaterial: (args: { productId: string; materialId: string; qty: number; operationId: string | null }) => update.mutateAsync(args),
    removeMaterial: (args: { productId: string; materialId: string }) => remove.mutate(args),
    createOperation: (args: { name: string }) => createOperation.mutateAsync(args),
    isSaving: add.isPending || update.isPending || createOperation.isPending,
  }
}
