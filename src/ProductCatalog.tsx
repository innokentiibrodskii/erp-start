import { useState, useEffect, useRef } from 'react'
import QRCodeLib from 'react-qr-code'
import { useCatalog } from './hooks/useCatalog'
import { useProducts, useMaterials, useProductStatuses, useProductMutations, useProductDeleteImpact, type Product } from './hooks/useProducts'
import { useCurrentUser } from './hooks/useCurrentUser'
import { useUsers } from './hooks/useUsers'
import { useCustomFieldDefinitions, useAllCustomFieldValues } from './hooks/useCustomFields'
import ProductEditor from './ProductEditor'
import ProductView from './ProductView'
import SpecificationPage from './SpecificationPage'
import { AssignmentFormSheet } from './AssignmentsPage'
import ConfirmDeleteModal from './ConfirmDeleteModal'
import { CategoryTreeNode } from './CategoryTreeNode'
import { useMaterialCostCurrency, CURRENCY_SYMBOL } from './hooks/useOrgSettings'
import { useLocale } from './LocaleContext'
import { fmt } from './lib/materialFormat'
import { escapeHtml } from './lib/html'
import { printQrLabel, downloadQrLabelPng } from './lib/qrLabel'

type QuickActionType = 'materials' | 'operations'

const LS_SORT_BY  = 'products_sortBy'
const LS_SORT_DIR = 'products_sortDir'
const LS_FILTER   = 'products_filterStatusId'

function ls<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback } catch { return fallback }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* ignore */ }
}

interface Props {
  onNavigate: (page: string) => void
  initialViewId?: string | null
  initialViewReturnTo?: string | null
  /** Deep-link "одразу відкрити специфікацію матеріалів цього продукту" —
   *  з таблиці деталізації "Специфікація" на дашбордах. На відміну від
   *  initialViewId, це не повна картка продукту, а той самий bottom sheet,
   *  що й кнопка "Матеріали/Специфікація" в списку. */
  initialQuickActionProductId?: string | null
}

export default function ProductCatalog({ onNavigate, initialViewId, initialViewReturnTo, initialQuickActionProductId }: Props) {
  const { categories, operations } = useCatalog()
  const productsQ = useProducts()
  const materialsQ = useMaterials()
  const statusesQ = useProductStatuses()
  const products = productsQ.data ?? []
  const materials = materialsQ.data ?? []
  const productStatuses = statusesQ.data ?? []
  const currencyQ = useMaterialCostCurrency()
  const currencySymbol = CURRENCY_SYMBOL[currencyQ.data ?? 'UAH']
  const { t, tn } = useLocale()
  const { data: currentUser } = useCurrentUser()
  const isManager = currentUser?.role === 'manager' || currentUser?.role === 'admin'
  // "Менеджер перегляд" бачить сторінку Продукти й може створювати/редагувати
  // продукт (усі зміни логуються — sql/manager_view_role.sql,
  // hooks/useProductEvents.ts), і створювати завдання, як і повний менеджер —
  // але без доступу до Специфікації.
  const isManagerView = currentUser?.role === 'manager_view'
  const canEditProducts = isManager || isManagerView
  const canAssignTasks = isManager || isManagerView
  const isAdmin = currentUser?.role === 'admin'
  const usersQ = useUsers()
  const { removeProduct, archiveProduct } = useProductMutations()
  const productFieldsQ = useCustomFieldDefinitions('product')
  const productFields = productFieldsQ.data ?? []
  const allFieldValuesQ = useAllCustomFieldValues('product')
  const allFieldValues = allFieldValuesQ.data ?? []

  const defaultStatusId = productStatuses.find(s => s.isDefault)?.id ?? null

  const [search, setSearch]           = useState('')
  const [editId, setEditId]           = useState<string | 'new' | null>(null)
  const [viewId, setViewId]           = useState<string | null>(initialViewId ?? null)
  const [qrProductId, setQrProductId] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [quickAction, setQuickAction] = useState<{ productId: string; type: QuickActionType } | null>(
    () => initialQuickActionProductId ? { productId: initialQuickActionProductId, type: 'materials' } : null
  )
  // Позиція скролу списку в момент відкриття картки — щоб "назад" повертав
  // саме туди, де стояв продукт у списку, а не на початок сторінки.
  const listScrollY = useRef(0)
  useEffect(() => {
    if (viewId === null && editId === null && quickAction === null && listScrollY.current > 0) {
      window.scrollTo({ top: listScrollY.current })
      listScrollY.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId, editId, quickAction])
  // "Завдання" на картці продукту — та сама форма створення завдання, що на
  // сторінці "Завдання" (AssignmentFormSheet), лише з уже обраним продуктом.
  const [taskProductId, setTaskProductId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2200) }
  const [sortBy, setSortBy]   = useState<'name' | 'createdAt' | 'updatedAt'>(() => ls(LS_SORT_BY, 'createdAt'))
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => ls(LS_SORT_DIR, 'desc'))
  const [filterStatusId, setFilterStatusId] = useState<string | null>(() => ls(LS_FILTER, null))
  const [filterCatId, setFilterCatId] = useState<string | null>(null)
  // Архів — той самий патерн, що й у MaterialStock.tsx: перемикач поруч із
  // лічильником, а не всередині панелі фільтрів.
  const [showArchived, setShowArchived] = useState(false)
  // Видалити продукт — лише адмін, підтвердження окремою модалкою (як і
  // видалення матеріалу в MaterialStock.tsx), а не одразу по кліку.
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null)
  // На відміну від матеріалу (де БД сама блокує видалення, якщо він
  // використовується — ON DELETE RESTRICT), у продукту всі зв'язки —
  // ON DELETE CASCADE: видалення завжди пройде й мовчки забере із собою
  // завдання/призначення/специфікації. БД навмисно не чіпаємо — попереджаємо
  // про масштаб наслідків просто в модалці підтвердження.
  const deleteImpactQ = useProductDeleteImpact(confirmDelete?.id ?? null)
  // Фільтр за кастомним полем продукту — спершу яке поле, тоді яке значення
  // (варіанти залежать від типу поля: select → його опції, boolean → так/ні).
  const [filterFieldId, setFilterFieldId] = useState<string | null>(null)
  const [filterFieldValue, setFilterFieldValue] = useState<string | null>(null)
  const filterField = productFields.find(f => f.id === filterFieldId) ?? null
  // Секція "Категорія" згорнута в один рядок за замовчуванням — дерево розгортається
  // лише по кліку на шеврон (той самий патерн, що й у фільтрі матеріалів).
  const [catSectionOpen, setCatSectionOpen] = useState(false)
  const [expandedFilterCats, setExpandedFilterCats] = useState<string[]>([])
  const toggleExpandFilterCat = (id: string) =>
    setExpandedFilterCats(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  const filterCat = filterCatId === null ? null : categories.find(c => c.id === filterCatId) ?? null
  const selectedCatLabel = filterCat ? tn(filterCat.name, filterCat.nameEn) : t('common.allCategories')

  const toggleSort = (key: 'name' | 'createdAt' | 'updatedAt') => {
    if (sortBy === key) {
      const next = sortDir === 'asc' ? 'desc' : 'asc'
      setSortDir(next); lsSet(LS_SORT_DIR, next)
    } else {
      const dir = key === 'name' ? 'asc' : 'desc'
      setSortBy(key); setSortDir(dir)
      lsSet(LS_SORT_BY, key); lsSet(LS_SORT_DIR, dir)
    }
  }
  const setFilter = (id: string | null) => {
    setFilterStatusId(id); lsSet(LS_FILTER, id)
  }

  const [filterOpen, setFilterOpen] = useState(false)

  const activeStatus = productStatuses.find(s => s.id === filterStatusId)
  const hasActiveFilters = filterStatusId !== null || filterCatId !== null || filterFieldId !== null || sortBy !== 'createdAt' || sortDir !== 'desc'
  const archivedCount = products.filter(p => p.archived).length

  // Продукти, чиє значення обраного кастомного поля збігається з обраним —
  // resolve відбувається тут (а не в .filter нижче) заради читабельності.
  const matchingFieldProductIds = (() => {
    if (!filterField || filterFieldValue === null) return null
    return new Set(
      allFieldValues
        .filter(v => v.fieldDefinitionId === filterField.id && (
          filterField.fieldType === 'boolean'
            ? String(v.valueBoolean) === filterFieldValue
            : v.valueOptionId === filterFieldValue
        ))
        .map(v => v.entityId)
    )
  })()

  const filtered = products
    .filter(p => {
      const matchArchived = showArchived ? p.archived : !p.archived
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
      const matchStatus = filterStatusId === null || p.statusId === filterStatusId
      const matchCat = filterCatId === null || p.categoryId === filterCatId
      const matchField = matchingFieldProductIds === null || matchingFieldProductIds.has(p.id)
      return matchArchived && matchSearch && matchStatus && matchCat && matchField
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name, 'uk')
      else cmp = a[sortBy] - b[sortBy]
      return sortDir === 'asc' ? cmp : -cmp
    })

  const getCat = (id: string | null) => categories.find(c => c.id === id)

  /** Формує друковану специфікацію собівартості продукту (матеріали + операції)
   *  за наданим шаблоном і відкриває діалог друку — користувач зберігає як PDF. */
  const handleExportCost = (product: Product) => {
    const catCat = getCat(product.categoryId)
    const catName = catCat ? tn(catCat.name, catCat.nameEn) : ''

    const matRows = product.materials.map(pm => {
      const material = materials.find(m => m.id === pm.materialId)
      const unitCost = material?.cost ?? 0
      return { name: material ? tn(material.name, material.nameEn) : '—', qty: pm.qty, unit: tn(pm.unitShortName, pm.unitShortNameEn), unitCost, total: unitCost * pm.qty }
    })
    const opRows = product.operations.map(po => {
      const opCat = operations.find(o => o.id === po.operationId)
      return {
        opName: opCat ? tn(opCat.name, opCat.nameEn) : '—',
        taskName: po.taskName || '—',
        minutes: po.durationMinutes ?? 0,
        cost: po.cost ?? 0,
      }
    })

    const materialsCost = matRows.reduce((s, r) => s + r.total, 0)
    const operationsCost = opRows.reduce((s, r) => s + r.cost, 0)
    const totalMinutes = opRows.reduce((s, r) => s + r.minutes, 0)
    const rowCount = Math.max(matRows.length, opRows.length, 1)

    const esc = escapeHtml
    const bodyRows = Array.from({ length: rowCount }, (_, i) => {
      const m = matRows[i]
      const o = opRows[i]
      return `<tr>
        <td>${m ? esc(m.name) : ''}</td>
        <td>${m ? `${fmt(m.qty)} ${esc(m.unit)}` : ''}</td>
        <td>${m ? fmt(m.unitCost) : ''}</td>
        <td>${m ? fmt(m.total) : ''}</td>
        <td>${o ? esc(o.opName) : ''}</td>
        <td>${o ? esc(o.taskName) : ''}</td>
        <td>${o ? fmt(o.minutes) : ''}</td>
        <td>${o ? fmt(o.cost) : ''}</td>
      </tr>`
    }).join('')

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>${esc(t('costExport.title', { name: product.name }))}</title>
    <meta charset="utf-8" />
    <style>
      body{font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#1e293b;margin:24px}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #cbd5e1;padding:6px 9px;text-align:left;vertical-align:middle}
      th{background:#e2e8f0;font-weight:600;font-size:11px}
      .summary{margin-bottom:14px}
      .summary td{font-size:12px}
      .label{font-weight:600;background:#f8fafc;white-space:nowrap}
      .pink{background:#f0dced}
      .yellow th{background:#fde68a}
      @media print { @page { size: landscape; margin: 12mm } }
    </style></head><body>
    <table class="summary">
      <tr>
        <td class="label">${esc(t('costExport.productName'))}</td><td>${esc(product.name)}</td>
        <td class="label pink">${esc(t('productView.materialsCost'))}</td><td class="pink">${fmt(materialsCost)} ${currencySymbol}</td>
        <td class="label pink" colspan="2">${esc(t('costExport.totalMinutesLabel'))}</td><td class="pink">${fmt(totalMinutes)} ${esc(t('common.minutesShort'))}</td>
      </tr>
      <tr>
        <td class="label">${esc(t('costExport.collectionName'))}</td><td>${esc(catName)}</td>
        <td class="label pink">${esc(t('productView.operationsCost'))}</td><td class="pink">${fmt(operationsCost)} ₴</td>
        <td colspan="3"></td>
      </tr>
    </table>
    <table>
      <thead><tr class="yellow">
        <th>${esc(t('costExport.materialNameHeader'))}</th>
        <th>${esc(t('costExport.qtyNeededHeader'))}</th>
        <th>${esc(t('costExport.unitCostHeader'))}</th>
        <th>${esc(t('costExport.totalCostHeader'))}</th>
        <th>${esc(t('costExport.operationNameHeader'))}</th>
        <th>${esc(t('costExport.taskNameHeader'))}</th>
        <th>${esc(t('costExport.minutesHeader'))}</th>
        <th>${esc(t('costExport.operationsCostHeader'))}</th>
      </tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <script>window.onload=()=>{window.print()}<\/script>
    </body></html>`)
    win.document.close()
  }

  if (editId !== null) {
    return <ProductEditor productId={editId === 'new' ? null : editId} onBack={() => setEditId(null)} />
  }
  if (viewId !== null) {
    // Якщо сюди прийшли по deep-link'у з іншої сторінки (напр. деталізації дашборду) —
    // "назад" повертає туди, а не в загальний список продуктів. Це стосується лише
    // першого показу (сам deep-link), поки користувач ще не переключився на щось інше.
    const backToOrigin = viewId === initialViewId && initialViewReturnTo
      ? () => onNavigate(initialViewReturnTo)
      : () => setViewId(null)
    return <ProductView productId={viewId} onBack={backToOrigin} onEdit={() => { setEditId(viewId); setViewId(null) }} />
  }
  if (quickAction !== null) {
    // Той самий "назад до джерела" патерн, що й viewId вище — актуально для
    // MaterialUsagePage.tsx (Дашборди), яка відкриває "Специфікацію" саме
    // цим deep-link'ом (?product=...&view=materials&from=dashboards&sub=materialUsage).
    const backToOrigin = quickAction.productId === initialQuickActionProductId && initialViewReturnTo
      ? () => onNavigate(initialViewReturnTo)
      : () => setQuickAction(null)
    return <SpecificationPage productId={quickAction.productId} type={quickAction.type} onBack={backToOrigin} />
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-start justify-between mb-1">
          <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl text-slate-800">{t('products.title')}</h1>
          {canEditProducts && (
            <button onClick={() => setEditId('new')}
              className="flex items-center gap-1.5 rounded-2xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white active:scale-95 transition-all shrink-0 mt-1">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              {t('products.new')}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 mb-4">
          <p className="text-xs text-slate-400">
            {filtered.length !== products.length
              ? <>{t('products.filteredOfTotal', { filtered: filtered.length, total: products.length })} · {activeStatus ? <span style={{ color: activeStatus.color }}>{tn(activeStatus.name, activeStatus.nameEn)}</span> : t('filters.all')}</>
              : <>{filtered.length} {t('products.items')}</>
            }
          </p>
          {(archivedCount > 0 || showArchived) && (
            <button onClick={() => setShowArchived(v => !v)}
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all"
              style={showArchived ? { background: '#1e293b', color: '#fff' } : { background: '#f1f5f9', color: '#64748b' }}>
              {showArchived ? t('products.toActive') : t('products.archiveWithCount', { count: archivedCount })}
            </button>
          )}
        </div>

        {/* Search + filter row */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input type="search" placeholder={t('products.search')} value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
          </div>
          {/* Filter/sort button */}
          <button onClick={() => setFilterOpen(v => !v)}
            className="relative flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-2xl border transition-all active:scale-95"
            style={hasActiveFilters
              ? { background: '#1e293b', borderColor: '#1e293b', color: '#fff' }
              : { background: '#fff', borderColor: '#e2e8f0', color: '#64748b' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            {hasActiveFilters && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-blue-400 border-2 border-white" />
            )}
          </button>
        </div>

        {filterOpen && (
          <div className="mb-3 rounded-2xl bg-white p-4 space-y-3"
            style={{ border: '1px solid rgba(157,200,255,0.3)', boxShadow: '0 2px 12px rgba(157,200,255,0.1)' }}>
            {/* Category filter */}
                {categories.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('filters.category')}</p>
                    {!catSectionOpen ? (
                      // Згорнутий вигляд — звичайний select, як інші фільтри
                      <button onClick={() => setCatSectionOpen(true)}
                        className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-2.5 py-2.5 text-sm text-left transition-all active:scale-[0.99]">
                        <span className="text-slate-800">{selectedCatLabel}</span>
                        <svg className="text-slate-400 shrink-0" width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <path d="M2 3.5l3.5 4 3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="w-full flex items-center gap-1 rounded-2xl overflow-hidden"
                          style={filterCatId === null
                            ? { background: '#1e293b', border: '1px solid #1e293b' }
                            : { background: '#f8fafc', border: '1px solid rgba(157,200,255,0.25)' }}>
                          <button onClick={() => setFilterCatId(null)} className="flex-1 flex items-center gap-3 px-4 py-2.5 text-left">
                            <div className="h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: filterCatId === null ? 'white' : '#cbd5e1' }}>
                              {filterCatId === null && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </div>
                            <span className="text-sm font-medium" style={{ color: filterCatId === null ? 'white' : '#1e293b' }}>{t('common.allCategories')}</span>
                          </button>
                          {/* Шеврон згортає всю секцію "Категорія" назад у компактний select */}
                          <button onClick={() => setCatSectionOpen(false)} className="flex h-9 w-9 items-center justify-center shrink-0"
                            style={{ color: filterCatId === null ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>
                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ transform: 'rotate(180deg)' }}>
                              <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                        {categories.filter(c => c.parentId === null).map(cat => (
                          <CategoryTreeNode key={cat.id} cat={cat} depth={0} allCats={categories} selectedId={filterCatId}
                            expandedIds={expandedFilterCats} onSelect={setFilterCatId} onToggleExpand={toggleExpandFilterCat} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* Sort */}
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('filters.sort')}</p>
                  <div className="space-y-1">
                    {([['name', t('filters.sortByName')], ['createdAt', t('filters.sortByCreated')], ['updatedAt', t('filters.sortByUpdated')]] as ['name' | 'createdAt' | 'updatedAt', string][]).map(([key, label]) => {
                      const active = sortBy === key
                      return (
                        <button key={key} onClick={() => toggleSort(key)}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-all"
                          style={active ? { background: '#f8fafc', color: '#1e293b' } : { color: '#64748b' }}>
                          <span className={active ? 'font-medium' : ''}>{label}</span>
                          {active && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                              style={{ transform: sortDir === 'asc' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                              <path d="M2 4l4 4 4-4" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {/* Status filter */}
                {productStatuses.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('filters.status')}</p>
                    <div className="space-y-1">
                      <button onClick={() => setFilter(null)}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all"
                        style={filterStatusId === null ? { background: '#f8fafc', color: '#1e293b', fontWeight: 500 } : { color: '#64748b' }}>
                        <span className="h-2 w-2 rounded-full bg-slate-300" />
                        {t('filters.all')}
                      </button>
                      {productStatuses.map(s => {
                        const active = filterStatusId === s.id
                        return (
                          <button key={s.id} onClick={() => setFilter(active ? null : s.id)}
                            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all"
                            style={active ? { background: s.color + '12', color: s.color, fontWeight: 500 } : { color: '#64748b' }}>
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                            {tn(s.name, s.nameEn)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {/* Кастомне поле — спершу яке поле (лише select/boolean мають
                    дискретні значення, зручні для фільтра), тоді яке значення. */}
                {productFields.filter(f => f.fieldType === 'select' || f.fieldType === 'boolean').length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('filters.customField')}</p>
                    <select value={filterFieldId ?? ''} onChange={e => { setFilterFieldId(e.target.value || null); setFilterFieldValue(null) }}
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-all mb-1.5">
                      <option value="">{t('filters.allFields')}</option>
                      {productFields.filter(f => f.fieldType === 'select' || f.fieldType === 'boolean').map(f => (
                        <option key={f.id} value={f.id}>{tn(f.name, f.nameEn)}</option>
                      ))}
                    </select>
                    {filterField && (
                      <div className="space-y-1">
                        {filterField.fieldType === 'boolean' ? (
                          [['true', t('common.yes')], ['false', t('common.no')]].map(([val, label]) => {
                            const active = filterFieldValue === val
                            return (
                              <button key={val} onClick={() => setFilterFieldValue(active ? null : val)}
                                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all"
                                style={active ? { background: '#f8fafc', color: '#1e293b', fontWeight: 500 } : { color: '#64748b' }}>
                                {label}
                              </button>
                            )
                          })
                        ) : (
                          filterField.options.map(o => {
                            const active = filterFieldValue === o.id
                            return (
                              <button key={o.id} onClick={() => setFilterFieldValue(active ? null : o.id)}
                                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all"
                                style={active ? { background: '#f8fafc', color: '#1e293b', fontWeight: 500 } : { color: '#64748b' }}>
                                {tn(o.value, o.valueEn)}
                              </button>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
                {/* Reset */}
                {hasActiveFilters && (
                  <button onClick={() => { setFilter(defaultStatusId); setFilterCatId(null); setFilterFieldId(null); setFilterFieldValue(null); setSortBy('createdAt'); setSortDir('desc'); lsSet(LS_SORT_BY, 'createdAt'); lsSet(LS_SORT_DIR, 'desc') }}
                    className="w-full rounded-xl py-2 text-xs text-slate-400 hover:text-red-400 transition-colors text-center">
                    {t('filters.reset')}
                  </button>
                )}
              </div>
            )}

      </div>

      {/* Cards */}
      <div className="px-4 space-y-3 pb-8">
        {productsQ.isLoading ? (
          <div className="py-10 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white py-14 text-center" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            <p className="text-2xl mb-2">📦</p>
            <p className="text-sm text-slate-400">{showArchived ? t('products.archiveEmpty') : t('products.empty')}</p>
          </div>
        ) : (
          filtered.map(product => {
            const cat = getCat(product.categoryId)
            const statusObj = productStatuses.find(s => s.id === product.statusId)
            return (
              <div key={product.id} className="rounded-2xl bg-white"
                style={{ border: '1px solid rgba(157,200,255,0.22)', boxShadow: '0 1px 10px rgba(157,200,255,0.09)' }}>
                {/* Main row — tap opens view; фото збільшене (за макетом Figma
                    node 72-36516), назва/sku/бейджі та кнопка "Специфікація"
                    стоять поруч у стовпчик на всю висоту фото. */}
                <div role="button" tabIndex={0} onClick={() => { listScrollY.current = window.scrollY; setViewId(product.id) }} onKeyDown={e => { if (e.key === 'Enter') { listScrollY.current = window.scrollY; setViewId(product.id) } }} className="flex w-full items-stretch gap-3 px-4 pt-4 pb-4 cursor-pointer">
                  <div className="w-40 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                    {product.photo
                      ? <img src={product.photo} alt={product.name} loading="lazy" className="h-full w-full object-cover" />
                      : <div className="h-full w-full flex items-center justify-center text-slate-300">
                          <svg width="32" height="32" viewBox="0 0 20 20" fill="none"><rect x="2" y="2" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.4"/><path d="M2 13l4-4 3 3 3-3 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                    }
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{product.name}</p>
                        <p className="text-xs font-mono text-slate-400 mt-0.5">{product.sku}</p>
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          {product.archived && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-600">{t('products.archived')}</span>
                          )}
                          {statusObj && (
                            <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusObj.color }} />
                              {tn(statusObj.name, statusObj.nameEn)}
                            </span>
                          )}
                          {cat && (
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ background: '#f5f3ff', color: cat.color ?? '#7c3aed' }}>{tn(cat.name, cat.nameEn)}</span>
                          )}
                          {product.materials.length > 0 && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-600">
                              {t('products.materialsCount', { count: product.materials.length })}
                            </span>
                          )}
                          {product.operations.length > 0 && (
                            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] text-orange-500">
                              {t('products.operationsCount', { count: product.operations.length })}
                            </span>
                          )}
                          {product.attributes.length > 0 && (
                            <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                              {t('products.attributesCount', { count: product.attributes.length })}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* More actions — редагування продукту (доступно й "менеджеру
                          перегляд" — зміни логуються, sql/manager_view_role.sql);
                          stop propagation so card tap still works */}
                      {canEditProducts && (
                        <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setOpenMenu(openMenu === product.id ? null : product.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-all">
                            <MoreIcon />
                          </button>
                          {openMenu === product.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                              <div className="absolute right-0 top-9 z-20 w-52 rounded-2xl bg-white py-1.5"
                                style={{ border: '1px solid rgba(157,200,255,0.3)', boxShadow: '0 8px 32px rgba(15,23,42,0.14)' }}>
                                {showArchived ? (
                                  <MenuBtn icon={<ArchiveIcon />} label={t('products.returnFromArchive')} onClick={() => { archiveProduct(product.id, false); setOpenMenu(null) }} />
                                ) : (
                                  <>
                                    <MenuBtn icon={<PencilIcon />} label={t('common.edit')} onClick={() => { setEditId(product.id); setOpenMenu(null) }} />
                                    <MenuBtn icon={<QRIcon />} label={t('products.printQr')} onClick={() => { setQrProductId(product.id); setOpenMenu(null) }} />
                                    {/* Собівартість (матеріалів/операцій) — не для "менеджера перегляд" */}
                                    {isManager && (
                                      <MenuBtn icon={<CostIcon />} label={t('products.cost')} onClick={() => { handleExportCost(product); setOpenMenu(null) }} />
                                    )}
                                    <MenuBtn icon={<ArchiveIcon />} label={t('products.archive')} onClick={() => { archiveProduct(product.id, true); setOpenMenu(null) }} />
                                  </>
                                )}
                                {/* Видалити — лише адмін (і на рівні БД теж, не лише тут — sql/product_archive_and_delete.sql) */}
                                {isAdmin && (
                                  <>
                                    <div className="my-1 mx-3 border-t border-slate-100" />
                                    <MenuBtn icon={<TrashIcon />} label={t('common.delete')} danger onClick={() => { setConfirmDelete(product); setOpenMenu(null) }} />
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Специфікація (лише повний менеджер/адмін — "менеджер перегляд"
                        доступу до неї не має) і Завдання (форма створення з уже
                        обраним цим продуктом, доступна й "менеджеру перегляд") —
                        обидві притиснуті до низу стовпчика, врівень із фото. */}
                    <div className="mt-auto pt-3 space-y-2" onClick={e => e.stopPropagation()}>
                      {isManager && (
                      <button
                        onClick={() => setQuickAction({ productId: product.id, type: 'materials' })}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 py-2.5 text-xs font-medium text-amber-600 active:scale-[0.97] transition-all">
                        <LayersIcon />
                        <span className="text-center leading-4">
                          <span className="block">{t('products.specificationTitle')}</span>
                          <span className="block">{t('products.materialsAndOperationsLabel')}</span>
                        </span>
                      </button>
                      )}
                      <button
                        onClick={() => setTaskProductId(product.id)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-2.5 text-xs font-medium text-white active:scale-[0.97] transition-all">
                        <TaskIcon />
                        {t('nav.tasks')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* QR modal */}
      {qrProductId !== null && (
        <QRModal productId={qrProductId} products={products} onClose={() => setQrProductId(null)} />
      )}

      {/* Форма створення завдання (кнопка "Завдання" на картці) */}
      {taskProductId !== null && currentUser && (
        <AssignmentFormSheet
          currentUser={currentUser}
          isManager={canAssignTasks}
          users={usersQ.data ?? []}
          products={products}
          operations={operations}
          initialProductId={taskProductId}
          onClose={() => setTaskProductId(null)}
          onCreated={() => { setTaskProductId(null); showToast(t('assignments.toastCreated')) }}
        />
      )}

      {/* Підтвердження видалення — лише адмін. БД тут нічого не блокує (products.id
         скрізь ON DELETE CASCADE, на відміну від матеріалу), тож попереджаємо
         про масштаб наслідків самі, до підтвердження. */}
      {confirmDelete && (() => {
        const impact = deleteImpactQ.data
        const items = impact
          ? [
              impact.tasksCount > 0 ? t('products.deleteImpactTasks', { count: impact.tasksCount }) : null,
              impact.assignmentsCount > 0 ? t('products.deleteImpactAssignments', { count: impact.assignmentsCount }) : null,
              impact.specificationsCount > 0 ? t('products.deleteImpactSpecs', { count: impact.specificationsCount }) : null,
            ].filter((s): s is string => s !== null)
          : []
        return (
          <ConfirmDeleteModal
            message={t('products.deleteConfirm', { name: confirmDelete.name })}
            warning={items.length > 0 ? t('products.deleteImpactWarning', { items: items.join(', ') }) : undefined}
            onCancel={() => setConfirmDelete(null)}
            onConfirm={() => { removeProduct(confirmDelete.id); setConfirmDelete(null) }}
          />
        )
      })()}

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
    </div>
  )
}

/* ── QR Modal ── */
function QRModal({ productId, products, onClose }: { productId: string; products: Product[]; onClose: () => void }) {
  const { t } = useLocale()
  const product = products.find(p => p.id === productId)
  if (!product) return null
  const qrUrl = `${window.location.origin}/?product=${product.id}`
  const labelContent = { svgElementId: 'qr-svg-print', name: product.name, code: product.sku }

  const handlePrint = () => printQrLabel(labelContent, product.name)
  const handleDownloadImage = () => downloadQrLabelPng(labelContent, `qr-${product.sku || product.id}.png`)

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-3xl bg-white pb-10 sm:rounded-3xl sm:w-full sm:max-w-md">
        <div className="flex justify-center pt-3 pb-4">
          <button onClick={onClose} className="h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
        </div>
        <div className="flex flex-col items-center px-6 gap-4">
          <p style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-slate-800">{product.name}</p>
          <p className="text-xs font-mono text-slate-400">{product.sku}</p>
          {/* QR Code */}
          <div className="rounded-2xl bg-white p-5" style={{ border: '1px solid rgba(157,200,255,0.3)' }}>
            <QRCodeLib id="qr-svg-print" value={qrUrl} size={180} />
          </div>
          <p className="text-[10px] text-slate-400 text-center">{t('products.qrHint')}</p>
          <div className="flex gap-2 w-full pt-2">
            <button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm text-slate-600">
              {t('common.close')}
            </button>
            <button onClick={handleDownloadImage}
              className="flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 px-3.5 py-3 text-sm font-medium text-slate-600">
              <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1v7.5M3.5 6l3 3 3-3M2 11.5h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              PNG
            </button>
            <button onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-slate-800 py-3 text-sm font-medium text-white">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 5V2h8v3M3 9H2a1 1 0 01-1-1V6a1 1 0 011-1h10a1 1 0 011 1v2a1 1 0 01-1 1h-1M3 9v3h8V9H3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              </svg>
              {t('common.print')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function QRIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="5" height="5" rx="0.8" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8" y="1" width="5" height="5" rx="0.8" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="1" y="8" width="5" height="5" rx="0.8" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="2.5" y="2.5" width="2" height="2" fill="currentColor" rx="0.3"/>
      <rect x="9.5" y="2.5" width="2" height="2" fill="currentColor" rx="0.3"/>
      <rect x="2.5" y="9.5" width="2" height="2" fill="currentColor" rx="0.3"/>
      <path d="M8 8h1.5v1.5H8zM9.5 9.5H11V11H9.5zM11 8h2v1.5h-2zM8 11h2v2H8z" fill="currentColor"/>
    </svg>
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

function CostIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7 3.7v6.6M9 5.2c0-.8-.9-1.5-2-1.5s-2 .6-2 1.4c0 .9.9 1.2 2 1.4 1.1.2 2 .6 2 1.4 0 .8-.9 1.4-2 1.4s-2-.6-2-1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
      <path d="M1.5 3.5h10v2h-10v-2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M2.5 5.5v5.5a1 1 0 001 1h5a1 1 0 001-1V5.5M5.3 8h2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
      <path d="M2 3h9M4 3V2h5v1M5 6v4M8 6v4M3 3l.5 8h6l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function MenuBtn({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm transition-all hover:bg-slate-50 active:scale-[0.98]"
      style={{ color: danger ? '#ef4444' : '#334155' }}>
      {icon}
      {label}
    </button>
  )
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
      <path d="M9 2l2 2-7 7H2v-2L9 2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function LayersIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M7 1L13 4.5L7 8L1 4.5L7 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M1 9.5L7 13L13 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function TaskIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <rect x="2" y="1" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M4.5 4.5h5M4.5 7h5M4.5 9.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
