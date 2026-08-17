import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useActiveOrgId } from '../OrgContext'

/* ───────────────────────────────────────────────────────────
   Завдання для виконавців: конкретне доручення співробітнику —
   продукт + операція (+ опційно шаблон із каталогу завдань
   продукту tasks, звідки копіюються назва/час/вартість),
   виконавець, статус виконання.

   Витрачений час рахується автоматично: коли завдання виходить
   зі статусу "в роботі" (на "перерву", "завершено", "скасовано"
   чи назад у "очікування"), різниця між зараз і status_changed_at
   додається до duration_minutes. "Перерва" таким чином зупиняє
   лічильник — час не накопичується, поки статус знову не стане
   "в роботі".

   Завершене завдання (completed_at) можна редагувати (статус чи
   час) лише в день завершення — далі це блокує тригер у базі
   (assignments_lock_after_completion), тут дублюємо перевірку на
   клієнті лише для вимкнення полів у формі.

   Видимість керується RLS: виконавець бачить лише свої рядки
   (assignee_id = auth.uid()), менеджер — усі. Тому запит на
   читання однаковий для обох ролей — фільтрація відбувається
   на боці бази.
─────────────────────────────────────────────────────────── */

export type AssignmentStatus = 'pending' | 'in_progress' | 'paused' | 'done' | 'cancelled'

export interface Assignment {
  id: string
  productId: string
  productName: string
  operationId: string
  operationName: string
  taskId: string | null
  name: string
  assigneeId: string
  assigneeName: string
  assignedById: string | null
  assignedByName: string
  durationMinutes: number | null
  cost: number | null
  status: AssignmentStatus
  statusChangedAt: number
  completedAt: number | null
  createdAt: number
  updatedAt: number
}

type PersonRef = { first_name: string; last_name: string } | null

function friendlyError(error: { message: string; code?: string }): string {
  if (error.code === '23503') return 'Помилка зв\'язку з довідником'
  return error.message
}

/** Рік/місяць/день за київським часом — для порівняння "той самий день"/"той самий місяць" */
function kyivDateParts(ts: number): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ts))
  return {
    year: parts.find(p => p.type === 'year')?.value ?? '',
    month: parts.find(p => p.type === 'month')?.value ?? '',
    day: parts.find(p => p.type === 'day')?.value ?? '',
  }
}

/** Завершене завдання заблоковане для редагування статусу/часу, якщо день завершення вже минув */
export function isAssignmentLocked(a: Assignment): boolean {
  if (a.status !== 'done' || a.completedAt === null) return false
  const done = kyivDateParts(a.completedAt)
  const today = kyivDateParts(Date.now())
  return done.year !== today.year || done.month !== today.month || done.day !== today.day
}

/** Завершене в минулому місяці — ховається зі списку за замовчуванням (можна показати фільтром) */
export function isArchivedCompleted(a: Assignment): boolean {
  if (a.status !== 'done' || a.completedAt === null) return false
  const done = kyivDateParts(a.completedAt)
  const today = kyivDateParts(Date.now())
  return done.year !== today.year || done.month !== today.month
}

export function useAssignments() {
  const orgId = useActiveOrgId()
  return useQuery({
    queryKey: ['assignments', orgId],
    queryFn: async (): Promise<Assignment[]> => {
      const { data, error } = await supabase
        .from('assignments')
        .select(`
          id, product_id, operation_id, task_id, name, assignee_id, assigned_by,
          duration_minutes, cost, status, status_changed_at, completed_at, created_at, updated_at,
          products(name),
          operations(name),
          assignee:users!assignments_assignee_id_fkey(first_name, last_name),
          assigner:users!assignments_assigned_by_fkey(first_name, last_name)
        `)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
      if (error) throw error

      return data.map(a => {
        const product = a.products as unknown as { name: string } | null
        const operation = a.operations as unknown as { name: string } | null
        const assignee = a.assignee as unknown as PersonRef
        const assigner = a.assigner as unknown as PersonRef
        return {
          id: a.id,
          productId: a.product_id,
          productName: product?.name ?? '—',
          operationId: a.operation_id,
          operationName: operation?.name ?? '—',
          taskId: a.task_id,
          name: a.name,
          assigneeId: a.assignee_id,
          assigneeName: assignee ? `${assignee.first_name} ${assignee.last_name}`.trim() : '—',
          assignedById: a.assigned_by,
          assignedByName: assigner ? `${assigner.first_name} ${assigner.last_name}`.trim() : '—',
          durationMinutes: a.duration_minutes !== null ? Number(a.duration_minutes) : null,
          cost: a.cost !== null ? Number(a.cost) : null,
          status: a.status as AssignmentStatus,
          statusChangedAt: new Date(a.status_changed_at).getTime(),
          completedAt: a.completed_at !== null ? new Date(a.completed_at).getTime() : null,
          createdAt: new Date(a.created_at).getTime(),
          updatedAt: new Date(a.updated_at).getTime(),
        }
      })
    },
  })
}

export function useAssignmentMutations() {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['assignments', orgId] })
  const onErr = (error: { message: string; code?: string }) => alert(friendlyError(error))

  const create = useMutation({
    mutationFn: async (args: {
      productId: string; operationId: string; taskId: string | null; name: string
      assigneeId: string; assignedById: string; durationMinutes: number | null; cost: number | null
    }) => {
      const { error } = await supabase.from('assignments').insert({
        product_id: args.productId,
        operation_id: args.operationId,
        task_id: args.taskId,
        name: args.name,
        assignee_id: args.assigneeId,
        assigned_by: args.assignedById,
        duration_minutes: args.durationMinutes,
        cost: args.cost,
        organization_id: orgId,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  /** Зміна статусу (+ за потреби ручне коригування часу). Якщо завдання виходить
   *  зі статусу "в роботі", час цього відрізку автоматично додається до
   *  введеного/наявного значення витраченого часу. */
  const updateStatus = useMutation({
    mutationFn: async ({ id, prevStatus, prevStatusChangedAt, newStatus, durationMinutes }: {
      id: string; prevStatus: AssignmentStatus; prevStatusChangedAt: number; newStatus: AssignmentStatus; durationMinutes: number | null
    }) => {
      let finalDuration = durationMinutes
      if (prevStatus === 'in_progress' && newStatus !== 'in_progress') {
        const elapsedMin = Math.max(0, Math.round((Date.now() - prevStatusChangedAt) / 60000))
        finalDuration = (durationMinutes ?? 0) + elapsedMin
      }
      const patch: Record<string, unknown> = {
        status: newStatus,
        status_changed_at: new Date().toISOString(),
        duration_minutes: finalDuration,
      }
      if (newStatus === 'done') patch.completed_at = new Date().toISOString()
      else if (prevStatus === 'done') patch.completed_at = null

      const { error } = await supabase.from('assignments').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('assignments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  return {
    createAssignment: (args: {
      productId: string; operationId: string; taskId: string | null; name: string
      assigneeId: string; assignedById: string; durationMinutes: number | null; cost: number | null
    }) => create.mutateAsync(args),
    updateStatus: (args: { id: string; prevStatus: AssignmentStatus; prevStatusChangedAt: number; newStatus: AssignmentStatus; durationMinutes: number | null }) => updateStatus.mutateAsync(args),
    removeAssignment: (id: string) => remove.mutate(id),
    isSaving: create.isPending || updateStatus.isPending,
  }
}
