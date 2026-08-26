import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useActiveOrgId } from '../OrgContext'
import { useLocale } from '../LocaleContext'
import type { TranslationKey } from '../i18n'

/* ───────────────────────────────────────────────────────────
   Додавання операцій до продукту: операція з каталогу + завдання
   (назва, час, вартість). Кожна додана до продукту операція
   (рядок product_operations) супроводжується одним завданням
   (tasks), яке можна або створити нове, або обрати вже наявне
   в межах цього продукту.
─────────────────────────────────────────────────────────── */

export interface ProductTask {
  id: string
  name: string
  operationId: string
  durationMinutes: number | null
  cost: number | null
}

function friendlyError(error: { message: string; code?: string }, t: (key: TranslationKey) => string): string {
  if (error.code === '23505') return t('errors.taskNameExists')
  if (error.code === '23503') return t('errors.referenceError')
  return error.message
}

/** Усі завдання, вже створені в межах конкретного продукту (для повторного використання) */
export function useProductTasks(productId: string | null) {
  return useQuery({
    queryKey: ['product-tasks', productId],
    enabled: productId !== null,
    queryFn: async (): Promise<ProductTask[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, name, operation_id, duration_minutes, cost')
        .eq('product_id', productId as string)
        .order('name')
      if (error) throw error
      return data.map(t => ({
        id: t.id,
        name: t.name,
        operationId: t.operation_id,
        durationMinutes: t.duration_minutes !== null ? Number(t.duration_minutes) : null,
        cost: t.cost !== null ? Number(t.cost) : null,
      }))
    },
  })
}

export function useProductOperationMutations() {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const { t } = useLocale()
  const invalidateProducts = () => qc.invalidateQueries({ queryKey: ['products', orgId] })
  const invalidateTasks = (productId: string) => qc.invalidateQueries({ queryKey: ['product-tasks', productId] })
  const onErr = (error: { message: string; code?: string }) => alert(friendlyError(error, t))

  /** Додати операцію до продукту разом з новим завданням. Одну операцію можна
   *  додати декілька разів — кожне додавання створює свій рядок і своє завдання
   *  (назви завдань мають бути унікальні в межах операції+продукту). */
  const addWithNewTask = useMutation({
    mutationFn: async ({ productId, operationId, taskName, durationMinutes, cost }: {
      productId: string; operationId: string; taskName: string; durationMinutes: number | null; cost: number | null
    }) => {
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({ name: taskName, product_id: productId, operation_id: operationId, duration_minutes: durationMinutes, cost, organization_id: orgId })
        .select('id')
        .single()
      if (taskError) throw taskError
      const { error: linkError } = await supabase
        .from('product_operations')
        .insert({ product_id: productId, operation_id: operationId, task_id: task.id, organization_id: orgId })
      if (linkError) throw linkError
    },
    onSuccess: (_data, vars) => { invalidateProducts(); invalidateTasks(vars.productId) },
    // Помилку (напр. дублікат назви завдання) показуємо інлайн у формі, а не поверх усього екрана.
  })

  /** Додати операцію до продукту, повторно використавши вже наявне завдання цього продукту */
  const addWithExistingTask = useMutation({
    mutationFn: async ({ productId, operationId, taskId }: { productId: string; operationId: string; taskId: string }) => {
      const { error } = await supabase
        .from('product_operations')
        .insert({ product_id: productId, operation_id: operationId, task_id: taskId, organization_id: orgId })
      if (error) throw error
    },
    onSuccess: invalidateProducts,
  })

  /** Редагувати вже додану до продукту операцію: до якої категорії "Операція"
   *  вона належить (product_operations.operation_id) і — якщо за нею стоїть
   *  завдання (task_id не null) — саме завдання (назва/час/вартість). "Мітка"
   *  без завдання (додана лише через матеріал, ensureProductOperation) має
   *  тільки операцію для редагування, полів завдання в неї немає. */
  const updateTask = useMutation({
    mutationFn: async ({ productOperationId, taskId, productId, operationId, name, durationMinutes, cost }: {
      productOperationId: string; taskId: string | null; productId: string; operationId: string
      name: string; durationMinutes: number | null; cost: number | null
    }) => {
      if (taskId) {
        const { error: taskError } = await supabase
          .from('tasks')
          .update({ name, operation_id: operationId, duration_minutes: durationMinutes, cost })
          .eq('id', taskId)
        if (taskError) throw taskError
      }
      const { error: linkError } = await supabase.from('product_operations').update({ operation_id: operationId }).eq('id', productOperationId)
      if (linkError) throw linkError
    },
    onSuccess: (_data, vars) => { invalidateProducts(); invalidateTasks(vars.productId) },
    onError: onErr,
  })

  /** Видалити прив'язку операції до продукту. Якщо завдання, яке вона несла,
   *  більше ніде в продукті не використовується — видаляємо і його. */
  const remove = useMutation({
    mutationFn: async ({ id, productId, taskId }: { id: string; productId: string; taskId: string | null }) => {
      const { error } = await supabase.from('product_operations').delete().eq('id', id)
      if (error) throw error
      if (taskId) {
        const { count, error: countError } = await supabase
          .from('product_operations')
          .select('id', { count: 'exact', head: true })
          .eq('task_id', taskId)
        if (countError) throw countError
        if (!count) {
          const { error: taskDeleteError } = await supabase.from('tasks').delete().eq('id', taskId)
          if (taskDeleteError) throw taskDeleteError
        }
      }
    },
    onSuccess: (_data, vars) => { invalidateProducts(); invalidateTasks(vars.productId) },
    onError: onErr,
  })

  const addTaskError = addWithNewTask.error
    ? friendlyError(addWithNewTask.error as { message: string; code?: string }, t)
    : addWithExistingTask.error
    ? friendlyError(addWithExistingTask.error as { message: string; code?: string }, t)
    : null

  const resetAddErrors = () => {
    addWithNewTask.reset()
    addWithExistingTask.reset()
  }

  return {
    addWithNewTask: (args: { productId: string; operationId: string; taskName: string; durationMinutes: number | null; cost: number | null }) => addWithNewTask.mutateAsync(args),
    addWithExistingTask: (args: { productId: string; operationId: string; taskId: string }) => addWithExistingTask.mutateAsync(args),
    updateOperationTask: (args: { productOperationId: string; taskId: string | null; productId: string; operationId: string; name: string; durationMinutes: number | null; cost: number | null }) => updateTask.mutateAsync(args),
    removeOperation: (args: { id: string; productId: string; taskId: string | null }) => remove.mutate(args),
    isSaving: addWithNewTask.isPending || addWithExistingTask.isPending,
    isUpdating: updateTask.isPending,
    addTaskError,
    resetAddErrors,
  }
}
