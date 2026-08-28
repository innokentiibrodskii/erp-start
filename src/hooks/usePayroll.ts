import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useActiveOrgId } from '../OrgContext'
import { useLocale } from '../LocaleContext'
import { showErrorToast } from '../lib/toast'

/* ───────────────────────────────────────────────────────────
   Зарплатний період: адмін задає правило "з X по Y число місяця"
   (organizations.payroll_open_from_day/payroll_open_to_day). Поки не
   налаштовано (обидва null) — жодних обмежень понад старе правило "день
   завершення" немає.

   Фактичне блокування редагування duration_minutes/cost на завершеному
   завданні рахує тригер `assignments_lock_after_completion` у базі (єдине
   джерело істини) — тут та ж сама логіка продубльована для UI (показати
   підказку/сховати поле заздалегідь, а не чекати на помилку з бекенду).

   Закриття періоду (payroll_period_closures) — лише факт "адмін X закрив
   період Y/M о такій-то" для аудиту; відсутність рядка не означає "все ще
   редагується" — після дня Y редагування й так зникає для всіх.
─────────────────────────────────────────────────────────── */

export interface PayrollSettings {
  openFromDay: number | null
  openToDay: number | null
}

export interface PayrollClosure {
  id: string
  periodYear: number
  periodMonth: number
  closedById: string
  closedByName: string
  closedAt: number
}

export type PayrollPeriodPhase = 'not_configured' | 'active' | 'grace_day' | 'awaiting_closure' | 'closed'

export interface PayrollPeriodStatus {
  phase: PayrollPeriodPhase
  /** Останній день періоду (число Y) для місяця завершення — null, якщо правило не налаштоване */
  periodEndDate: Date | null
  /** Чи можна зараз коригувати duration_minutes/cost цього завершеного завдання */
  canEditTimeCost: boolean
}

/** Рік/місяць/день за київським часом — узгоджено з kyivDateParts у useAssignments.ts */
export function kyivDateParts(ts: number): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ts))
  return {
    year: Number(parts.find(p => p.type === 'year')?.value ?? '0'),
    month: Number(parts.find(p => p.type === 'month')?.value ?? '0'),
    day: Number(parts.find(p => p.type === 'day')?.value ?? '0'),
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Обчислює стан зарплатного періоду для конкретного completedAt — той самий
 *  розрахунок, що й тригер assignments_lock_after_completion у базі, лише
 *  для UI (підказка/приховування полів до того, як прийде помилка з бекенду). */
export function computePayrollPeriodStatus(completedAt: number, settings: PayrollSettings, closures: PayrollClosure[]): PayrollPeriodStatus {
  const completed = kyivDateParts(completedAt)
  const today = kyivDateParts(Date.now())
  const isSameDay = today.year === completed.year && today.month === completed.month && today.day === completed.day

  const closure = closures.find(c => c.periodYear === completed.year && c.periodMonth === completed.month)
  if (closure) {
    return { phase: 'closed', periodEndDate: null, canEditTimeCost: false }
  }

  if (settings.openToDay === null) {
    return { phase: 'not_configured', periodEndDate: null, canEditTimeCost: isSameDay }
  }

  const endDay = Math.min(settings.openToDay, daysInMonth(completed.year, completed.month))
  const periodEndDate = new Date(Date.UTC(completed.year, completed.month - 1, endDay))
  const isEndDay = today.year === completed.year && today.month === completed.month && today.day === endDay

  if (isSameDay || isEndDay) {
    return { phase: isEndDay && !isSameDay ? 'grace_day' : 'active', periodEndDate, canEditTimeCost: true }
  }

  const pastEndDay = today.year > completed.year
    || (today.year === completed.year && today.month > completed.month)
    || (today.year === completed.year && today.month === completed.month && today.day > endDay)

  return { phase: pastEndDay ? 'awaiting_closure' : 'active', periodEndDate, canEditTimeCost: false }
}

/** Той самий розрахунок, що й computePayrollPeriodStatus, але для конкретного
 *  (рік, місяць) в цілому — для списку "останні місяці" в налаштуваннях, без
 *  прив'язки до дня завершення якогось окремого завдання. */
export function computeMonthPayrollPhase(year: number, month: number, settings: PayrollSettings, closures: PayrollClosure[]): Exclude<PayrollPeriodPhase, 'grace_day'> {
  if (closures.some(c => c.periodYear === year && c.periodMonth === month)) return 'closed'
  if (settings.openToDay === null) return 'not_configured'
  const today = kyivDateParts(Date.now())
  const endDay = Math.min(settings.openToDay, daysInMonth(year, month))
  const pastEndDay = today.year > year || (today.year === year && today.month > month)
    || (today.year === year && today.month === month && today.day > endDay)
  return pastEndDay ? 'awaiting_closure' : 'active'
}

/* ───────────────────────────────────────────────────────────
   Налаштування (тільки адмін редагує, через Settings)
─────────────────────────────────────────────────────────── */

export function usePayrollSettings() {
  const orgId = useActiveOrgId()
  return useQuery({
    queryKey: ['payroll-settings', orgId],
    queryFn: async (): Promise<PayrollSettings> => {
      const { data, error } = await supabase.from('organizations').select('payroll_open_from_day, payroll_open_to_day').eq('id', orgId).single()
      if (error) throw error
      return { openFromDay: data.payroll_open_from_day, openToDay: data.payroll_open_to_day }
    },
  })
}

export function useSetPayrollSettings() {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const mutation = useMutation({
    mutationFn: async (settings: { openFromDay: number; openToDay: number }) => {
      const { error } = await supabase.from('organizations').update({
        payroll_open_from_day: settings.openFromDay,
        payroll_open_to_day: settings.openToDay,
      }).eq('id', orgId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-settings', orgId] }),
    onError: (error: { message: string }) => showErrorToast(error.message),
  })
  return (settings: { openFromDay: number; openToDay: number }) => mutation.mutateAsync(settings)
}

/* ───────────────────────────────────────────────────────────
   Закриття періодів
─────────────────────────────────────────────────────────── */

type PersonRef = { first_name: string; last_name: string } | null

export function usePayrollClosures() {
  const orgId = useActiveOrgId()
  return useQuery({
    queryKey: ['payroll-closures', orgId],
    queryFn: async (): Promise<PayrollClosure[]> => {
      const { data, error } = await supabase
        .from('payroll_period_closures')
        .select('id, period_year, period_month, closed_by, closed_at, closer:users!payroll_period_closures_closed_by_fkey(first_name, last_name)')
        .eq('organization_id', orgId)
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false })
      if (error) throw error
      return data.map(c => {
        const closer = c.closer as unknown as PersonRef
        return {
          id: c.id,
          periodYear: c.period_year,
          periodMonth: c.period_month,
          closedById: c.closed_by,
          closedByName: closer ? `${closer.first_name} ${closer.last_name}`.trim() : '—',
          closedAt: new Date(c.closed_at).getTime(),
        }
      })
    },
  })
}

export function useClosePayrollPeriod() {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const { t } = useLocale()
  const mutation = useMutation({
    mutationFn: async ({ periodYear, periodMonth, closedById }: { periodYear: number; periodMonth: number; closedById: string }) => {
      const { error } = await supabase.from('payroll_period_closures').insert({
        organization_id: orgId, period_year: periodYear, period_month: periodMonth, closed_by: closedById,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-closures', orgId] }),
    onError: (error: { message: string; code?: string }) => showErrorToast(error.code === '23505' ? t('payroll.alreadyClosed') : error.message),
  })
  return (args: { periodYear: number; periodMonth: number; closedById: string }) => mutation.mutateAsync(args)
}

/* ───────────────────────────────────────────────────────────
   Аудит-лог завдання ("Історія")
─────────────────────────────────────────────────────────── */

export type AssignmentEventType = 'created' | 'status_changed' | 'duration_changed' | 'cost_changed' | 'priority_changed' | 'due_date_changed' | 'product_changed' | 'planned_duration_changed' | 'name_changed' | 'assignee_changed'

export interface AssignmentEvent {
  id: string
  eventType: AssignmentEventType
  actorName: string
  oldValue: unknown
  newValue: unknown
  occurredAt: number
}

export function useAssignmentEvents(assignmentId: string | null) {
  return useQuery({
    queryKey: ['assignment-events', assignmentId],
    enabled: assignmentId !== null,
    queryFn: async (): Promise<AssignmentEvent[]> => {
      const { data, error } = await supabase
        .from('assignment_events')
        .select('id, event_type, old_value, new_value, occurred_at, actor:users!assignment_events_actor_id_fkey(first_name, last_name)')
        .eq('assignment_id', assignmentId as string)
        .order('occurred_at', { ascending: false })
      if (error) throw error
      return data.map(e => {
        const actor = e.actor as unknown as PersonRef
        return {
          id: e.id,
          eventType: e.event_type as AssignmentEventType,
          actorName: actor ? `${actor.first_name} ${actor.last_name}`.trim() : '—',
          oldValue: e.old_value,
          newValue: e.new_value,
          occurredAt: new Date(e.occurred_at).getTime(),
        }
      })
    },
  })
}
