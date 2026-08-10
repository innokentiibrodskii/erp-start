import { useState } from 'react'
import { useCurrentUser, type CurrentUser } from './hooks/useCurrentUser'
import { useUsers, type AppUser } from './hooks/useUsers'
import { useProducts, useProductStatuses } from './hooks/useProducts'
import type { Product } from './hooks/useProducts'
import { useCatalog } from './hooks/useCatalog'
import type { Operation } from './hooks/useCatalog'
import { useProductTasks, type ProductTask } from './hooks/useProductOperations'
import { useAssignments, useAssignmentMutations, isAssignmentLocked, isArchivedCompleted, type Assignment, type AssignmentStatus } from './hooks/useAssignments'

/* ───────────────────────────────────────────────────────────
   Сторінка "Завдання" для виконавців. Видимість рядків керується
   RLS у базі (виконавець бачить лише свої, менеджер — усі), тому
   тут просто рендеримо те, що прийшло з useAssignments().
─────────────────────────────────────────────────────────── */

const STATUS_LABEL: Record<AssignmentStatus, string> = {
  pending: 'В очікуванні',
  in_progress: 'В роботі',
  paused: 'Перерва',
  done: 'Завершено',
  cancelled: 'Скасовано',
}

const STATUS_STYLE: Record<AssignmentStatus, { bg: string; text: string }> = {
  pending: { bg: '#e0f2fe', text: '#0284c7' },
  in_progress: { bg: '#dbeafe', text: '#2563eb' },
  paused: { bg: '#fef3c7', text: '#d97706' },
  done: { bg: '#dcfce7', text: '#16a34a' },
  cancelled: { bg: '#f1f5f9', text: '#64748b' },
}

interface Filters {
  assigneeId: string | null
  productId: string | null
  operationId: string | null
  status: AssignmentStatus | null
  /** Показувати завершені завдання з минулих місяців (за замовчуванням приховані) */
  showArchived: boolean
}

const EMPTY_FILTERS: Filters = { assigneeId: null, productId: null, operationId: null, status: null, showArchived: false }

export default function AssignmentsPage() {
  const { data: currentUser } = useCurrentUser()
  const isManager = currentUser?.role === 'manager'

  const assignmentsQ = useAssignments()
  const productsQ = useProducts()
  const { operations } = useCatalog()
  const usersQ = useUsers()

  const products = productsQ.data ?? []
  const users = usersQ.data ?? []
  const all = assignmentsQ.data ?? []

  const [search, setSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [formOpen, setFormOpen] = useState(false)
  const [detail, setDetail] = useState<Assignment | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const showToast = (t: string) => { setToast(t); setTimeout(() => setToast(null), 2200) }

  let list = all
  const q = search.trim().toLowerCase()
  if (q) list = list.filter(a => a.name.toLowerCase().includes(q) || a.productName.toLowerCase().includes(q) || a.operationName.toLowerCase().includes(q))
  if (filters.assigneeId) list = list.filter(a => a.assigneeId === filters.assigneeId)
  if (filters.productId) list = list.filter(a => a.productId === filters.productId)
  if (filters.operationId) list = list.filter(a => a.operationId === filters.operationId)
  if (filters.status) list = list.filter(a => a.status === filters.status)
  // Завершені в минулих місяцях ховаються з листа, поки не увімкнено фільтром.
  if (!filters.showArchived) list = list.filter(a => !isArchivedCompleted(a))

  const activeFilterCount = [filters.assigneeId, filters.productId, filters.operationId, filters.status, filters.showArchived].filter(Boolean).length

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
        <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl text-slate-800 mb-1">Завдання</h1>
        <p className="text-xs text-slate-400 mb-3">
          {isManager ? 'Усі завдання команди' : 'Ваші завдання'} · {list.length}
        </p>

        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input type="search" placeholder="Пошук завдання..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
          </div>
          <button onClick={() => setFilterOpen(true)} className="relative flex items-center justify-center rounded-2xl px-4"
            style={{ border: '1px solid rgba(157,200,255,0.3)', background: activeFilterCount > 0 ? '#eff6ff' : 'white' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M4.5 8h7M7 12h2" stroke={activeFilterCount > 0 ? '#3b82f6' : '#64748b'} strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        <button onClick={() => setFormOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white active:scale-[0.98] transition-all">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
          </svg>
          Нове завдання
        </button>
      </div>

      <div className="px-4 space-y-2 pb-8">
        {assignmentsQ.isLoading ? (
          <div className="py-10 text-center text-sm text-slate-400">Завантаження…</div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl bg-white py-12 text-center text-sm text-slate-400" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            {all.length === 0 ? 'Завдань ще немає' : 'Нічого не знайдено'}
          </div>
        ) : list.map(a => {
          const style = STATUS_STYLE[a.status]
          return (
            <button key={a.id} onClick={() => setDetail(a)}
              className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-left"
              style={{ border: '1px solid rgba(157,200,255,0.22)', boxShadow: '0 1px 6px rgba(157,200,255,0.07)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{a.name}</p>
                <p className="text-xs text-slate-400 truncate mt-0.5">{a.productName} · {a.operationName}</p>
                {isManager && <p className="text-xs text-slate-400 mt-0.5">Виконавець: {a.assigneeName}</p>}
              </div>
              <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                {STATUS_LABEL[a.status]}
              </span>
            </button>
          )
        })}
      </div>

      {filterOpen && (
        <FilterSheet
          isManager={isManager}
          users={users}
          products={products}
          operations={operations}
          filters={filters}
          onApply={f => { setFilters(f); setFilterOpen(false) }}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {formOpen && currentUser && (
        <AssignmentFormSheet
          currentUser={currentUser}
          isManager={!!isManager}
          users={users}
          products={products}
          operations={operations}
          onClose={() => setFormOpen(false)}
          onCreated={() => { setFormOpen(false); showToast('Завдання створено') }}
        />
      )}

      {detail && currentUser && (
        <AssignmentDetailSheet
          assignment={detail}
          currentUser={currentUser}
          isManager={!!isManager}
          onClose={() => setDetail(null)}
          onSaved={() => showToast('Збережено')}
          onDeleted={() => { setDetail(null); showToast('Видалено') }}
        />
      )}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────
   Фільтри
─────────────────────────────────────────────────────────── */

function FilterSheet({ isManager, users, products, operations, filters, onApply, onClose }: {
  isManager: boolean
  users: AppUser[]
  products: Product[]
  operations: Operation[]
  filters: Filters
  onApply: (f: Filters) => void
  onClose: () => void
}) {
  const [local, setLocal] = useState(filters)

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-3xl bg-white pt-2 pb-10 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-center py-3">
          <button onClick={onClose} className="h-1 w-10 rounded-full bg-slate-200" />
        </div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="px-5 text-2xl text-slate-800 mb-4">Фільтри</h2>

        <div className="px-5 space-y-4">
          {isManager && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">Працівник</label>
              <select value={local.assigneeId ?? ''} onChange={e => setLocal(f => ({ ...f, assigneeId: e.target.value || null }))}
                className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
                <option value="">Усі</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">Продукт</label>
            <select value={local.productId ?? ''} onChange={e => setLocal(f => ({ ...f, productId: e.target.value || null }))}
              className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
              <option value="">Усі</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">Операція</label>
            <select value={local.operationId ?? ''} onChange={e => setLocal(f => ({ ...f, operationId: e.target.value || null }))}
              className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
              <option value="">Усі</option>
              {operations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">Статус</label>
            <select value={local.status ?? ''} onChange={e => setLocal(f => ({ ...f, status: (e.target.value || null) as AssignmentStatus | null }))}
              className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
              <option value="">Усі</option>
              <option value="pending">В очікуванні</option>
              <option value="in_progress">В роботі</option>
              <option value="done">Завершено</option>
              <option value="cancelled">Скасовано</option>
            </select>
          </div>
          <label className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 cursor-pointer">
            <span className="text-sm text-slate-600">Показати завершені за минулі місяці</span>
            <input type="checkbox" checked={local.showArchived} onChange={e => setLocal(f => ({ ...f, showArchived: e.target.checked }))}
              className="h-4 w-4 rounded accent-slate-800" />
          </label>
        </div>

        <div className="flex gap-3 mt-6 px-5">
          <button onClick={() => onApply(EMPTY_FILTERS)} className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm text-slate-600">Скинути</button>
          <button onClick={() => onApply(local)} className="flex-1 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white active:scale-[0.98] transition-all">Застосувати</button>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────
   Створення завдання: продукт → рекомендовані завдання
   (з наявних tasks продукту) або ручне заповнення → виконавець
   (менеджер обирає, виконавець — завжди собі) → витрачений час.
   Вартість (з шаблону) бачить лише менеджер.
─────────────────────────────────────────────────────────── */

function AssignmentFormSheet({ currentUser, isManager, users, products, operations, onClose, onCreated }: {
  currentUser: CurrentUser
  isManager: boolean
  users: AppUser[]
  products: Product[]
  operations: Operation[]
  onClose: () => void
  onCreated: () => void
}) {
  const { createAssignment, isSaving } = useAssignmentMutations()

  // При створенні завдання пропонуємо обрати лише активні продукти.
  const statusesQ = useProductStatuses()
  const activeStatusId = statusesQ.data?.find(s => s.code === 'active')?.id ?? null
  const activeProducts = products.filter(p => activeStatusId === null || p.statusId === activeStatusId)

  const [productSearch, setProductSearch] = useState('')
  const [productId, setProductId] = useState<string | null>(null)
  const productTasksQ = useProductTasks(productId)
  const recommended = productTasksQ.data ?? []

  const [pickedTaskId, setPickedTaskId] = useState<string | null>(null)
  const [manualMode, setManualMode] = useState(false)
  const [operationId, setOperationId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [duration, setDuration] = useState('')
  const [cost, setCost] = useState<number | null>(null)
  const [assigneeId, setAssigneeId] = useState<string | null>(isManager ? null : currentUser.id)

  const selectedProduct = productId ? activeProducts.find(p => p.id === productId) ?? null : null
  const filteredProducts = activeProducts.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku.toLowerCase().includes(productSearch.toLowerCase()))

  const pickRecommended = (t: ProductTask) => {
    setPickedTaskId(t.id)
    setOperationId(t.operationId)
    setName(t.name)
    setDuration(t.durationMinutes !== null ? String(t.durationMinutes) : '')
    setCost(t.cost)
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

  const canConfirm = productId !== null && operationId !== null && name.trim().length > 0 && assigneeId !== null

  const handleConfirm = async () => {
    if (!canConfirm || !productId || !operationId || !assigneeId) return
    await createAssignment({
      productId, operationId, taskId: pickedTaskId, name: name.trim(),
      assigneeId, assignedById: currentUser.id,
      durationMinutes: duration.trim() ? Number(duration) : null,
      cost,
    })
    onCreated()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-3xl bg-white pt-2 pb-10 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-center py-3">
          <button onClick={onClose} className="h-1 w-10 rounded-full bg-slate-200" />
        </div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="px-5 text-2xl text-slate-800 mb-4">Нове завдання</h2>

        <div className="px-5 space-y-5">
          {/* Продукт */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">Продукт</label>
            {selectedProduct ? (
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <div className="h-9 w-9 shrink-0 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center text-slate-400">
                  {selectedProduct.photo ? <img src={selectedProduct.photo} alt="" className="h-full w-full object-cover" /> : <span className="text-xs">📦</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{selectedProduct.name}</p>
                  <p className="text-xs font-mono text-slate-400">{selectedProduct.sku}</p>
                </div>
                <button onClick={changeProduct} className="text-xs text-blue-500 font-medium shrink-0">Змінити</button>
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  <input type="search" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Пошук продукту..."
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {filteredProducts.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-400">{activeProducts.length === 0 ? 'Немає активних продуктів' : 'Не знайдено'}</p>
                  ) : filteredProducts.map(p => (
                    <button key={p.id} onClick={() => setProductId(p.id)}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                      style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
                      <div className="h-8 w-8 shrink-0 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center text-slate-400">
                        {p.photo ? <img src={p.photo} alt="" className="h-full w-full object-cover" /> : <span className="text-xs">📦</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                        <p className="text-xs font-mono text-slate-400">{p.sku}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Рекомендовані завдання / вручну */}
          {selectedProduct && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">Завдання</label>
              {!manualMode && recommended.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {recommended.map(t => {
                    const op = operations.find(o => o.id === t.operationId)
                    const active = pickedTaskId === t.id
                    return (
                      <button key={t.id} onClick={() => pickRecommended(t)}
                        className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition-all"
                        style={active ? { background: '#fff7ed', border: '1px solid #fdba74' } : { background: 'white', border: '1px solid rgba(157,200,255,0.2)' }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{t.name}</p>
                          <p className="text-xs text-slate-400 truncate">{op?.name ?? '—'}</p>
                        </div>
                        {t.durationMinutes !== null && <span className="text-xs text-slate-400 shrink-0">{t.durationMinutes} хв</span>}
                      </button>
                    )
                  })}
                </div>
              )}
              {recommended.length === 0 && !manualMode && (
                <p className="text-xs text-slate-400 mb-2">Для цього продукту ще немає готових завдань з операціями — вкажіть вручну.</p>
              )}
              {!manualMode ? (
                <button onClick={startManual} className="text-xs text-blue-500 font-medium hover:underline">
                  + Вказати вручну
                </button>
              ) : (
                <div className="rounded-2xl border border-slate-200 p-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-slate-400 uppercase tracking-wide">Операція</label>
                    <select value={operationId ?? ''} onChange={e => {
                      const id = e.target.value || null
                      setOperationId(id)
                      // Назва завдання одразу підставляється з назви операції, можна відредагувати.
                      setName(id ? operations.find(o => o.id === id)?.name ?? '' : '')
                    }}
                      className="w-full appearance-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all">
                      <option value="">Оберіть операцію</option>
                      {operations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Назва завдання"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all" />
                  {recommended.length > 0 && (
                    <button onClick={() => setManualMode(false)} className="text-xs text-slate-500 hover:underline">Обрати з рекомендованих</button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Виконавець */}
          {selectedProduct && operationId && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">Виконавець</label>
              {isManager ? (
                <select value={assigneeId ?? ''} onChange={e => setAssigneeId(e.target.value || null)}
                  className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
                  <option value="">Оберіть виконавця</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                </select>
              ) : (
                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{currentUser.fullName} (ви)</p>
              )}
            </div>
          )}

          {/* Витрачений час */}
          {selectedProduct && operationId && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">Витрачений час, хв</label>
              <input type="number" min="0" step="any" value={duration} onChange={e => setDuration(e.target.value)} placeholder="0"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
              {isManager && cost !== null && (
                <p className="mt-1.5 text-xs text-slate-400">Вартість за шаблоном: {cost} ₴</p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6 px-5">
          <button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm text-slate-600">Скасувати</button>
          <button onClick={handleConfirm} disabled={!canConfirm || isSaving}
            className="flex-1 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition-all">
            {isSaving ? 'Створення…' : 'Створити'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────
   Деталі завдання: зміна статусу й фактичного часу (виконавцем
   або менеджером), видалення.
─────────────────────────────────────────────────────────── */

function AssignmentDetailSheet({ assignment, currentUser, isManager, onClose, onSaved, onDeleted }: {
  assignment: Assignment
  currentUser: CurrentUser
  isManager: boolean
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const { updateStatus, removeAssignment, isSaving } = useAssignmentMutations()
  const [status, setStatus] = useState<AssignmentStatus>(assignment.status)
  const initialDuration = assignment.durationMinutes !== null ? String(assignment.durationMinutes) : ''
  const [duration, setDuration] = useState(initialDuration)

  // Завершене завдання можна редагувати лише в день завершення — далі поля блокуються
  // (те саме перевіряє тригер у базі, тут — лише для UI).
  const locked = isAssignmentLocked(assignment)
  const canEdit = (isManager || assignment.assigneeId === currentUser.id) && !locked
  // Видалити можна лише поки завдання ще "В очікуванні" (узгоджено з RLS-політикою видалення).
  const canDelete = (isManager || assignment.assignedById === currentUser.id) && assignment.status === 'pending'
  const dirty = status !== assignment.status || duration !== initialDuration

  const save = async () => {
    await updateStatus({
      id: assignment.id,
      prevStatus: assignment.status,
      prevStatusChangedAt: assignment.statusChangedAt,
      newStatus: status,
      durationMinutes: duration.trim() ? Number(duration) : null,
    })
    onSaved()
    onClose()
  }

  const del = () => {
    removeAssignment(assignment.id)
    onDeleted()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-3xl bg-white pt-2 pb-10 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-center py-3">
          <button onClick={onClose} className="h-1 w-10 rounded-full bg-slate-200" />
        </div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="px-5 text-2xl text-slate-800 mb-1">{assignment.name}</h2>
        <p className="px-5 text-sm text-slate-400 mb-4">{assignment.productName} · {assignment.operationName}</p>

        <div className="px-5 space-y-5">
          {locked && (
            <div className="rounded-2xl px-4 py-3 text-xs" style={{ background: '#f1f5f9', color: '#64748b' }}>
              Завдання заблоковано для редагування — день завершення вже минув.
            </div>
          )}
          {isManager && (
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span className="text-xs text-slate-400">Виконавець</span>
              <span className="text-sm font-medium text-slate-700">{assignment.assigneeName}</span>
            </div>
          )}
          <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
            <span className="text-xs text-slate-400">Призначив</span>
            <span className="text-sm font-medium text-slate-700">{assignment.assignedByName}</span>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-400">Статус</label>
            <div className="grid grid-cols-2 gap-2">
              {/* "В очікуванні" — лише стартовий стан, вручну повертати завдання в нього сенсу немає */}
              {(['in_progress', 'paused', 'done', 'cancelled'] as AssignmentStatus[]).map(s => {
                const style = STATUS_STYLE[s]
                const active = status === s
                return (
                <button key={s} onClick={() => canEdit && setStatus(s)} disabled={!canEdit}
                  className="rounded-xl py-2.5 text-xs font-medium transition-all disabled:opacity-50"
                  style={active ? { background: style.text, color: '#fff' } : { background: style.bg, color: style.text }}>
                  {STATUS_LABEL[s]}
                </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">Витрачений час, хв</label>
            <input type="number" min="0" step="any" value={duration} onChange={e => setDuration(e.target.value)} disabled={!canEdit} placeholder="0"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-50" />
            <p className="mt-1.5 text-xs text-slate-400">
              Час додається автоматично при переведенні зі статусу «В роботі» — за потреби можна відкоригувати вручну.
            </p>
          </div>

          {assignment.completedAt !== null && (
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span className="text-xs text-slate-400">Завершено</span>
              <span className="text-sm font-medium text-slate-700">
                {new Date(assignment.completedAt).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )}

          {isManager && assignment.cost !== null && (
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span className="text-xs text-slate-400">Вартість</span>
              <span className="text-sm font-medium text-slate-700">{assignment.cost} ₴</span>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6 px-5">
          {canDelete && (
            <button onClick={del} className="flex items-center justify-center rounded-2xl border border-red-200 px-4 py-3.5 text-sm text-red-500">
              Видалити
            </button>
          )}
          <button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm text-slate-600">Закрити</button>
          {canEdit && (
            <button onClick={save} disabled={!dirty || isSaving}
              className="flex-1 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition-all">
              {isSaving ? 'Збереження…' : 'Зберегти'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
