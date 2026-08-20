import { useState } from 'react'
import type { Operation } from './hooks/useCatalog'
import { createOperationDirect } from './hooks/useCatalog'
import { useProductTasks, useProductOperationMutations, type ProductTask } from './hooks/useProductOperations'
import { useActiveOrgId } from './OrgContext'
import { useLocale } from './LocaleContext'

/* ───────────────────────────────────────────────────────────
   Пікер додавання операції до продукту: операція з каталогу →
   завдання (нове, або вже наявне в цьому продукті) з часом і
   вартістю. Якщо потрібної операції немає в каталозі — можна
   створити нову прямо тут.
─────────────────────────────────────────────────────────── */

export default function OperationPickerSheet({ productId, allOperations, alreadyAddedIds, onClose, onAdded }: {
  productId: string
  allOperations: Operation[]
  alreadyAddedIds: string[]
  onClose: () => void
  onAdded: () => void
}) {
  const { t, tn } = useLocale()
  const orgId = useActiveOrgId()
  const productTasksQ = useProductTasks(productId)
  const productTasks = productTasksQ.data ?? []
  const { addWithNewTask, addWithExistingTask, isSaving, addTaskError, resetAddErrors } = useProductOperationMutations()

  const [operations, setOperations] = useState(allOperations)
  const [search, setSearch] = useState('')
  const [operationId, setOperationId] = useState<string | null>(null)

  const [taskMode, setTaskMode] = useState<'new' | 'existing'>('new')
  const [taskName, setTaskName] = useState('')
  const [duration, setDuration] = useState('')
  const [cost, setCost] = useState('')
  const [existingTaskId, setExistingTaskId] = useState<string | null>(null)

  const [newOpMode, setNewOpMode] = useState(false)
  const [newOpName, setNewOpName] = useState('')
  const [creatingOp, setCreatingOp] = useState(false)

  const available = operations.filter(o => o.name.toLowerCase().includes(search.toLowerCase()))
  const selectedOperation = operationId ? operations.find(o => o.id === operationId) ?? null : null
  const addedCount = (id: string) => alreadyAddedIds.filter(x => x === id).length

  /** Обрати операцію — назва завдання одразу підставляється з назви операції,
   *  користувач може її змінити. */
  const selectOperation = (id: string, name: string) => {
    setOperationId(id)
    setTaskName(name)
  }

  const handleCreateOperation = async () => {
    if (!newOpName.trim()) return
    setCreatingOp(true)
    try {
      const id = await createOperationDirect(orgId, newOpName.trim())
      const created: Operation = { id, name: newOpName.trim(), nameEn: null, description: '' }
      setOperations(prev => [...prev, created])
      selectOperation(id, created.name)
      setNewOpMode(false)
      setNewOpName('')
    } finally {
      setCreatingOp(false)
    }
  }

  const canConfirm = selectedOperation !== null && (
    taskMode === 'existing' ? existingTaskId !== null : taskName.trim().length > 0
  )

  const handleConfirm = async () => {
    if (!selectedOperation || !canConfirm) return
    try {
      if (taskMode === 'existing' && existingTaskId) {
        await addWithExistingTask({ productId, operationId: selectedOperation.id, taskId: existingTaskId })
      } else {
        await addWithNewTask({
          productId,
          operationId: selectedOperation.id,
          taskName: taskName.trim(),
          durationMinutes: duration.trim() ? Number(duration) : null,
          cost: cost.trim() ? Number(cost) : null,
        })
      }
      onAdded()
    } catch {
      // Помилка вже відображається інлайн через addTaskError — тут просто не закриваємо форму.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-3xl bg-white pt-2 pb-10 max-h-[92vh] overflow-y-auto sm:rounded-3xl sm:w-full sm:max-w-md">
        <div className="flex justify-center py-3">
          <button onClick={onClose} className="h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
        </div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="px-5 text-2xl text-slate-800 mb-4">
          {t('operationPicker.addOperation')}
        </h2>

        {!selectedOperation ? (
          <div className="px-5">
            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('operationPicker.searchOperation')}
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
            </div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto mb-3">
              {available.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">
                  {operations.length === 0 ? t('operationPicker.emptyCatalog') : t('operationPicker.notFoundShort')}
                </p>
              ) : available.map(o => (
                <button key={o.id} onClick={() => selectOperation(o.id, tn(o.name, o.nameEn))}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-orange-50/50 transition-colors"
                  style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
                  <div className="h-8 w-8 shrink-0 rounded-lg bg-orange-50 flex items-center justify-center text-orange-500">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M7 1.5V3M7 11v1.5M1.5 7H3M11 7h1.5M3.4 3.4l1.06 1.06M9.54 9.54l1.06 1.06M3.4 10.6l1.06-1.06M9.54 4.46l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{tn(o.name, o.nameEn)}</p>
                    {o.description && <p className="text-xs text-slate-400">{o.description}</p>}
                  </div>
                  {addedCount(o.id) > 0 && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      {t('operationPicker.alreadyCount', { count: addedCount(o.id) })}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {!newOpMode ? (
              <button onClick={() => setNewOpMode(true)} className="text-xs text-blue-500 font-medium hover:underline">
                {t('materialPicker.operationNotInList')}
              </button>
            ) : (
              <div className="rounded-2xl border border-slate-200 p-3 space-y-3">
                <input type="text" value={newOpName} onChange={e => setNewOpName(e.target.value)} placeholder={t('materialPicker.operationNamePlaceholder')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all" />
                <div className="flex gap-2">
                  <button onClick={() => setNewOpMode(false)} className="flex-1 rounded-xl border border-slate-200 py-2 text-xs text-slate-600">{t('common.cancel')}</button>
                  <button onClick={handleCreateOperation} disabled={!newOpName.trim() || creatingOp}
                    className="flex-1 rounded-xl bg-slate-800 py-2 text-xs font-medium text-white disabled:opacity-40">
                    {creatingOp ? t('operationPicker.creating') : t('materialPicker.createAndSelect')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="px-5 space-y-5">
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
              <div className="h-9 w-9 shrink-0 rounded-lg bg-orange-50 flex items-center justify-center text-orange-500">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M7 1.5V3M7 11v1.5M1.5 7H3M11 7h1.5M3.4 3.4l1.06 1.06M9.54 9.54l1.06 1.06M3.4 10.6l1.06-1.06M9.54 4.46l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{tn(selectedOperation.name, selectedOperation.nameEn)}</p>
                {selectedOperation.description && <p className="text-xs text-slate-400">{selectedOperation.description}</p>}
              </div>
              <button onClick={() => { setOperationId(null); resetAddErrors() }} className="text-xs text-blue-500 font-medium shrink-0">{t('common.change')}</button>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('operationPicker.taskLabel')}</label>

              <div className="flex gap-2 mb-3">
                <button onClick={() => setTaskMode('new')}
                  className="flex-1 rounded-xl py-2 text-xs font-medium transition-all"
                  style={taskMode === 'new' ? { background: '#1e293b', color: '#fff' } : { background: '#f1f5f9', color: '#64748b' }}>
                  {t('operationPicker.newTask')}
                </button>
                <button onClick={() => setTaskMode('existing')} disabled={productTasks.length === 0}
                  className="flex-1 rounded-xl py-2 text-xs font-medium transition-all disabled:opacity-40"
                  style={taskMode === 'existing' ? { background: '#1e293b', color: '#fff' } : { background: '#f1f5f9', color: '#64748b' }}>
                  {t('operationPicker.existingInProduct', { count: productTasks.length })}
                </button>
              </div>

              {taskMode === 'existing' ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {productTasks.map((pt: ProductTask) => (
                    <button key={pt.id} onClick={() => setExistingTaskId(pt.id)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all"
                      style={existingTaskId === pt.id ? { background: '#fff7ed', border: '1px solid #fdba74' } : { background: '#f8fafc', border: '1px solid transparent' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{pt.name}</p>
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">
                        {pt.durationMinutes ? `${pt.durationMinutes} ${t('common.minutesShort')}` : ''}{pt.durationMinutes && pt.cost ? ' · ' : ''}{pt.cost ? `${pt.cost} ₴` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <input type="text" value={taskName} onChange={e => { setTaskName(e.target.value); if (addTaskError) resetAddErrors() }} placeholder={t('operationPicker.taskNamePlaceholder')}
                      className="w-full rounded-2xl border bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:ring-2 transition-all"
                      style={addTaskError ? { borderColor: '#fca5a5', boxShadow: '0 0 0 2px rgba(252,165,165,0.25)' } : undefined} />
                    {addTaskError && (
                      <p className="mt-1.5 text-xs text-red-500">{addTaskError}</p>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-[10px] font-medium text-slate-400 uppercase tracking-wide">{t('operationPicker.timeMinLabel')}</label>
                      <input type="number" min="0" step="any" value={duration} onChange={e => setDuration(e.target.value)} placeholder="0"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-[10px] font-medium text-slate-400 uppercase tracking-wide">{t('operationPicker.costLabel')}</label>
                      <input type="number" min="0" step="any" value={cost} onChange={e => setCost(e.target.value)} placeholder="0"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6 px-5">
          <button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm text-slate-600">{t('common.cancel')}</button>
          <button onClick={handleConfirm} disabled={!canConfirm || isSaving}
            className="flex-1 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition-all">
            {isSaving ? t('materialPicker.adding') : t('common.add')}
          </button>
        </div>
      </div>
    </div>
  )
}
