import { useState } from 'react'
import { useCurrentUser, type CurrentUser } from './hooks/useCurrentUser'
import { useUsers, type AppUser } from './hooks/useUsers'
import { useProducts, useProductStatuses } from './hooks/useProducts'
import type { Product } from './hooks/useProducts'
import { useCatalog } from './hooks/useCatalog'
import type { Operation } from './hooks/useCatalog'
import { useProductTasks, type ProductTask } from './hooks/useProductOperations'
import { useAssignments, useAssignmentMutations, isAssignmentLocked, isArchivedCompleted, type Assignment, type AssignmentStatus, type AssignmentPriority } from './hooks/useAssignments'
import { usePayrollSettings, usePayrollClosures, useAssignmentEvents, computePayrollPeriodStatus, kyivDateParts, type AssignmentEventType } from './hooks/usePayroll'
import { useLocale } from './LocaleContext'
import type { TranslationKey } from './i18n'

/* ───────────────────────────────────────────────────────────
   Сторінка "Завдання" для виконавців. Видимість рядків керується
   RLS у базі (виконавець бачить лише свої, менеджер — усі), тому
   тут просто рендеримо те, що прийшло з useAssignments().
─────────────────────────────────────────────────────────── */

const STATUS_LABEL_KEY: Record<AssignmentStatus, TranslationKey> = {
  pending: 'assignmentStatus.pending',
  in_progress: 'assignmentStatus.inProgress',
  paused: 'assignmentStatus.paused',
  done: 'assignmentStatus.done',
  cancelled: 'assignmentStatus.cancelled',
}

const STATUS_STYLE: Record<AssignmentStatus, { bg: string; text: string }> = {
  pending: { bg: '#e0f2fe', text: '#0284c7' },
  in_progress: { bg: '#dbeafe', text: '#2563eb' },
  paused: { bg: '#fef3c7', text: '#d97706' },
  done: { bg: '#dcfce7', text: '#16a34a' },
  cancelled: { bg: '#f1f5f9', text: '#64748b' },
}

const PRIORITY_LABEL_KEY: Record<AssignmentPriority, TranslationKey> = {
  low: 'assignmentPriority.low',
  medium: 'assignmentPriority.medium',
  high: 'assignmentPriority.high',
  urgent: 'assignmentPriority.urgent',
}

const PRIORITY_STYLE: Record<AssignmentPriority, { bg: string; text: string }> = {
  low: { bg: '#f1f5f9', text: '#64748b' },
  medium: { bg: '#e0f2fe', text: '#0284c7' },
  high: { bg: '#fff7ed', text: '#ea580c' },
  urgent: { bg: '#fee2e2', text: '#dc2626' },
}

const PRIORITIES: AssignmentPriority[] = ['low', 'medium', 'high', 'urgent']

type QuickActionStatus = 'in_progress' | 'paused' | 'done'
const QUICK_ACTION_STATUSES: QuickActionStatus[] = ['in_progress', 'paused', 'done']
const QUICK_ACTION_LABEL_KEY: Record<QuickActionStatus, TranslationKey> = {
  in_progress: 'assignments.actionStart',
  paused: 'assignments.actionPause',
  done: 'assignments.actionComplete',
}
/** Які кнопки швидкої дії показувати для поточного статусу: завершене —
 *  жодної (термінальний стан), інакше — усі, крім тієї, що дублює вже
 *  активний статус (безглуздо "розпочати" вже розпочате чи "паузити" вже
 *  призупинене). */
function visibleQuickActions(status: AssignmentStatus): QuickActionStatus[] {
  if (status === 'done' || status === 'cancelled') return []
  return QUICK_ACTION_STATUSES.filter(s => s !== status)
}

/** Компактна іконка пріоритету на картці завдання (замість текстової бейджі) —
 *  колір узгоджений з PRIORITY_STYLE, форма та сама для всіх рівнів. */
function PriorityIcon({ priority }: { priority: AssignmentPriority }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: PRIORITY_STYLE[priority].text }}>
      <path d="M4 7L8 3l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4 9.5h8M4 12.5h5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
}

const EVENT_LABEL_KEY: Record<AssignmentEventType, TranslationKey> = {
  created: 'assignmentEvent.created',
  status_changed: 'assignmentEvent.statusChanged',
  duration_changed: 'assignmentEvent.durationChanged',
  cost_changed: 'assignmentEvent.costChanged',
  priority_changed: 'assignmentEvent.priorityChanged',
  due_date_changed: 'assignmentEvent.dueDateChanged',
  product_changed: 'assignmentEvent.productChanged',
  planned_duration_changed: 'assignmentEvent.plannedDurationChanged',
  name_changed: 'assignmentEvent.nameChanged',
  assignee_changed: 'assignmentEvent.assigneeChanged',
}

/** 'product_changed' пише тригер у базі і для зміни продукту, і для зміни
 *  операції (одним рядком, з обома id в old/new_value) — тут розрізняємо, що
 *  саме змінилось, щоб напис в "Історії" був точним, без ще однієї міграції. */
function assignmentEventLabelKey(ev: { eventType: AssignmentEventType; oldValue: unknown; newValue: unknown }): TranslationKey {
  if (ev.eventType !== 'product_changed') return EVENT_LABEL_KEY[ev.eventType]
  const old = ev.oldValue as { product_id?: string | null; operation_id?: string | null } | null
  const next = ev.newValue as { product_id?: string | null; operation_id?: string | null } | null
  const productChanged = (old?.product_id ?? null) !== (next?.product_id ?? null)
  const operationChanged = (old?.operation_id ?? null) !== (next?.operation_id ?? null)
  if (productChanged && operationChanged) return 'assignmentEvent.productAndOperationChanged'
  if (operationChanged) return 'assignmentEvent.operationChanged'
  return 'assignmentEvent.productChanged'
}

interface Filters {
  assigneeId: string | null
  status: AssignmentStatus | null
  productId: string | null
  /** "YYYY-MM" завершеного зарплатного місяця — лише реальні періоди, в яких є завдання */
  periodKey: string | null
  /** Показувати завершені завдання з минулих місяців (за замовчуванням приховані) */
  showArchived: boolean
}

const EMPTY_FILTERS: Filters = { assigneeId: null, status: null, productId: null, periodKey: null, showArchived: false }

type SortKey = 'name' | 'priority' | 'createdAt'
const PRIORITY_RANK: Record<AssignmentPriority, number> = { low: 0, medium: 1, high: 2, urgent: 3 }
const MONTH_LABEL: string[] = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня']

export default function AssignmentsPage() {
  const { t, tn } = useLocale()
  const { data: currentUser } = useCurrentUser()
  // Адмін успадковує права менеджера скрізь у застосунку (те саме правило, що й у Shell.tsx) —
  // тож на "Завданнях" теж бачить усі завдання команди й фільтр за виконавцем, а не лише свої.
  const isManager = currentUser?.role === 'manager' || currentUser?.role === 'admin'

  const assignmentsQ = useAssignments()
  const productsQ = useProducts()
  const { operations } = useCatalog()
  const usersQ = useUsers()
  const payrollSettingsQ = usePayrollSettings()
  const payrollClosuresQ = usePayrollClosures()
  const { updateAssignment: quickUpdateAssignment } = useAssignmentMutations()

  const products = productsQ.data ?? []
  const users = usersQ.data ?? []
  const all = assignmentsQ.data ?? []
  const payrollSettings = payrollSettingsQ.data ?? { openFromDay: null, openToDay: null }
  const payrollClosures = payrollClosuresQ.data ?? []
  const payrollConfigured = payrollSettings.openToDay !== null

  const [search, setSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const [formOpen, setFormOpen] = useState(false)
  const [detail, setDetail] = useState<Assignment | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2200) }

  // Той самий доступ, що й у деталях завдання: виконавець своїх, менеджер/адмін — усіх;
  // завершене й заблоковане (день завершення минув) — статус більше не змінити.
  const canEditStatusFor = (a: Assignment) => (isManager || a.assigneeId === currentUser?.id) && !isAssignmentLocked(a)

  // Quick-action одразу на картці списку — той самий виклик, що й у деталях
  // завдання: міняє лише статус (фактичний час хук довраховує сам при виході
  // зі стану "в роботі"), відкривати картку деталей для цього не потрібно.
  const quickStatus = async (a: Assignment, newStatus: AssignmentStatus) => {
    await quickUpdateAssignment({
      id: a.id,
      prevStatus: a.status,
      prevStatusChangedAt: a.statusChangedAt,
      newStatus,
      durationMinutes: a.durationMinutes,
    })
    showToast(t('materials.toastSaved'))
  }

  // Реальні зарплатні періоди, в яких є хоч одне завершене завдання — для фільтра
  // "Зарплатний період" (лише якщо адмін узагалі налаштував правило в Налаштуваннях).
  const periodOptions = (() => {
    if (!payrollConfigured) return []
    const seen = new Map<string, { year: number; month: number }>()
    for (const a of all) {
      if (a.status !== 'done' || a.completedAt === null) continue
      const { year, month } = kyivDateParts(a.completedAt)
      seen.set(`${year}-${month}`, { year, month })
    }
    return [...seen.entries()].sort((x, y) => y[0].localeCompare(x[0]))
  })()

  let list = all
  const q = search.trim().toLowerCase()
  if (q) list = list.filter(a => a.name.toLowerCase().includes(q) || a.productName.toLowerCase().includes(q) || a.operationName.toLowerCase().includes(q))
  if (filters.assigneeId) list = list.filter(a => a.assigneeId === filters.assigneeId)
  if (filters.status) list = list.filter(a => a.status === filters.status)
  if (filters.productId) list = list.filter(a => a.productId === filters.productId)
  if (filters.periodKey) list = list.filter(a => {
    if (a.status !== 'done' || a.completedAt === null) return false
    const { year, month } = kyivDateParts(a.completedAt)
    return `${year}-${month}` === filters.periodKey
  })
  // Завершені в минулих місяцях ховаються з листа, поки не увімкнено фільтром.
  if (!filters.showArchived) list = list.filter(a => !isArchivedCompleted(a))

  list = [...list].sort((a, b) => {
    const cmp = sortKey === 'name' ? a.name.localeCompare(b.name, 'uk')
      : sortKey === 'createdAt' ? a.createdAt - b.createdAt
      : PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    return sortDir === 'asc' ? cmp : -cmp
  })

  const activeFilterCount = [filters.assigneeId, filters.status, filters.productId, filters.periodKey, filters.showArchived].filter(Boolean).length
  const productOptions = [...products].sort((a, b) => a.name.localeCompare(b.name, 'uk'))
  const archivedCount = all.filter(isArchivedCompleted).length

  /** Діапазон дат зарплатного періоду, до якого належить завершене завдання —
   *  лише для показу на картці, не впливає на права редагування (те рахує
   *  computePayrollPeriodStatus в AssignmentDetailSheet). */
  const formatPeriodRange = (a: Assignment): string | null => {
    if (a.status !== 'done' || a.completedAt === null || payrollSettings.openToDay === null) return null
    const { year, month } = kyivDateParts(a.completedAt)
    const daysInMonth = new Date(year, month, 0).getDate()
    const startDay = payrollSettings.openFromDay ?? 1
    const endDay = Math.min(payrollSettings.openToDay, daysInMonth)
    const fmt = (d: number) => `${d}.${String(month).padStart(2, '0')}.${year}`
    return `${fmt(startDay)}–${fmt(endDay)}`
  }

  // Деталі завдання — повноцінна сторінка (той самий патерн, що й
  // ProductView/DrilldownPage), а не модальне вікно поверх списку.
  if (detail && currentUser) {
    return (
      <AssignmentDetailPage
        assignment={detail}
        currentUser={currentUser}
        isManager={!!isManager}
        products={products}
        operations={operations}
        users={users}
        onBack={() => setDetail(null)}
        onSaved={() => showToast(t('materials.toastSaved'))}
        onDeleted={() => { setDetail(null); showToast(t('assignments.toastDeleted')) }}
      />
    )
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Toast */}
      <div className="pointer-events-none fixed top-5 left-1/2 z-50 -translate-x-1/2 transition-all duration-300"
        style={{ opacity: toast ? 1 : 0, transform: `translateX(-50%) translateY(${toast ? 0 : -12}px)` }}>
        <div className="flex items-center gap-2 rounded-2xl bg-slate-800 px-5 py-3 text-sm font-medium text-white shadow-xl">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M2.5 7.5l3.5 3.5 6.5-7" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {toast}
        </div>
      </div>

      <div className="px-4 pt-5 pb-3">
        <div className="flex items-start justify-between mb-1">
          <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl text-slate-800">{t('nav.tasks')}</h1>
          <button onClick={() => setFormOpen(true)}
            className="flex items-center gap-1.5 rounded-2xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white active:scale-95 transition-all shrink-0 mt-1">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            {t('assignments.newTask')}
          </button>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs text-slate-400">
            {isManager ? t('assignments.allTeamTasks') : t('assignments.yourTasks')} · {list.length}
          </p>
          {archivedCount > 0 && (
            <button onClick={() => setFilters(f => ({ ...f, showArchived: !f.showArchived }))}
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all"
              style={filters.showArchived ? { background: '#1e293b', color: '#fff' } : { background: '#f1f5f9', color: '#64748b' }}>
              {filters.showArchived ? t('materials.toActive') : t('materials.archiveWithCount', { count: archivedCount })}
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input type="search" placeholder={t('assignments.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
          </div>
          <button onClick={() => setFilterOpen(v => !v)}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all active:scale-90"
            style={filterOpen || activeFilterCount > 0
              ? { background: '#1e293b', border: '1px solid #1e293b', color: 'white' }
              : { background: 'white', border: '1px solid rgba(157,200,255,0.3)', color: '#64748b' }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M1.5 3.5h12M4 7.5h7M6.5 11.5h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {filterOpen && (
          <div className="mb-3 rounded-2xl bg-white p-4 space-y-3" style={{ border: '1px solid rgba(157,200,255,0.3)', boxShadow: '0 2px 12px rgba(157,200,255,0.1)' }}>
            {isManager && (
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{t('assignments.workersLabel')}</label>
                <select value={filters.assigneeId ?? ''} onChange={e => setFilters(f => ({ ...f, assigneeId: e.target.value || null }))}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-all">
                  <option value="">{t('filters.all')}</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{t('assignments.statusLabel')}</label>
              <select value={filters.status ?? ''} onChange={e => setFilters(f => ({ ...f, status: (e.target.value || null) as AssignmentStatus | null }))}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-all">
                <option value="">{t('filters.all')}</option>
                <option value="pending">{t('assignmentStatus.pending')}</option>
                <option value="in_progress">{t('assignmentStatus.inProgress')}</option>
                <option value="paused">{t('assignmentStatus.paused')}</option>
                <option value="done">{t('assignmentStatus.done')}</option>
                <option value="cancelled">{t('assignmentStatus.cancelled')}</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{t('assignments.product')}</label>
              <select value={filters.productId ?? ''} onChange={e => setFilters(f => ({ ...f, productId: e.target.value || null }))}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-all">
                <option value="">{t('filters.all')}</option>
                {productOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {payrollConfigured && (
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{t('payroll.settingsTitle')}</label>
                <select value={filters.periodKey ?? ''} onChange={e => setFilters(f => ({ ...f, periodKey: e.target.value || null }))}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-all">
                  <option value="">{t('payroll.choosePeriodPlaceholder')}</option>
                  {periodOptions.map(([key, { year, month }]) => (
                    <option key={key} value={key}>{MONTH_LABEL[month - 1]} {year}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{t('filters.sort')}</label>
              <div className="flex gap-1.5">
                {([['name', t('assignments.sortByName')], ['priority', t('assignments.priorityLabel')], ['createdAt', t('assignments.sortByCreatedAt')]] as [SortKey, string][]).map(([key, label]) => (
                  <button key={key} onClick={() => toggleSort(key)}
                    className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all active:scale-95"
                    style={sortKey === key ? { background: '#1e293b', color: 'white' } : { background: '#f1f5f9', color: '#64748b' }}>
                    {label}
                    {sortKey === key && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: sortDir === 'asc' ? 'none' : 'rotate(180deg)', transition: 'transform 0.2s' }}>
                        <path d="M2 6.5l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
            {activeFilterCount > 0 && (
              <button onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs text-red-400 font-medium hover:text-red-600 transition-colors">
                {t('assignments.reset')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="px-4 space-y-2 pb-8">
        {assignmentsQ.isLoading ? (
          <div className="py-10 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl bg-white py-12 text-center text-sm text-slate-400" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            {all.length === 0 ? t('assignments.empty') : t('common.notFound')}
          </div>
        ) : list.map(a => {
          const style = STATUS_STYLE[a.status]
          const period = formatPeriodRange(a)
          const canQuickAct = canEditStatusFor(a)
          return (
            <div key={a.id} className="rounded-2xl bg-white overflow-hidden"
              style={{ border: '1px solid rgba(157,200,255,0.22)', boxShadow: '0 1px 6px rgba(157,200,255,0.07)' }}>
              <div role="button" tabIndex={0} onClick={() => setDetail(a)} onKeyDown={e => e.key === 'Enter' && setDetail(a)}
                className="flex w-full items-center gap-3 px-4 pt-3.5 pb-3 text-left cursor-pointer">
                <div className="shrink-0 mt-0.5"><PriorityIcon priority={a.priority} /></div>
                <div className="flex-1 min-w-0">
                  {a.dueDate !== null && (
                    <p className="text-[10px] font-medium mt-0.5" style={{ color: '#3b82f6' }}>
                      {t('assignments.dueDateCardLabel')} {new Date(a.dueDate).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </p>
                  )}
                  <p className="text-sm font-medium text-slate-800 truncate">{a.name}</p>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{a.productName} · {tn(a.operationName, a.operationNameEn)}</p>
                  {period && <p className="text-[10px] text-slate-300 mt-0.5">{t('assignments.payrollPeriodPrefix')} {period}</p>}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {isManager && (
                    <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: '#eff6ff', color: '#2563eb' }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <circle cx="5" cy="3.2" r="1.8" stroke="currentColor" strokeWidth="1.2"/>
                        <path d="M1.5 9c0-2 1.6-3.2 3.5-3.2S8.5 7 8.5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                      {a.assigneeId ? a.assigneeName : t('assignments.unassigned')}
                    </span>
                  )}
                  <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: style.text }} />
                    {t(STATUS_LABEL_KEY[a.status])}
                  </span>
                </div>
              </div>

              {canQuickAct && visibleQuickActions(a.status).length > 0 && (
                <div className="flex">
                  {visibleQuickActions(a.status).map((s, i) => {
                    const sStyle = STATUS_STYLE[s]
                    return (
                      <button key={s} onClick={() => quickStatus(a, s)}
                        className="flex-1 py-2.5 text-xs font-semibold transition-all active:scale-[0.98]"
                        style={{ background: sStyle.bg, color: sStyle.text, borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.6)' : undefined }}>
                        {t(QUICK_ACTION_LABEL_KEY[s])}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {formOpen && currentUser && (
        <AssignmentFormSheet
          currentUser={currentUser}
          isManager={!!isManager}
          users={users}
          products={products}
          operations={operations}
          onClose={() => setFormOpen(false)}
          onCreated={() => { setFormOpen(false); showToast(t('assignments.toastCreated')) }}
        />
      )}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────
   Створення завдання: продукт → рекомендовані завдання
   (з наявних tasks продукту) або ручне заповнення → виконавець
   (менеджер обирає, виконавець — завжди собі) → витрачений час.
   Вартість (з шаблону) бачить лише менеджер.
─────────────────────────────────────────────────────────── */

/** Продукт уже обраний (кнопка "Завдання" на картці продукту в
 *  ProductCatalog.tsx) — сюди приходить `initialProductId`, форма одразу
 *  відкривається з ним, без кроку пошуку. */
export function AssignmentFormSheet({ currentUser, isManager, users, products, operations, initialProductId, onClose, onCreated }: {
  currentUser: CurrentUser
  isManager: boolean
  users: AppUser[]
  products: Product[]
  operations: Operation[]
  initialProductId?: string | null
  onClose: () => void
  onCreated: () => void
}) {
  const { t, tn } = useLocale()
  const { createAssignment, isSaving } = useAssignmentMutations()

  // При створенні завдання пропонуємо обрати лише активні продукти.
  const statusesQ = useProductStatuses()
  const activeStatusId = statusesQ.data?.find(s => s.code === 'active')?.id ?? null
  const activeProducts = products.filter(p => activeStatusId === null || p.statusId === activeStatusId)

  const [productSearch, setProductSearch] = useState('')
  const [productId, setProductId] = useState<string | null>(initialProductId ?? null)
  // Продукт не обов'язковий — можна створити завдання без нього й прив'язати пізніше
  // (з деталей завдання). Без продукту немає "рекомендованих завдань" — одразу вручну.
  const [productSkipped, setProductSkipped] = useState(false)
  const productTasksQ = useProductTasks(productId)
  const recommended = productTasksQ.data ?? []

  const [pickedTaskId, setPickedTaskId] = useState<string | null>(null)
  const [manualMode, setManualMode] = useState(false)
  const [operationId, setOperationId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [duration, setDuration] = useState('')
  const [cost, setCost] = useState<number | null>(null)
  const [assigneeId, setAssigneeId] = useState<string | null>(isManager ? null : currentUser.id)
  const [priority, setPriority] = useState<AssignmentPriority>('medium')
  const [dueDate, setDueDate] = useState('')
  const [plannedDuration, setPlannedDuration] = useState('')

  const selectedProduct = productId ? activeProducts.find(p => p.id === productId) ?? null : null
  const filteredProducts = activeProducts.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku.toLowerCase().includes(productSearch.toLowerCase()))

  const pickRecommended = (pt: ProductTask) => {
    setPickedTaskId(pt.id)
    setOperationId(pt.operationId)
    setName(pt.name)
    setDuration(pt.durationMinutes !== null ? String(pt.durationMinutes) : '')
    setCost(pt.cost)
    setManualMode(false)
  }

  const startManual = () => {
    setPickedTaskId(null); setOperationId(null); setName(''); setDuration(''); setCost(null)
    setManualMode(true)
  }

  const changeProduct = () => {
    setProductId(null)
    setPickedTaskId(null); setOperationId(null); setName(''); setDuration(''); setCost(null); setManualMode(false)
  }

  const skipProduct = () => { setProductSkipped(true); setPickedTaskId(null); setManualMode(true) }
  const chooseProductAfterAll = () => { setProductSkipped(false); setManualMode(false) }

  // Виконавця не обов'язково вказувати одразу — можна створити завдання без
  // нього й призначити пізніше з деталей завдання (лише менеджер/адмін бачить
  // і редагує такі "нічиї" завдання, поки виконавця не додано).
  const canConfirm = (productId !== null || productSkipped) && operationId !== null && name.trim().length > 0

  const handleConfirm = async () => {
    if (!canConfirm || !operationId) return
    await createAssignment({
      productId, operationId, taskId: pickedTaskId, name: name.trim(),
      assigneeId, assignedById: currentUser.id,
      durationMinutes: duration.trim() ? Number(duration) : null,
      plannedDurationMinutes: plannedDuration.trim() ? Number(plannedDuration) : null,
      cost, priority,
      dueDate: dueDate ? new Date(dueDate + 'T00:00:00').getTime() : null,
    })
    onCreated()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-3xl bg-white pt-2 pb-10 max-h-[92vh] overflow-y-auto sm:rounded-3xl sm:w-full sm:max-w-md">
        <div className="flex justify-center py-3">
          <button onClick={onClose} className="h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
        </div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="px-5 text-2xl text-slate-800 mb-4">{t('assignments.newTaskTitle')}</h2>

        <div className="px-5 space-y-5">
          {/* Продукт */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('assignments.product')}</label>
            {selectedProduct ? (
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <div className="h-9 w-9 shrink-0 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center text-slate-400">
                  {selectedProduct.photo ? <img src={selectedProduct.photo} alt="" className="h-full w-full object-cover" /> : <span className="text-xs">📦</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{selectedProduct.name}</p>
                  <p className="text-xs font-mono text-slate-400">{selectedProduct.sku}</p>
                </div>
                <button onClick={changeProduct} className="text-xs text-blue-500 font-medium shrink-0">{t('common.change')}</button>
              </div>
            ) : productSkipped ? (
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-500">{t('assignments.noProductChosen')}</span>
                <button onClick={chooseProductAfterAll} className="text-xs text-blue-500 font-medium shrink-0">{t('assignments.chooseProductLink')}</button>
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  <input type="search" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder={t('assignments.searchProductPlaceholder')}
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {filteredProducts.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-400">{activeProducts.length === 0 ? t('materials.noActiveProducts') : t('operationPicker.notFoundShort')}</p>
                  ) : filteredProducts.map(p => (
                    <button key={p.id} onClick={() => setProductId(p.id)}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                      style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
                      <div className="h-8 w-8 shrink-0 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center text-slate-400">
                        {p.photo ? <img src={p.photo} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="text-xs">📦</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                        <p className="text-xs font-mono text-slate-400">{p.sku}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <button onClick={skipProduct} className="mt-2 text-xs text-blue-500 font-medium hover:underline">
                  {t('assignments.skipProductLink')}
                </button>
              </>
            )}
          </div>

          {/* Рекомендовані завдання / вручну — без продукту рекомендацій немає, одразу вручну */}
          {(selectedProduct || productSkipped) && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('operationPicker.taskLabel')}</label>
              {selectedProduct && !manualMode && recommended.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {recommended.map(pt => {
                    const op = operations.find(o => o.id === pt.operationId)
                    const active = pickedTaskId === pt.id
                    return (
                      <button key={pt.id} onClick={() => pickRecommended(pt)}
                        className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition-all"
                        style={active ? { background: '#fff7ed', border: '1px solid #fdba74' } : { background: 'white', border: '1px solid rgba(157,200,255,0.2)' }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{pt.name}</p>
                          <p className="text-xs text-slate-400 truncate">{op ? tn(op.name, op.nameEn) : '—'}</p>
                        </div>
                        {pt.durationMinutes !== null && <span className="text-xs text-slate-400 shrink-0">{pt.durationMinutes} {t('common.minutesShort')}</span>}
                      </button>
                    )
                  })}
                </div>
              )}
              {selectedProduct && recommended.length === 0 && !manualMode && (
                <p className="text-xs text-slate-400 mb-2">{t('assignments.noReadyTasksHint')}</p>
              )}
              {selectedProduct && !manualMode ? (
                <button onClick={startManual} className="text-xs text-blue-500 font-medium hover:underline">
                  {t('assignments.specifyManually')}
                </button>
              ) : (
                <div className="rounded-2xl border border-slate-200 p-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-slate-400 uppercase tracking-wide">{t('common.operation')}</label>
                    <select value={operationId ?? ''} onChange={e => {
                      const id = e.target.value || null
                      setOperationId(id)
                      // Назва завдання одразу підставляється з назви операції, можна відредагувати.
                      const op = id ? operations.find(o => o.id === id) : null
                      setName(op ? tn(op.name, op.nameEn) : '')
                    }}
                      className="w-full appearance-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all">
                      <option value="">{t('assignments.selectOperationPlaceholder')}</option>
                      {operations.map(o => <option key={o.id} value={o.id}>{tn(o.name, o.nameEn)}</option>)}
                    </select>
                  </div>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('operationPicker.taskNamePlaceholder')}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all" />
                  {selectedProduct && recommended.length > 0 && (
                    <button onClick={() => setManualMode(false)} className="text-xs text-slate-500 hover:underline">{t('assignments.selectFromRecommended')}</button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Виконавець */}
          {(selectedProduct || productSkipped) && operationId && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('assignments.assigneeLabel')}</label>
              {isManager ? (
                <>
                  <select value={assigneeId ?? ''} onChange={e => setAssigneeId(e.target.value || null)}
                    className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
                    <option value="">{t('assignments.selectAssigneePlaceholder')}</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                  </select>
                  {assigneeId === null && <p className="mt-1.5 text-xs text-slate-400">{t('assignments.assigneeOptionalHint')}</p>}
                </>
              ) : (
                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{currentUser.fullName} {t('assignments.youSuffix')}</p>
              )}
            </div>
          )}

          {/* Витрачений час */}
          {(selectedProduct || productSkipped) && operationId && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('assignments.spentTimeLabel')}</label>
              <input type="number" min="0" step="any" value={duration} onChange={e => setDuration(e.target.value)} placeholder="0"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
              {isManager && cost !== null && (
                <p className="mt-1.5 text-xs text-slate-400">{t('assignments.templateCost', { cost })}</p>
              )}
            </div>
          )}

          {/* Пріоритет і дата виконання */}
          {(selectedProduct || productSkipped) && operationId && (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('assignments.priorityLabel')}</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {PRIORITIES.map(p => {
                    const style = PRIORITY_STYLE[p]
                    const active = priority === p
                    return (
                      <button key={p} type="button" onClick={() => setPriority(p)}
                        className="rounded-xl py-2 text-[11px] font-medium transition-all"
                        style={active ? { background: style.text, color: '#fff' } : { background: style.bg, color: style.text }}>
                        {t(PRIORITY_LABEL_KEY[p])}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('assignments.dueDateLabel')}</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('assignments.plannedTimeLabel')}</label>
                <input type="number" min="0" step="any" value={plannedDuration} onChange={e => setPlannedDuration(e.target.value)} placeholder="0"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 mt-6 px-5">
          <button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm text-slate-600">{t('common.cancel')}</button>
          <button onClick={handleConfirm} disabled={!canConfirm || isSaving}
            className="flex-1 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition-all">
            {isSaving ? t('employees.creating') : t('employees.create')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────
   Деталі завдання — повноцінна сторінка (не модальне вікно):
   quick-actions статусу вгорі, ⋮-меню (Історія/Скасувати), нижче —
   поля пріоритету/дедлайну/планового й фактичного часу/вартості.
─────────────────────────────────────────────────────────── */

function BackChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function AssignmentDetailPage({ assignment, currentUser, isManager, products, operations, users, onBack, onSaved, onDeleted }: {
  assignment: Assignment
  currentUser: CurrentUser
  isManager: boolean
  products: Product[]
  operations: Operation[]
  users: AppUser[]
  onBack: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const { t, tn } = useLocale()
  const { updateAssignment, removeAssignment, isSaving } = useAssignmentMutations()
  const payrollSettingsQ = usePayrollSettings()
  const payrollClosuresQ = usePayrollClosures()
  const [view, setView] = useState<'detail' | 'history'>('detail')
  const [menuOpen, setMenuOpen] = useState(false)
  const eventsQ = useAssignmentEvents(view === 'history' ? assignment.id : null)

  const [name, setName] = useState(assignment.name)
  const initialDuration = assignment.durationMinutes !== null ? String(assignment.durationMinutes) : ''
  const [duration, setDuration] = useState(initialDuration)
  const initialCost = assignment.cost !== null ? String(assignment.cost) : ''
  const [cost, setCost] = useState(initialCost)
  const [priority, setPriority] = useState<AssignmentPriority>(assignment.priority)
  const initialDueDate = assignment.dueDate !== null ? new Date(assignment.dueDate).toISOString().slice(0, 10) : ''
  const [dueDate, setDueDate] = useState(initialDueDate)
  const initialPlannedDuration = assignment.plannedDurationMinutes !== null ? String(assignment.plannedDurationMinutes) : ''
  const [plannedDuration, setPlannedDuration] = useState(initialPlannedDuration)
  const [productId, setProductId] = useState<string | null>(assignment.productId)
  const [operationId, setOperationId] = useState<string | null>(assignment.operationId)
  const [assigneeId, setAssigneeId] = useState<string | null>(assignment.assigneeId)
  const [productPickerOpen, setProductPickerOpen] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const linkedProduct = productId ? products.find(p => p.id === productId) ?? null : null
  const linkedAssignee = assigneeId ? users.find(u => u.id === assigneeId) ?? null : null
  const filteredPickerProducts = products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku.toLowerCase().includes(productSearch.toLowerCase()))

  const hasAccess = isManager || assignment.assigneeId === currentUser.id

  // Статус — стара логіка без змін: завершене завдання можна змінювати статусом
  // лише в день завершення (те саме перевіряє тригер у базі).
  const locked = isAssignmentLocked(assignment)
  const canEditStatus = hasAccess && !locked

  // Час/вартість завершеного завдання — нове правило зарплатного періоду:
  // день завершення АБО останній день періоду (поки не налаштовано — лише день
  // завершення, як і раніше); закритий період — ніколи. Не завершене — без обмежень.
  const payrollSettings = payrollSettingsQ.data ?? { openFromDay: null, openToDay: null }
  const payrollClosures = payrollClosuresQ.data ?? []
  const payrollStatus = assignment.status === 'done' && assignment.completedAt !== null
    ? computePayrollPeriodStatus(assignment.completedAt, payrollSettings, payrollClosures)
    : null
  const canEditTimeCost = hasAccess && (payrollStatus === null || payrollStatus.canEditTimeCost)

  // Видалити можна лише поки завдання ще "В очікуванні" (узгоджено з RLS-політикою видалення).
  const canDelete = (isManager || assignment.assignedById === currentUser.id) && assignment.status === 'pending'
  const dirty = duration !== initialDuration || cost !== initialCost || plannedDuration !== initialPlannedDuration
    || priority !== assignment.priority || dueDate !== initialDueDate
    || productId !== assignment.productId || operationId !== assignment.operationId
    || name.trim() !== assignment.name || assigneeId !== assignment.assigneeId

  // Швидка дія статусу (Розпочати/Пауза/Завершити/Скасувати) — окремо від
  // форми нижче: одразу зберігає лише статус (і фактичний час, який хук сам
  // довраховує при виході зі стану "в роботі") і повертає на список.
  const quickStatus = async (newStatus: AssignmentStatus) => {
    await updateAssignment({
      id: assignment.id,
      prevStatus: assignment.status,
      prevStatusChangedAt: assignment.statusChangedAt,
      newStatus,
      durationMinutes: assignment.durationMinutes,
    })
    onSaved()
    onBack()
  }

  const save = async () => {
    await updateAssignment({
      id: assignment.id,
      prevStatus: assignment.status,
      prevStatusChangedAt: assignment.statusChangedAt,
      newStatus: assignment.status,
      durationMinutes: duration.trim() ? Number(duration) : null,
      plannedDurationMinutes: plannedDuration.trim() ? Number(plannedDuration) : null,
      cost: cost.trim() ? Number(cost) : null,
      priority,
      dueDate: dueDate ? new Date(dueDate + 'T00:00:00').getTime() : null,
      productId, operationId,
      name: name.trim(),
      assigneeId,
    })
    onSaved()
    onBack()
  }

  const del = () => {
    removeAssignment(assignment.id)
    onDeleted()
  }

  const canCancel = canEditStatus && assignment.status !== 'cancelled' && assignment.status !== 'done'

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="px-4 pt-5 pb-3">
        <button onClick={view === 'history' ? () => setView('detail') : onBack}
          className="mb-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95 transition-all">
          <BackChevron />
        </button>

        {view === 'detail' ? (
          /* Шапка + quick-actions статусу — одна картка, як у макеті: назва
             завдання й керування статусом об'єднані візуально. */
          <div className="rounded-2xl bg-white" style={{ border: '1px solid rgba(157,200,255,0.22)', boxShadow: '0 1px 6px rgba(157,200,255,0.07)' }}>
            <div className="flex items-start gap-3 px-4 pt-4 pb-3">
              <div className="shrink-0 mt-1.5"><PriorityIcon priority={assignment.priority} /></div>
              <div className="flex-1 min-w-0">
                <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-slate-800 truncate">{name || assignment.name}</h1>
                <p className="text-xs text-slate-400 truncate">{assignment.productName} · {tn(assignment.operationName, assignment.operationNameEn)}</p>
              </div>
              <div className="relative shrink-0">
                <button onClick={() => setMenuOpen(v => !v)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95 transition-all">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <circle cx="7" cy="2.3" r="1.3"/><circle cx="7" cy="7" r="1.3"/><circle cx="7" cy="11.7" r="1.3"/>
                  </svg>
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-11 z-20 w-44 rounded-2xl bg-white p-1.5"
                      style={{ border: '1px solid rgba(157,200,255,0.25)', boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}>
                      <button onClick={() => { setView('history'); setMenuOpen(false) }}
                        className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                        {t('assignments.menuHistory')}
                      </button>
                      {canCancel && (
                        <button onClick={() => { setMenuOpen(false); quickStatus('cancelled') }}
                          className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 transition-colors">
                          {t('assignments.menuCancel')}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Quick-actions статусу — одразу зберігають і повертають на список. Кнопка,
                що дублює вже активний статус, не показується; завершене завдання — без
                жодної (термінальний стан). */}
            {visibleQuickActions(assignment.status).length > 0 && (
              <div className="flex overflow-hidden rounded-b-2xl">
                {visibleQuickActions(assignment.status).map((s, i) => {
                  const style = STATUS_STYLE[s]
                  return (
                    <button key={s} onClick={() => quickStatus(s)} disabled={!canEditStatus}
                      className="flex-1 py-3 text-xs font-semibold transition-all disabled:opacity-50"
                      style={{ background: style.bg, color: style.text, borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.6)' : undefined }}>
                      {t(QUICK_ACTION_LABEL_KEY[s])}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div>
            <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-slate-800 truncate">{t('assignments.historyTab')}</h1>
            <p className="text-xs text-slate-400 truncate">{assignment.name}</p>
          </div>
        )}
      </div>

      {view === 'history' ? (
        <div className="px-4 pb-8 space-y-2">
          {eventsQ.isLoading ? (
            <p className="py-8 text-center text-sm text-slate-400">{t('common.loading')}</p>
          ) : (eventsQ.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{t('assignments.noHistoryYet')}</p>
          ) : (eventsQ.data ?? []).map(ev => (
            <div key={ev.id} className="rounded-2xl bg-white px-4 py-3" style={{ border: '1px solid rgba(157,200,255,0.22)' }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">{t(assignmentEventLabelKey(ev))}</span>
                <span className="text-[10px] text-slate-400">
                  {new Date(ev.occurredAt).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{ev.actorName}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 pb-8 space-y-5">
            {locked && (
              <div className="rounded-2xl px-4 py-3 text-xs" style={{ background: '#f1f5f9', color: '#64748b' }}>
                {t('assignments.lockedHint')}
              </div>
            )}
            {payrollStatus && payrollStatus.phase !== 'not_configured' && (
              <div className="rounded-2xl px-4 py-3 text-xs" style={{
                background: payrollStatus.phase === 'closed' ? '#fee2e2' : payrollStatus.phase === 'grace_day' ? '#fff7ed' : '#f1f5f9',
                color: payrollStatus.phase === 'closed' ? '#dc2626' : payrollStatus.phase === 'grace_day' ? '#ea580c' : '#64748b',
              }}>
                {t(payrollStatus.phase === 'closed' ? 'payroll.periodStatusClosed'
                  : payrollStatus.phase === 'grace_day' ? 'payroll.periodStatusGraceDay'
                  : payrollStatus.phase === 'awaiting_closure' ? 'payroll.periodStatusAwaitingClosure'
                  : 'payroll.periodStatusActive')}
              </div>
            )}

            {/* Зведення — одна картка з тонкими розділювачами між рядками (як у макеті),
                замість окремих "пігулок". Продукт тут — лише інформаційний рядок, без
                можливості змінити (редагування — нижче, у блоці "Дані для менеджера"). */}
            <div className="rounded-2xl bg-white overflow-hidden divide-y divide-slate-100" style={{ border: '1px solid rgba(157,200,255,0.22)', boxShadow: '0 1px 6px rgba(157,200,255,0.07)' }}>
              {isManager && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-slate-400">{t('assignments.assigneeLabel')}</span>
                  <span className="text-sm font-medium text-slate-700">{linkedAssignee ? linkedAssignee.fullName : t('assignments.unassigned')}</span>
                </div>
              )}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-slate-400">{t('assignments.assignedBy')}</span>
                <span className="text-sm font-medium text-slate-700">{assignment.assignedByName}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-slate-400">{t('assignments.spentTimeLabel')}</span>
                <span className="text-sm font-medium text-slate-700">{assignment.durationMinutes ?? 0} {t('common.minutesShort')}</span>
              </div>
              {isManager && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-slate-400">{t('assignments.costLabel')}</span>
                  <span className="text-sm font-medium text-slate-700">{assignment.cost !== null ? `${assignment.cost} ₴` : '—'}</span>
                </div>
              )}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-slate-400">{t('assignments.product')}</span>
                <span className="text-sm font-medium text-slate-700 truncate">{linkedProduct ? linkedProduct.name : t('assignments.noProductChosen')}</span>
              </div>
            </div>

            {/* "Дані для менеджера" — пріоритет, дедлайн, плановий час і зміна продукту:
                бачить лише менеджер/адмін, виконавцю цей блок узагалі не показуємо. */}
            {isManager && (
              <>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('assignments.managerDataSection')}</label>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('assignments.nameLabel')}</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} disabled={!canEditStatus}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-50" />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('assignments.assigneeLabel')}</label>
                  <select value={assigneeId ?? ''} onChange={e => setAssigneeId(e.target.value || null)} disabled={!canEditStatus}
                    className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-50">
                    <option value="">{t('assignments.selectAssigneePlaceholder')}</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                  </select>
                  {assigneeId === null && <p className="mt-1.5 text-xs text-slate-400">{t('assignments.assigneeOptionalHint')}</p>}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('assignments.product')}</label>
                  {linkedProduct ? (
                    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                      <div className="h-9 w-9 shrink-0 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center text-slate-400">
                        {linkedProduct.photo ? <img src={linkedProduct.photo} alt="" className="h-full w-full object-cover" /> : <span className="text-xs">📦</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{linkedProduct.name}</p>
                        <p className="text-xs font-mono text-slate-400">{linkedProduct.sku}</p>
                      </div>
                      {canEditStatus && (
                        <button onClick={() => setProductPickerOpen(true)} className="text-xs text-blue-500 font-medium shrink-0">{t('common.change')}</button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                      <span className="text-sm text-slate-500">{t('assignments.noProductChosen')}</span>
                      {canEditStatus && (
                        <button onClick={() => setProductPickerOpen(true)} className="text-xs text-blue-500 font-medium shrink-0">{t('assignments.linkProductLink')}</button>
                      )}
                    </div>
                  )}
                  {productPickerOpen && (
                    <div className="mt-2 rounded-2xl border border-slate-200 p-3 space-y-2">
                      <input type="search" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder={t('assignments.searchProductPlaceholder')}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 transition-all" />
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {filteredPickerProducts.length === 0 ? (
                          <p className="py-2 text-center text-xs text-slate-400">{t('operationPicker.notFoundShort')}</p>
                        ) : filteredPickerProducts.map(p => (
                          <button key={p.id} onClick={() => { setProductId(p.id); setProductPickerOpen(false); setProductSearch('') }}
                            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left hover:bg-slate-50 transition-colors" style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
                            <span className="text-sm text-slate-800 truncate flex-1">{p.name}</span>
                            <span className="text-xs font-mono text-slate-400 shrink-0">{p.sku}</span>
                          </button>
                        ))}
                      </div>
                      <button onClick={() => { setProductPickerOpen(false); setProductSearch('') }} className="text-xs text-slate-400 hover:underline">{t('common.cancel')}</button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('assignments.operationLabel')}</label>
                  <select value={operationId ?? ''} onChange={e => setOperationId(e.target.value || null)} disabled={!canEditStatus}
                    className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-50">
                    <option value="">{t('assignments.selectOperationPlaceholder')}</option>
                    {operations.map(o => <option key={o.id} value={o.id}>{tn(o.name, o.nameEn)}</option>)}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('assignments.priorityLabel')}</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {PRIORITIES.map(p => {
                      const style = PRIORITY_STYLE[p]
                      const active = priority === p
                      return (
                        <button key={p} onClick={() => canEditStatus && setPriority(p)} disabled={!canEditStatus}
                          className="rounded-xl py-2 text-[11px] font-medium transition-all disabled:opacity-50"
                          style={active ? { background: style.text, color: '#fff' } : { background: style.bg, color: style.text }}>
                          {t(PRIORITY_LABEL_KEY[p])}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('assignments.dueDateLabel')}</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={!canEditStatus}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-50" />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('assignments.plannedTimeLabel')}</label>
                  <input type="number" min="0" step="any" value={plannedDuration} onChange={e => setPlannedDuration(e.target.value)} disabled={!canEditStatus} placeholder="0"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-50" />
                </div>
              </>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('assignments.spentTimeLabel')}</label>
              <input type="number" min="0" step="any" value={duration} onChange={e => setDuration(e.target.value)} disabled={!canEditTimeCost} placeholder="0"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-50" />
              <p className="mt-1.5 text-xs text-slate-400">
                {t('assignments.timeAutoHint')}
              </p>
            </div>

            {assignment.completedAt !== null && (
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <span className="text-xs text-slate-400">{t('assignmentStatus.done')}</span>
                <span className="text-sm font-medium text-slate-700">
                  {new Date(assignment.completedAt).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}

            {isManager && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('assignments.costLabel')}</label>
                <input type="number" min="0" step="any" value={cost} onChange={e => setCost(e.target.value)} disabled={!canEditTimeCost} placeholder="0"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-50" />
              </div>
            )}

          <div className="flex gap-3 mt-6">
            {canDelete && (
              <button onClick={del} className="flex items-center justify-center rounded-2xl border border-red-200 px-4 py-3.5 text-sm text-red-500">
                {t('common.delete')}
              </button>
            )}
            <button onClick={onBack} className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm text-slate-600">{t('common.close')}</button>
            {(canEditStatus || canEditTimeCost) && (
              <button onClick={save} disabled={!dirty || isSaving || !name.trim()}
                className="flex-1 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition-all">
                {isSaving ? t('common.saving') : t('common.save')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
