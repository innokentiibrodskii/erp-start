import { useState } from 'react'
import { useCatalog } from './hooks/useCatalog'
import { useProducts, useMaterials } from './hooks/useProducts'
import { useProductMaterialMutations } from './hooks/useProductMaterials'
import { useProductOperationMutations } from './hooks/useProductOperations'
import { useProductMaterialEvents, type ProductMaterialEvent } from './hooks/useProductMaterialEvents'
import { useProductSpecifications, useProductSpecificationMutations } from './hooks/useProductSpecifications'
import ProductSpecificationVersionsPage from './ProductSpecificationVersionsPage'
import MaterialPickerSheet from './MaterialPickerSheet'
import OperationPickerSheet from './OperationPickerSheet'
import { useOperationCostCurrency, CURRENCY_SYMBOL } from './hooks/useOrgSettings'
import { fmt } from './lib/materialFormat'
import { useLocale } from './LocaleContext'
import type { TranslationKey } from './i18n'

/* ───────────────────────────────────────────────────────────
   Специфікація продукту (матеріали/операції) — за макетом Figma
   (node 41-30607): повноцінна сторінка з таблицею замість bottom
   sheet, що був раніше (ProductCatalog.tsx). Дії (додати/редагувати
   к-сть/видалити) — ті самі, що й у sheet, лише перенесені в рядки
   таблиці: "+" у шапці відкриває той самий пікер, олівець — те саме
   інлайн-редагування к-сті, кошик — те саме видалення.

   Статуси й версії (sql/product_specifications.sql): специфікація за
   замовчуванням read-only, "Редагувати" вмикає режим чернетки — лише тоді
   product_materials/product_operations можна міняти (і на рівні БД теж).
   "Зберегти" фіксує вміст як нову версію.
─────────────────────────────────────────────────────────── */

type SpecStatus = 'draft' | 'active' | 'closed' | 'none'

const SPEC_STATUS_LABEL_KEY: Record<SpecStatus, TranslationKey> = {
  draft: 'productSpecification.statusDraft',
  active: 'productSpecification.statusActive',
  closed: 'productSpecification.statusClosed',
  none: 'productSpecification.statusNone',
}

const SPEC_STATUS_STYLE: Record<SpecStatus, { bg: string; text: string }> = {
  draft: { bg: '#fef3c7', text: '#d97706' },
  active: { bg: '#dcfce7', text: '#16a34a' },
  closed: { bg: '#f1f5f9', text: '#64748b' },
  none: { bg: '#f1f5f9', text: '#94a3b8' },
}

export default function SpecificationPage({ productId, type, onBack }: {
  productId: string
  type: 'materials' | 'operations'
  onBack: () => void
}) {
  const { t, tn } = useLocale()
  const operationCurrencyQ = useOperationCostCurrency()
  const operationCurrencySymbol = CURRENCY_SYMBOL[operationCurrencyQ.data ?? 'UAH']
  const { operations } = useCatalog()
  const productsQ = useProducts()
  const materialsQ = useMaterials()
  const { addMaterial, updateMaterial, removeMaterial } = useProductMaterialMutations()
  const { removeOperation, updateOperationTask, isUpdating: isUpdatingTask } = useProductOperationMutations()
  const specsQ = useProductSpecifications(productId)
  const { startEditing, saveVersion, cancelEditing, isSaving: isSavingSpec } = useProductSpecificationMutations()

  const product = (productsQ.data ?? []).find(p => p.id === productId) ?? null
  const materials = materialsQ.data ?? []
  // Одна сторінка на продукт, "Матеріали"/"Операції" — таби всередині (за
  // макетом Figma node 72-36516), а не два окремі входи з картки продукту.
  // `type` — лише початкова вкладка (з якою кнопкою на картці зайшли).
  const [activeType, setActiveType] = useState<'materials' | 'operations'>(type)
  const isMat = activeType === 'materials'
  const specEditing = product?.specificationEditing ?? false
  const latestVersion = specsQ.data?.[0] ?? null
  const specStatus: SpecStatus = specEditing ? 'draft' : (latestVersion?.status ?? 'none')

  const [toast, setToast] = useState<string | null>(null)
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2200) }
  const [menuOpen, setMenuOpen] = useState(false)

  const [materialPickerOpen, setMaterialPickerOpen] = useState(false)
  const [operationPickerOpen, setOperationPickerOpen] = useState(false)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [qtyDraft, setQtyDraft] = useState('')
  const [opDraft, setOpDraft] = useState('')
  // Редагування рядка "Операції" — окрема шторка (не інлайн, як к-сть у
  // матеріалах), бо тут одразу 4 поля: категорія + назва завдання + час + вартість.
  const [editOperationRowId, setEditOperationRowId] = useState<string | null>(null)
  const [opEditOperationId, setOpEditOperationId] = useState('')
  const [opEditTaskName, setOpEditTaskName] = useState('')
  const [opEditDuration, setOpEditDuration] = useState('')
  const [opEditCost, setOpEditCost] = useState('')
  // "Видалити" ховається за кнопкою ⋮ — натиск переводить рядок у режим
  // підтвердження (кошик стає активним, поруч ✕ для скасування), без
  // спливаючого меню: таблиця скролиться по горизонталі (overflow-x-auto),
  // яке через нюанс CSS (overflow-x ≠ visible → overflow-y теж стає auto)
  // обрізало б абсолютно позиційоване меню — той самий клас багу, що вже
  // траплявся з ⋮-меню в AssignmentsPage.tsx.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // "Історія" — аудит-лог дій зі специфікацією матеріалів (хто додав/змінив/
  // видалив). Лише для матеріалів — операції в цьому запиті не логуються.
  const [view, setView] = useState<'table' | 'history' | 'versions'>('table')
  const eventsQ = useProductMaterialEvents(isMat && view === 'history' ? product?.id ?? null : null)

  if (!product) return null

  const startEditingClick = async () => {
    setMenuOpen(false)
    await startEditing(product.id)
  }
  const saveVersionClick = async () => {
    await saveVersion({ productId: product.id, materials: product.materials, operations: product.operations })
    showToast(t('materials.toastSaved'))
  }
  // Якщо в чернетці нічого не хотіли міняти (або передумали) — повернутись
  // до вмісту останньої версії без створення нової. Доступно лише коли є що
  // повертати (продукт уже мав хоч одну збережену версію).
  const cancelEditingClick = async () => {
    if (!latestVersion) return
    await cancelEditing({ productId: product.id, latestSpecificationId: latestVersion.id })
    showToast(t('productSpecification.toastCancelled'))
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

      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <button onClick={() => { if (view !== 'table') { setView('table'); setMenuOpen(false) } else onBack() }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95 transition-all">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-slate-800 truncate">
            {view === 'history' ? t('assignments.historyTab') : view === 'versions' ? t('productSpecification.versionsTitle') : t('products.specificationTitle')}
          </h1>
          <div className="flex items-center gap-1.5">
            <p className="text-xs text-slate-400 truncate">{product.name}</p>
            {view === 'table' && (
              <span className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: SPEC_STATUS_STYLE[specStatus].bg, color: SPEC_STATUS_STYLE[specStatus].text }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: SPEC_STATUS_STYLE[specStatus].text }} />
                {t(SPEC_STATUS_LABEL_KEY[specStatus])}
              </span>
            )}
          </div>
        </div>
        {view === 'table' && (
          specEditing ? (
            <>
              {(isMat || latestVersion) && (
                <div className="relative">
                  <button onClick={() => setMenuOpen(o => !o)} title={t('common.moreActions')}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95 transition-all">
                    <MoreIcon />
                  </button>
                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                      <div className="absolute right-0 top-11 z-50 w-48 overflow-hidden rounded-2xl bg-white py-1 shadow-xl" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
                        {isMat && (
                          <button onClick={() => { setMenuOpen(false); setView('history') }}
                            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                            {t('productSpecification.historyMenuItem')}
                          </button>
                        )}
                        {/* "Скасувати" — лишити доступним лише якщо є до чого повертатись
                            (продукт уже мав хоч одну збережену версію до цієї чернетки). */}
                        {latestVersion && (
                          <button onClick={() => { setMenuOpen(false); cancelEditingClick() }}
                            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                            {t('common.cancel')}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              <button onClick={() => isMat ? setMaterialPickerOpen(true) : setOperationPickerOpen(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white active:scale-95 transition-all">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
              </button>
              <button onClick={saveVersionClick} disabled={isSavingSpec}
                className="shrink-0 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 active:scale-95 transition-all">
                {t('productSpecification.saveButton')}
              </button>
            </>
          ) : (
            <div className="relative">
              <button onClick={() => setMenuOpen(o => !o)} title={t('common.moreActions')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95 transition-all">
                <MoreIcon />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-11 z-50 w-52 overflow-hidden rounded-2xl bg-white py-1 shadow-xl" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
                    <button onClick={startEditingClick}
                      className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                      {t('productSpecification.editButton')}
                    </button>
                    <button onClick={() => { setMenuOpen(false); setView('versions') }}
                      className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                      {t('productSpecification.versionsMenuItem')}
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        )}
      </div>

      {view === 'table' && (
        <div className="mx-4 mb-3 flex gap-1 rounded-2xl bg-slate-100 p-1">
          <button onClick={() => { setActiveType('materials'); setEditingRowId(null); setConfirmDeleteId(null) }}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-all ${isMat ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
            {t('nav.materials')}
          </button>
          <button onClick={() => { setActiveType('operations'); setEditingRowId(null); setConfirmDeleteId(null) }}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-all ${!isMat ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
            {t('products.operationsLabel')}
          </button>
        </div>
      )}

      {view === 'versions' ? (
        <ProductSpecificationVersionsPage
          productId={product.id}
          onRestored={() => { setView('table'); showToast(t('productSpecification.toastRestored')) }}
        />
      ) : view === 'history' ? (
        <div className="px-4 pb-8 space-y-2">
          {eventsQ.isLoading ? (
            <p className="py-8 text-center text-sm text-slate-400">{t('common.loading')}</p>
          ) : (eventsQ.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{t('assignments.noHistoryYet')}</p>
          ) : (eventsQ.data ?? []).map(ev => (
            <ProductMaterialEventRow key={ev.id} event={ev} materials={materials} operations={operations} />
          ))}
        </div>
      ) : (
      <div className="px-4 pb-8">
        {isMat ? (
          product.materials.length === 0 ? (
            <div className="rounded-2xl bg-white py-12 text-center text-sm text-slate-400" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
              {t('products.noMaterials')}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl bg-white" style={{ border: '1px solid rgba(157,200,255,0.22)', boxShadow: '0 1px 6px rgba(157,200,255,0.07)' }}>
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: '420px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(157,200,255,0.2)' }}>
                    <th className="w-10 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('products.specTable.number')}</th>
                    <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('nav.materials')}</th>
                    <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('products.specTable.qty')}</th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {product.materials.map((pm, i) => {
                    const m = materials.find(x => x.id === pm.materialId)
                    const op = pm.operationId ? operations.find(x => x.id === pm.operationId) : null
                    const editing = editingRowId === pm.id
                    return (
                      <tr key={pm.id} className="hover:bg-slate-50 transition-colors" style={{ borderBottom: '1px solid rgba(157,200,255,0.12)' }}>
                        <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-800 truncate">{m ? tn(m.name, m.nameEn) : '—'}</p>
                          {editing ? (
                            <select value={opDraft} onChange={e => setOpDraft(e.target.value)}
                              className="mt-1 w-full max-w-[150px] rounded-lg border border-amber-300 bg-white px-1.5 py-1 text-xs text-slate-700 outline-none focus:border-amber-500">
                              <option value="">{t('products.noOperation')}</option>
                              {operations.map(o => <option key={o.id} value={o.id}>{tn(o.name, o.nameEn)}</option>)}
                            </select>
                          ) : (
                            <p className="text-xs text-slate-400 truncate">{op ? tn(op.name, op.nameEn) : t('products.noOperation')}</p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {editing ? (
                            <div className="flex items-center gap-1">
                              <input type="number" min="0" step="any" autoFocus value={qtyDraft} onChange={e => setQtyDraft(e.target.value)}
                                className="w-16 rounded-lg border border-amber-300 bg-white px-2 py-1 text-sm font-mono text-slate-800 outline-none focus:border-amber-500" />
                              <span className="text-xs text-slate-400">{tn(pm.unitShortName, pm.unitShortNameEn)}</span>
                            </div>
                          ) : (
                            <span className="font-mono text-slate-700">{fmt(pm.qty)} {tn(pm.unitShortName, pm.unitShortNameEn)}</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {!specEditing ? null : editing ? (
                              <>
                                <button onClick={async () => {
                                    const qty = Number(qtyDraft)
                                    if (qty > 0) await updateMaterial({ id: pm.id, productId: product.id, qty, operationId: opDraft || null })
                                    setEditingRowId(null)
                                  }}
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 transition-all">
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                    <path d="M2 6.5l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </button>
                                <button onClick={() => setEditingRowId(null)}
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 transition-all">
                                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                                    <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                                  </svg>
                                </button>
                              </>
                            ) : confirmDeleteId === pm.id ? (
                              <>
                                <button onClick={() => { removeMaterial({ id: pm.id }); setConfirmDeleteId(null) }}
                                  title={t('common.delete')}
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-all">
                                  <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
                                    <path d="M2 3h9M4 3V2h5v1M5 6v4M8 6v4M3 3l.5 8h6l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </button>
                                <button onClick={() => setConfirmDeleteId(null)}
                                  title={t('common.cancel')}
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 transition-all">
                                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                                    <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                                  </svg>
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => { setEditingRowId(pm.id); setQtyDraft(String(pm.qty)); setOpDraft(pm.operationId ?? '') }}
                                  title={t('common.edit')}
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-all">
                                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                                    <path d="M9.5 2.5l2 2L4 12l-2.5.5L2 10l7.5-7.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </button>
                                <button onClick={() => setConfirmDeleteId(pm.id)}
                                  title={t('common.moreActions')}
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                                  <MoreIcon />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : product.operations.length === 0 ? (
          <div className="rounded-2xl bg-white py-12 text-center text-sm text-slate-400" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            {t('products.noOperations')}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white" style={{ border: '1px solid rgba(157,200,255,0.22)', boxShadow: '0 1px 6px rgba(157,200,255,0.07)' }}>
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: '420px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(157,200,255,0.2)' }}>
                  <th className="w-10 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('products.specTable.number')}</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('products.operationsLabel')}</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('products.specTable.details')}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {product.operations.map((po, i) => {
                  const o = operations.find(x => x.id === po.operationId)
                  return (
                    <tr key={po.id} className="hover:bg-slate-50 transition-colors" style={{ borderBottom: '1px solid rgba(157,200,255,0.12)' }}>
                      <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-800 truncate">{o ? tn(o.name, o.nameEn) : '—'}</p>
                        <p className="text-xs text-slate-400 truncate">{po.taskName || t('products.noTask')}</p>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-slate-600">
                        {po.durationMinutes ? `${po.durationMinutes} ${t('common.minutesShort')}` : ''}
                        {po.durationMinutes && po.cost ? ' · ' : ''}
                        {po.cost ? `${po.cost} ${operationCurrencySymbol}` : ''}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {!specEditing ? null : confirmDeleteId === po.id ? (
                            <>
                              <button onClick={() => { removeOperation({ id: po.id, productId: product.id, taskId: po.taskId }); setConfirmDeleteId(null) }}
                                title={t('common.delete')}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-all">
                                <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
                                  <path d="M2 3h9M4 3V2h5v1M5 6v4M8 6v4M3 3l.5 8h6l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                              <button onClick={() => setConfirmDeleteId(null)}
                                title={t('common.cancel')}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 transition-all">
                                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                                  <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                                </svg>
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => {
                                  setEditOperationRowId(po.id)
                                  setOpEditOperationId(po.operationId)
                                  setOpEditTaskName(po.taskName)
                                  setOpEditDuration(po.durationMinutes !== null ? String(po.durationMinutes) : '')
                                  setOpEditCost(po.cost !== null ? String(po.cost) : '')
                                }}
                                title={t('common.edit')}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-all">
                                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                                  <path d="M9.5 2.5l2 2L4 12l-2.5.5L2 10l7.5-7.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                              <button onClick={() => setConfirmDeleteId(po.id)}
                                title={t('common.moreActions')}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                                <MoreIcon />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {isMat && materialPickerOpen && (
        <MaterialPickerSheet
          productId={product.id}
          allMaterials={materials}
          alreadyAddedIds={product.materials.map(m => m.materialId)}
          operations={operations}
          onClose={() => setMaterialPickerOpen(false)}
          onAdd={async args => { await addMaterial(args); setMaterialPickerOpen(false) }}
        />
      )}

      {!isMat && operationPickerOpen && (
        <OperationPickerSheet
          productId={product.id}
          allOperations={operations}
          alreadyAddedIds={product.operations.map(o => o.operationId)}
          onClose={() => setOperationPickerOpen(false)}
          onAdded={() => setOperationPickerOpen(false)}
        />
      )}

      {editOperationRowId !== null && (() => {
        const po = product.operations.find(x => x.id === editOperationRowId)
        if (!po) return null
        const hasTask = po.taskId !== null
        const save = async () => {
          await updateOperationTask({
            productOperationId: po.id, taskId: po.taskId, productId: product.id,
            operationId: opEditOperationId, name: opEditTaskName.trim(),
            durationMinutes: opEditDuration.trim() ? Number(opEditDuration) : null,
            cost: opEditCost.trim() ? Number(opEditCost) : null,
          })
          setEditOperationRowId(null)
        }
        return (
          <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
            style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
            onClick={e => e.target === e.currentTarget && setEditOperationRowId(null)}>
            <div className="rounded-t-3xl bg-white pb-8 max-h-[85vh] overflow-y-auto sm:rounded-3xl sm:w-full sm:max-w-md">
              <div className="flex justify-center pt-3 pb-2">
                <button onClick={() => setEditOperationRowId(null)} className="h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
              </div>
              <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="px-5 text-xl text-slate-800 mb-4">{t('products.editOperationTitle')}</h2>
              <div className="px-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('products.operationsLabel')}</label>
                  <select value={opEditOperationId} onChange={e => setOpEditOperationId(e.target.value)}
                    className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
                    {operations.map(o => <option key={o.id} value={o.id}>{tn(o.name, o.nameEn)}</option>)}
                  </select>
                </div>
                {hasTask && (
                  <>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('assignments.nameLabel')}</label>
                      <input value={opEditTaskName} onChange={e => setOpEditTaskName(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('products.durationMinutesLabel')}</label>
                        <input type="number" min="0" step="any" value={opEditDuration} onChange={e => setOpEditDuration(e.target.value)} placeholder="0"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('assignments.costLabel')}</label>
                        <input type="number" min="0" step="any" value={opEditCost} onChange={e => setOpEditCost(e.target.value)} placeholder="0"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-3 mt-6 px-5">
                <button onClick={() => setEditOperationRowId(null)} className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm text-slate-600">{t('common.cancel')}</button>
                <button onClick={save} disabled={isUpdatingTask}
                  className="flex-1 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition-all">
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function MoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="2.5" r="1.1" fill="currentColor"/>
      <circle cx="7" cy="7" r="1.1" fill="currentColor"/>
      <circle cx="7" cy="11.5" r="1.1" fill="currentColor"/>
    </svg>
  )
}

const EVENT_LABEL_KEY: Record<ProductMaterialEvent['eventType'], TranslationKey> = {
  added: 'productMaterialEvent.added',
  qty_changed: 'productMaterialEvent.qtyChanged',
  operation_changed: 'productMaterialEvent.operationChanged',
  removed: 'productMaterialEvent.removed',
}

/** Один рядок "Історії" — назва матеріалу (за materialId, навіть якщо сам
 *  рядок специфікації вже видалено) + подія + деталі зміни (к-сть чи
 *  операція, стара → нова) + хто й коли. */
function ProductMaterialEventRow({ event, materials, operations }: {
  event: ProductMaterialEvent
  materials: { id: string; name: string; nameEn: string | null }[]
  operations: { id: string; name: string; nameEn: string | null }[]
}) {
  const { t, tn } = useLocale()
  const material = materials.find(m => m.id === event.materialId)
  const opName = (id: string | null | undefined) => {
    if (!id) return t('products.noOperation')
    const o = operations.find(x => x.id === id)
    return o ? tn(o.name, o.nameEn) : '—'
  }

  const detail = (() => {
    if (event.eventType === 'qty_changed' && typeof event.oldValue === 'number' && typeof event.newValue === 'number') {
      return `${fmt(event.oldValue)} → ${fmt(event.newValue)}`
    }
    if (event.eventType === 'operation_changed') {
      const oldId = typeof event.oldValue === 'string' ? event.oldValue : null
      const newId = typeof event.newValue === 'string' ? event.newValue : null
      return `${opName(oldId)} → ${opName(newId)}`
    }
    if (event.eventType === 'added' && event.newValue && typeof event.newValue === 'object') {
      return `${fmt(event.newValue.qty ?? 0)} · ${opName(event.newValue.operation_id)}`
    }
    if (event.eventType === 'removed' && event.oldValue && typeof event.oldValue === 'object') {
      return `${fmt(event.oldValue.qty ?? 0)} · ${opName(event.oldValue.operation_id)}`
    }
    return null
  })()

  return (
    <div className="rounded-2xl bg-white px-4 py-3" style={{ border: '1px solid rgba(157,200,255,0.22)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700 truncate">
          {t(EVENT_LABEL_KEY[event.eventType])}{material ? ` · ${tn(material.name, material.nameEn)}` : ''}
        </span>
        <span className="text-[10px] text-slate-400 shrink-0">
          {new Date(event.occurredAt).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      {detail && <p className="text-xs text-slate-500 mt-0.5">{detail}</p>}
      <p className="text-xs text-slate-400 mt-0.5">{event.actorName}</p>
    </div>
  )
}
