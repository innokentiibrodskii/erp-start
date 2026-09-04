import { useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import * as XLSX from 'xlsx'
import { useProducts, useProductStatuses } from './hooks/useProducts'
import { useMaterials } from './hooks/useMaterials'
import { useCatalog } from './hooks/useCatalog'
import { useCustomFieldDefinitions, useAllCustomFieldValues, type CustomFieldDefinition } from './hooks/useCustomFields'
import { useMaterialCostCurrency, useOperationCostCurrency, CURRENCY_SYMBOL, type Currency } from './hooks/useOrgSettings'
import { useLatestProductCostLocks, useProductCostLockHistory, useLockProductCosts, type LatestProductCostLock, type ProductCostLockHistoryEntry } from './hooks/useProductCostLocks'
import { useActiveOrgId } from './OrgContext'
import { useLocale } from './LocaleContext'
import { fmt, dateStr } from './lib/materialFormat'
import { SubPageHeader } from './DirectoryCatalog'
import { CategoryTreeNode } from './CategoryTreeNode'

/* ───────────────────────────────────────────────────────────
   Дашборди → "Собівартість продукції" (Figma node 89:4669) — за
   продуктом: собівартість матеріалів (material.cost × qty) і операцій
   (product_operations.cost, уже готова — той самий розрахунок, що й
   useDashboardStats.ts/useDrilldownRecords і ProductCatalog.tsx/
   handleExportCost), плюс загальна вартість.

   На відміну від MaterialUsagePage.tsx (сусідня таблиця, той самий
   архітектурний підхід — пошук/фільтри/resizable-sticky колонки/експорт),
   тут рядок = один продукт, без групування й розгортання.

   Собівартість матеріалів рахується у material_cost_currency, операцій —
   в operation_cost_currency (useOrgSettings.ts). Коли вони різні, пряма
   сума неможлива — з'являється ручний блок "Валюта прорахунку"/"Курс":
   курс означає "1 [обрана валюта] = [курс] [інша валюта]", сума в іншій
   валюті ділиться на курс і додається до суми в обраній.
─────────────────────────────────────────────────────────── */

const FILTER_UNSET = '__unset__'

const LS_COL_WIDTHS = 'productCost_colWidths'
const DEFAULT_COL_WIDTHS: Record<string, number> = { name: 220, sku: 110, materialsCost: 150, operationsCost: 150, totalCost: 150, lockedCost: 180 }
const MIN_COL_WIDTH = 60

const PHOTO_WIDTH = 44
const ROW_PAD_LEFT = 16
// Висота одного бейджа статистики/валюти — блок статистики фіксованої
// висоти (один рядок), overflow:hidden ховає зайві бейджі, доки не
// розгорнути шевроном.
const STATS_ROW_HEIGHT = 48
const GRID_GAP = 8
const STICKY_BLEED_OUTER = ROW_PAD_LEFT + 8
const STICKY_BLEED_INNER = 8
function stickyLeftWidth(nameWidth: number): number {
  return PHOTO_WIDTH + GRID_GAP + nameWidth
}
const CELL_BORDER_COLOR = 'rgba(157,200,255,0.25)'
const CELL_BORDER: CSSProperties = { borderRight: `1px solid ${CELL_BORDER_COLOR}` }

/** Той самий прийом, що й MaterialUsagePage.tsx: асиметричний bleed
 *  (щедрий у бік власного padding рядка, малий у бік сусідньої реальної
 *  колонки) — інакше на скролі крізь непокритий gap між sticky-комірками
 *  проступає нижній вміст. Див. детальний коментар там. */
function stickyStyle(left: number | null, right: number | null, bg: string, outerSide: 'left' | 'right'): CSSProperties {
  const outer = `${outerSide === 'left' ? '-' : ''}${STICKY_BLEED_OUTER}px 0 0 0 ${bg}`
  const inner = `${outerSide === 'left' ? '' : '-'}${STICKY_BLEED_INNER}px 0 0 0 ${bg}`
  const border = `inset ${outerSide === 'left' ? '-1px' : '1px'} 0 0 0 ${CELL_BORDER_COLOR}`
  const s: CSSProperties = { position: 'sticky', zIndex: 5, background: bg, boxShadow: `${outer}, ${inner}, ${border}` }
  if (left !== null) s.left = left
  if (right !== null) s.right = right
  return s
}

const LS_CALC_CURRENCY = (orgId: string) => `productCost_calcCurrency_${orgId}`
const LS_RATE = (orgId: string) => `productCost_rate_${orgId}`
const LS_STAT_FIELDS = (orgId: string) => `productCost_statFields_${orgId}`
// Ширина одного бейджа статистики в сітці — з фіксованим мінімумом усі
// бейджі виходять однакового розміру, незалежно від довжини цифри/підпису.
const STAT_BADGE_MIN_WIDTH = 158

interface CostRow {
  id: string
  name: string
  sku: string
  photo: string | null
  categoryId: string | null
  statusId: string | null
  materialsCost: number
  operationsCost: number
}

// sub=productCost — Shell.tsx відкриває цю саму таблицю (а не верхній рівень
// дашбордів), коли користувач натискає "назад" зі специфікації продукту,
// відкритої звідси (той самий deep-link патерн, що й MaterialUsagePage.tsx).
const goToProductSpec = (id: string) => { window.location.href = `${window.location.pathname}?product=${id}&from=dashboards&view=materials&sub=productCost` }

export default function ProductCostPage({ onBack }: { onBack: () => void }) {
  const { t, tn } = useLocale()
  const orgId = useActiveOrgId()

  const productsQ = useProducts()
  const materialsQ = useMaterials()
  const { categories } = useCatalog()
  const statusesQ = useProductStatuses()
  const productStatuses = statusesQ.data ?? []
  const products = (productsQ.data ?? []).filter(p => !p.archived)
  const materials = materialsQ.data ?? []
  const materialById = useMemo(() => new Map(materials.map(m => [m.id, m])), [materials])

  const productFieldsQ = useCustomFieldDefinitions('product')
  const productFields = productFieldsQ.data ?? []
  const productValuesQ = useAllCustomFieldValues('product')
  const productValues = productValuesQ.data ?? []
  // Бейджі статистики "Типів продуктів"/"Силуетів" на макеті — узагальнено:
  // одна картка на кожне SELECT-поле кастомних полів продукту (не прив'язано
  // до конкретних назв полів, тож коректно для будь-якого набору полів).
  const selectProductFields = productFields.filter(f => f.fieldType === 'select')

  const materialCurrencyQ = useMaterialCostCurrency()
  const operationCurrencyQ = useOperationCostCurrency()
  const materialCurrency = materialCurrencyQ.data ?? 'UAH'
  const operationCurrency = operationCurrencyQ.data ?? 'UAH'
  const materialCurrencySymbol = CURRENCY_SYMBOL[materialCurrency]
  const operationCurrencySymbol = CURRENCY_SYMBOL[operationCurrency]
  const currenciesDiffer = materialCurrency !== operationCurrency

  const [calcCurrency, setCalcCurrency] = useState<Currency>(() => {
    try {
      const saved = localStorage.getItem(LS_CALC_CURRENCY(orgId))
      if (saved === 'UAH' || saved === 'USD' || saved === 'EUR') return saved
    } catch { /* ignore */ }
    return materialCurrency
  })
  const [rateInput, setRateInput] = useState<string>(() => {
    try { return localStorage.getItem(LS_RATE(orgId)) ?? '' } catch { return '' }
  })
  const setCalcCurrencyPersist = (c: Currency) => {
    setCalcCurrency(c)
    try { localStorage.setItem(LS_CALC_CURRENCY(orgId), c) } catch { /* ignore */ }
  }
  const setRatePersist = (v: string) => {
    setRateInput(v)
    try { localStorage.setItem(LS_RATE(orgId), v) } catch { /* ignore */ }
  }
  const otherCurrency: Currency = calcCurrency === materialCurrency ? operationCurrency : materialCurrency
  const rate = Number(rateInput)
  const hasValidRate = rateInput.trim() !== '' && Number.isFinite(rate) && rate > 0
  const totalCurrencySymbol = currenciesDiffer ? CURRENCY_SYMBOL[calcCurrency] : CURRENCY_SYMBOL[materialCurrency]

  // Фіксація собівартості (sql/product_cost_locks.sql) — незмінний історичний
  // знімок: дата, курс/валюта на момент фіксації і сама собівартість кожного
  // продукту тоді. Нова колонка "Собівартість станом на DD.MM.YYYY" бере
  // останній знімок на продукт; "⋮" → "Історія собівартості" — усі знімки.
  const latestLocksQ = useLatestProductCostLocks()
  const latestLocks = latestLocksQ.data ?? new Map<string, LatestProductCostLock>()
  const { lockProductCosts, isLocking } = useLockProductCosts()
  const [historyProductId, setHistoryProductId] = useState<string | null>(null)
  const latestLockDate = useMemo(() => {
    let max: number | null = null
    for (const v of latestLocks.values()) if (max === null || v.lockedAt > max) max = v.lockedAt
    return max
  }, [latestLocks])
  const [toast, setToast] = useState<string | null>(null)
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2200) }

  const [search, setSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [statsExpanded, setStatsExpanded] = useState(false)
  // Які кастомні поля показувати бейджем у статистиці — null означає "усі"
  // (дефолт: щойно додане нове select-поле одразу з'являється бейджем, без
  // потреби вручну вмикати). Явний масив зберігається лише після першого
  // ручного перемикання користувачем.
  const [visibleStatFieldIds, setVisibleStatFieldIds] = useState<string[] | null>(() => {
    try {
      const saved = localStorage.getItem(LS_STAT_FIELDS(orgId))
      if (saved) return JSON.parse(saved)
    } catch { /* ignore */ }
    return null
  })
  const [statFieldPickerOpen, setStatFieldPickerOpen] = useState(false)
  const visibleSelectFields = selectProductFields.filter(d => visibleStatFieldIds === null || visibleStatFieldIds.includes(d.id))
  const toggleStatField = (id: string) => setVisibleStatFieldIds(prev => {
    const current = prev ?? selectProductFields.map(f => f.id)
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id]
    try { localStorage.setItem(LS_STAT_FIELDS(orgId), JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })
  const [categoryId, setCategoryId] = useState('')
  const [statusId, setStatusId] = useState<string | null>(null)
  const [fieldId, setFieldId] = useState('')
  const [fieldValueIds, setFieldValueIds] = useState<string[]>([])
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  // Sticky-комірки (фото+назва зліва, "⋮" справа) малюють власне непрозоре тло
  // inline-стилем (stickyStyle) — inline style завжди переважає над Tailwind-класом
  // (напр. group-hover:bg-slate-50), тож самим лише класом підсвітити їх при
  // ховері рядка неможливо: лишався б білий "короб" поверх підсвіченого рядка.
  // Тому колір ховеру рахуємо в JS і передаємо прямо в stickyStyle.
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [catSectionOpen, setCatSectionOpen] = useState(false)
  const [expandedFilterCats, setExpandedFilterCats] = useState<string[]>([])
  const toggleExpandFilterCat = (id: string) => setExpandedFilterCats(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  const [fieldSectionOpen, setFieldSectionOpen] = useState(false)

  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(LS_COL_WIDTHS)
      if (saved) return { ...DEFAULT_COL_WIDTHS, ...JSON.parse(saved) }
    } catch { /* ignore */ }
    return DEFAULT_COL_WIDTHS
  })
  const colWidth = (key: string) => colWidths[key] ?? 120
  const resizeCol = (key: string, deltaX: number) => setColWidths(w => {
    const next = { ...w, [key]: Math.max(MIN_COL_WIDTH, (w[key] ?? colWidth(key)) + deltaX) }
    try { localStorage.setItem(LS_COL_WIDTHS, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })

  const filterableFields = productFields.filter(f => f.fieldType === 'select' || f.fieldType === 'boolean')
  const field = productFields.find(f => f.id === fieldId) ?? null
  const toggleFieldValue = (id: string) => setFieldValueIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])

  const matchingProductIds = useMemo(() => {
    if (!field || fieldValueIds.length === 0) return null
    const realIds = fieldValueIds.filter(id => id !== FILTER_UNSET)
    const matches = new Set(
      productValues
        .filter(v => v.fieldDefinitionId === field.id && (
          field.fieldType === 'boolean' ? realIds.includes(String(v.valueBoolean)) : v.valueOptionId !== null && realIds.includes(v.valueOptionId)
        ))
        .map(v => v.entityId)
    )
    if (fieldValueIds.includes(FILTER_UNSET)) {
      const withValueIds = new Set(productValues.filter(v => v.fieldDefinitionId === field.id).map(v => v.entityId))
      for (const p of products) if (!withValueIds.has(p.id)) matches.add(p.id)
    }
    return matches
  }, [field, fieldValueIds, productValues, products])

  const allRows = useMemo<CostRow[]>(() => products.map(p => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    photo: p.photo,
    categoryId: p.categoryId,
    statusId: p.statusId,
    materialsCost: p.materials.reduce((sum, pm) => sum + (materialById.get(pm.materialId)?.cost ?? 0) * pm.qty, 0),
    operationsCost: p.operations.reduce((sum, po) => sum + (po.cost ?? 0), 0),
  })), [products, materialById])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allRows.filter(r => {
      const matchSearch = !q || r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)
      const matchCategory = !categoryId || r.categoryId === categoryId
      const matchStatus = statusId === null || r.statusId === statusId
      const matchField = matchingProductIds === null || matchingProductIds.has(r.id)
      return matchSearch && matchCategory && matchStatus && matchField
    })
  }, [allRows, search, categoryId, statusId, matchingProductIds])

  const sortedRows = useMemo(() => filteredRows.slice().sort((a, b) => a.name.localeCompare(b.name, 'uk')), [filteredRows])

  const totalCostFor = (r: CostRow): number | null => {
    if (!currenciesDiffer) return r.materialsCost + r.operationsCost
    if (!hasValidRate) return null
    const materialsInCalc = calcCurrency === materialCurrency ? r.materialsCost : r.materialsCost * rate
    const operationsInCalc = calcCurrency === operationCurrency ? r.operationsCost : r.operationsCost / rate
    return materialsInCalc + operationsInCalc
  }

  const hasActiveFilters = !!categoryId || statusId !== null || fieldValueIds.length > 0
  const resetFilters = () => { setCategoryId(''); setStatusId(null); setFieldId(''); setFieldValueIds([]) }

  const categoryName = (id: string | null): string => {
    const c = categories.find(c => c.id === id)
    return c ? tn(c.name, c.nameEn) : ''
  }
  const filterCat = categoryId ? categories.find(c => c.id === categoryId) ?? null : null
  const selectedCatLabel = filterCat ? tn(filterCat.name, filterCat.nameEn) : t('common.allCategories')

  const distinctFieldValueCount = (d: CustomFieldDefinition): number => {
    const ids = new Set(sortedRows.map(r => r.id))
    const used = new Set(
      productValues
        .filter(v => v.fieldDefinitionId === d.id && v.valueOptionId !== null && ids.has(v.entityId))
        .map(v => v.valueOptionId as string)
    )
    return used.size
  }

  // Округлення до десятих — у самих даних (не лише відображенні) числа з
  // плаваючою комою мають довгі хвости на кшталт 65.29517; для файлу
  // експорту, на відміну від живого fmt() на екрані, це варто округлити.
  const round1 = (n: number) => Math.round(n * 10) / 10

  const exportExcel = () => {
    const headerRow = [
      t('productCost.exportColName'), t('productCost.exportColSku'), t('productCost.exportColCategory'),
      `${t('productCost.exportColMaterialsCost')} (${materialCurrencySymbol})`,
      `${t('productCost.exportColOperationsCost')} (${operationCurrencySymbol})`,
      `${t('productCost.exportColTotalCost')} (${totalCurrencySymbol})`,
    ]
    const dataRows = sortedRows.map(r => {
      const total = totalCostFor(r)
      return [r.name, r.sku, categoryName(r.categoryId), round1(r.materialsCost), round1(r.operationsCost), total !== null ? round1(total) : '']
    })
    // Дата експорту — окремим рядком над заголовком таблиці (не лише в назві
    // файлу), щоб було видно й після перейменування/пересилання файлу.
    const dateRow = [`${t('productCost.exportDateLabel')}: ${dateStr(Date.now())}`]
    const sheet = XLSX.utils.aoa_to_sheet([dateRow, [], headerRow, ...dataRows])
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, t('productCost.exportSheetName').slice(0, 31))
    XLSX.writeFile(book, `${t('productCost.exportFileName')}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const gridTemplate = [
    `${stickyLeftWidth(colWidth('name'))}px`, `${colWidth('sku')}px`,
    `${colWidth('materialsCost')}px`, `${colWidth('operationsCost')}px`, `${colWidth('totalCost')}px`, `${colWidth('lockedCost')}px`, '36px',
  ].join(' ')

  const isLoading = productsQ.isLoading || materialsQ.isLoading

  // Фіксувати можна лише те, що реально порахувалось (не "—" через відсутній
  // курс) — рядки з null-тотал просто не потрапляють у знімок.
  const canLock = sortedRows.length > 0 && !(currenciesDiffer && !hasValidRate)
  const handleLock = async () => {
    const rows = sortedRows
      .map(r => {
        const total = totalCostFor(r)
        return total !== null ? { productId: r.id, materialsCost: r.materialsCost, operationsCost: r.operationsCost, totalCost: total } : null
      })
      .filter((x): x is { productId: string; materialsCost: number; operationsCost: number; totalCost: number } => x !== null)
    if (rows.length === 0) return
    await lockProductCosts({
      calcCurrency: currenciesDiffer ? calcCurrency : materialCurrency,
      rate: currenciesDiffer ? rate : null,
      materialCurrency, operationCurrency,
      rows,
    })
    showToast(t('productCost.toastLocked', { count: rows.length }))
  }

  if (historyProductId !== null) {
    const product = sortedRows.find(r => r.id === historyProductId)
    return <ProductCostHistoryView productId={historyProductId} productName={product?.name ?? ''} onBack={() => setHistoryProductId(null)} />
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="pointer-events-none fixed top-5 left-1/2 z-50 -translate-x-1/2 transition-all duration-300"
        style={{ opacity: toast ? 1 : 0, transform: `translateX(-50%) translateY(${toast ? 0 : -12}px)` }}>
        <div className="flex items-center gap-2 rounded-2xl bg-slate-800 px-5 py-3 text-sm font-medium text-white shadow-xl">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M2.5 7.5l3.5 3.5 6.5-7" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {toast}
        </div>
      </div>

      <SubPageHeader title={t('productCost.title')} subtitle={t('directory.countRecords', { count: sortedRows.length })} onBack={onBack} />

      <div className="px-4 pt-3 space-y-3">
        {/* flex-wrap — на вузьких екранах кнопки (з текстом лише від sm:)
           переносяться на другий рядок замість того, щоб розпирати сторінку
           по горизонталі (сторінка сама ніколи не повинна скролитись вбік —
           лише таблиця нижче, у власному overflow-x-auto). */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('productCost.searchPlaceholder')}
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
          </div>
          <button onClick={handleLock} disabled={!canLock || isLocking} title={!canLock ? t('productCost.noRateHint') : undefined}
            className="flex items-center gap-1.5 rounded-2xl bg-amber-500 px-3.5 sm:px-4 py-2.5 text-xs font-semibold text-white active:scale-95 transition-all shrink-0 disabled:opacity-40">
            <LockIcon />
            <span className="hidden sm:inline">{t('productCost.lockButton')}</span>
          </button>
          <button onClick={exportExcel} disabled={sortedRows.length === 0}
            className="flex items-center gap-1.5 rounded-2xl bg-slate-800 px-3.5 sm:px-4 py-2.5 text-xs font-semibold text-white active:scale-95 transition-all shrink-0 disabled:opacity-40">
            <DownloadIcon />
            <span className="hidden sm:inline">{t('productCost.exportButton')}</span>
          </button>
          <button onClick={() => setFilterOpen(v => !v)}
            className="relative flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-2xl border transition-all active:scale-95"
            style={hasActiveFilters ? { background: '#1e293b', borderColor: '#1e293b', color: '#fff' } : { background: '#fff', borderColor: '#e2e8f0', color: '#64748b' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            {hasActiveFilters && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-blue-400 border-2 border-white" />}
          </button>
        </div>

        {/* Блок статистики має фіксовану висоту в один рядок — якщо бейджів
           (кастомних полів) більше, ніж влазить, зайві ховаються під
           overflow:hidden, і шеврон розгортає другий рядок. "Валюта
           прорахунку"/"Курс" — поза цим рядком що переносить, завжди
           закріплені у верхній частині, ніколи не переносяться самі.
           flex-wrap — на вузьких екранах валюта/курс/шеврон переносяться під
           бейджі замість того, щоб розпирати сторінку по горизонталі. */}
        <div className="flex flex-wrap items-start gap-2">
          {/* CSS grid (не flex) — усі бейджі однакової ширини колонки,
             незалежно від довжини цифри/підпису (напр. "60" проти "2"). */}
          <div className="flex-1 min-w-0 overflow-hidden"
            style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${STAT_BADGE_MIN_WIDTH}px, 1fr))`, gap: 8, maxHeight: statsExpanded ? undefined : STATS_ROW_HEIGHT }}>
            <div className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2" style={{ border: '1px solid rgba(157,200,255,0.3)' }}>
              <span className="text-2xl font-semibold text-slate-800 shrink-0">{sortedRows.length}</span>
              <span className="text-[11px] leading-tight text-slate-400 min-w-0">{t('productCost.statProducts')}</span>
            </div>
            {visibleSelectFields.map(d => (
              <div key={d.id} className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2" style={{ border: '1px solid rgba(157,200,255,0.3)' }}>
                <span className="text-2xl font-semibold text-slate-800 shrink-0">{distinctFieldValueCount(d)}</span>
                <span className="text-[11px] leading-tight text-slate-400 min-w-0">{tn(d.name, d.nameEn)}</span>
              </div>
            ))}
          </div>

          {/* Плитка "Налаштувати" — того самого розміру, що бейджі, але
             СВІДОМО поза grid-контейнером вище: той контейнер має
             overflow:hidden (щоб клампати висоту в один рядок, доки не
             розгорнули шевроном), і випадний список полів усередині нього
             обрізався б/був невидимий, навіть коли відкритий. */}
          <div className="relative shrink-0" style={{ width: STAT_BADGE_MIN_WIDTH }}>
            <button onClick={() => setStatFieldPickerOpen(v => !v)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-all"
              style={{ width: '100%', height: STATS_ROW_HEIGHT }}>
              <SettingsIcon />
              <span className="text-[11px] font-medium">{t('productCost.customizeStats')}</span>
            </button>
            {statFieldPickerOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setStatFieldPickerOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-20 w-56 max-h-72 overflow-y-auto rounded-2xl bg-white py-1.5"
                  style={{ border: '1px solid rgba(157,200,255,0.3)', boxShadow: '0 8px 32px rgba(15,23,42,0.14)' }}>
                  {selectProductFields.map(d => (
                    <label key={d.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-slate-700 cursor-pointer hover:bg-slate-50">
                      <span className="truncate">{tn(d.name, d.nameEn)}</span>
                      <input type="checkbox" checked={visibleStatFieldIds === null || visibleStatFieldIds.includes(d.id)}
                        onChange={() => toggleStatField(d.id)} className="h-4 w-4 rounded accent-slate-800 shrink-0" />
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Валюта прорахунку/Курс — лише коли валюта матеріалів і операцій
             реально різна (інакше зайвий контрол, пряма сума й так коректна). */}
          {currenciesDiffer && (
            <>
              <div className="shrink-0 flex items-center gap-2 rounded-xl bg-white px-3 py-2" style={{ border: '1px solid rgba(157,200,255,0.3)', height: STATS_ROW_HEIGHT }}>
                <span className="text-[11px] leading-tight text-slate-400">{t('productCost.calcCurrencyLabel')}</span>
                <select value={calcCurrency} onChange={e => setCalcCurrencyPersist(e.target.value as Currency)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400">
                  <option value={materialCurrency}>{CURRENCY_SYMBOL[materialCurrency]}</option>
                  <option value={operationCurrency}>{CURRENCY_SYMBOL[operationCurrency]}</option>
                </select>
              </div>
              <div className="shrink-0 flex items-center gap-2 rounded-xl bg-white px-3 py-2" style={{ border: '1px solid rgba(157,200,255,0.3)', height: STATS_ROW_HEIGHT }}>
                <span className="text-[11px] leading-tight text-slate-400 whitespace-nowrap">
                  {t('productCost.rateLabel', { calc: CURRENCY_SYMBOL[calcCurrency], other: CURRENCY_SYMBOL[otherCurrency] })}
                </span>
                <input type="number" min="0" step="any" value={rateInput} onChange={e => setRatePersist(e.target.value)} placeholder="0"
                  className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400" />
              </div>
            </>
          )}
          <button onClick={() => setStatsExpanded(v => !v)}
            className="shrink-0 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-slate-600 transition-all"
            style={{ width: STATS_ROW_HEIGHT, height: STATS_ROW_HEIGHT }}>
            <svg width="12" height="12" viewBox="0 0 11 11" fill="none" style={{ transform: statsExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
              <path d="M2 3.5l3.5 4 3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        {currenciesDiffer && !hasValidRate && (
          <p className="text-[11px] text-amber-600">{t('productCost.noRateHint')}</p>
        )}

        {filterOpen && (
          <div className="rounded-2xl bg-white p-4 space-y-3" style={{ border: '1px solid rgba(157,200,255,0.3)', boxShadow: '0 2px 12px rgba(157,200,255,0.1)' }}>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('productCost.filterCategoryLabel')}</p>
              {!catSectionOpen ? (
                <button onClick={() => setCatSectionOpen(true)}
                  className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-2.5 py-2.5 text-sm text-left transition-all active:scale-[0.99]">
                  <span className="text-slate-800 truncate">{selectedCatLabel}</span>
                  <svg className="text-slate-400 shrink-0" width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M2 3.5l3.5 4 3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  <div className="w-full flex items-center gap-1 rounded-2xl overflow-hidden"
                    style={categoryId === '' ? { background: '#1e293b', border: '1px solid #1e293b' } : { background: '#f8fafc', border: '1px solid rgba(157,200,255,0.25)' }}>
                    <button onClick={() => setCategoryId('')} className="flex-1 flex items-center gap-3 px-4 py-2.5 text-left">
                      <div className="h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: categoryId === '' ? 'white' : '#cbd5e1' }}>
                        {categoryId === '' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>
                      <span className="text-sm font-medium" style={{ color: categoryId === '' ? 'white' : '#1e293b' }}>{t('common.allCategories')}</span>
                    </button>
                    <button onClick={() => setCatSectionOpen(false)} className="flex h-9 w-9 items-center justify-center shrink-0"
                      style={{ color: categoryId === '' ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ transform: 'rotate(180deg)' }}>
                        <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                  {categories.filter(c => c.parentId === null).map(cat => (
                    <CategoryTreeNode key={cat.id} cat={cat} depth={0} allCats={categories} selectedId={categoryId || null}
                      expandedIds={expandedFilterCats} onSelect={id => setCategoryId(id)} onToggleExpand={toggleExpandFilterCat} />
                  ))}
                </div>
              )}
            </div>

            {productStatuses.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('filters.status')}</p>
                <div className="space-y-1">
                  <button onClick={() => setStatusId(null)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all"
                    style={statusId === null ? { background: '#f8fafc', color: '#1e293b', fontWeight: 500 } : { color: '#64748b' }}>
                    <span className="h-2 w-2 rounded-full bg-slate-300" />
                    {t('filters.all')}
                  </button>
                  {productStatuses.map(s => {
                    const active = statusId === s.id
                    return (
                      <button key={s.id} onClick={() => setStatusId(active ? null : s.id)}
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

            {filterableFields.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('productCost.filterFieldLabel')}</p>
                {!fieldSectionOpen ? (
                  <button onClick={() => setFieldSectionOpen(true)}
                    className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-2.5 py-2.5 text-sm text-left transition-all active:scale-[0.99]">
                    <span className="text-slate-800 truncate">{field ? tn(field.name, field.nameEn) : t('filters.allFields')}</span>
                    <svg className="text-slate-400 shrink-0" width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M2 3.5l3.5 4 3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                ) : (
                  <div className="space-y-1 max-h-56 overflow-y-auto mb-1.5">
                    <div className="flex items-center gap-1 rounded-2xl overflow-hidden"
                      style={fieldId === '' ? { background: '#1e293b', border: '1px solid #1e293b' } : { background: '#f8fafc', border: '1px solid rgba(157,200,255,0.25)' }}>
                      <button onClick={() => { setFieldId(''); setFieldValueIds([]) }} className="flex-1 px-4 py-2.5 text-left text-sm font-medium" style={{ color: fieldId === '' ? 'white' : '#1e293b' }}>
                        {t('filters.allFields')}
                      </button>
                      <button onClick={() => setFieldSectionOpen(false)} className="flex h-9 w-9 items-center justify-center shrink-0"
                        style={{ color: fieldId === '' ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ transform: 'rotate(180deg)' }}>
                          <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                    {filterableFields.map(f => {
                      const active = fieldId === f.id
                      return (
                        <button key={f.id} onClick={() => { setFieldId(active ? '' : f.id); setFieldValueIds([]) }}
                          className="flex w-full items-center rounded-xl px-3 py-2 text-sm transition-all"
                          style={active ? { background: '#f8fafc', color: '#1e293b', fontWeight: 500 } : { color: '#64748b' }}>
                          {tn(f.name, f.nameEn)}
                        </button>
                      )
                    })}
                  </div>
                )}
                {field && (
                  <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <label className="flex items-center justify-between rounded-lg bg-white px-3 py-2 cursor-pointer" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
                      <span className="text-sm text-slate-600">{t('productCost.filterNotSet')}</span>
                      <input type="checkbox" checked={fieldValueIds.includes(FILTER_UNSET)} onChange={() => toggleFieldValue(FILTER_UNSET)}
                        className="h-4 w-4 rounded accent-slate-800" />
                    </label>
                    {(field.fieldType === 'boolean'
                      ? [['true', t('common.yes')], ['false', t('common.no')]]
                      : field.options.map(o => [o.id, tn(o.value, o.valueEn)] as [string, string])
                    ).map(([val, label]) => (
                      <label key={val} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 cursor-pointer" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
                        <span className="text-sm text-slate-600">{label}</span>
                        <input type="checkbox" checked={fieldValueIds.includes(val)} onChange={() => toggleFieldValue(val)}
                          className="h-4 w-4 rounded accent-slate-800" />
                      </label>
                    ))}
                    <p className="text-[10px] text-slate-400 px-1">{t('productCost.filterValueHint')}</p>
                  </div>
                )}
              </div>
            )}
            {hasActiveFilters && (
              <button onClick={resetFilters} className="w-full rounded-xl py-2 text-xs text-slate-400 hover:text-red-400 transition-colors text-center">
                {t('filters.reset')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="px-4 py-4 pb-8">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : sortedRows.length === 0 ? (
          <div className="rounded-2xl bg-white py-12 text-center text-sm text-slate-400" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            {t('productCost.emptyState')}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white" style={{ border: '1px solid rgba(157,200,255,0.22)', boxShadow: '0 1px 6px rgba(157,200,255,0.07)' }}>
            <div style={{ width: 'max-content' }}>
              <div className="grid items-center gap-2 px-4 py-3 bg-[#fafbff]" style={{ gridTemplateColumns: gridTemplate, borderBottom: '1px solid rgba(157,200,255,0.2)' }}>
                <div className="flex items-center" style={{ ...stickyStyle(ROW_PAD_LEFT, null, '#fafbff', 'left'), gap: GRID_GAP }}>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400" style={{ width: PHOTO_WIDTH }}>{t('productCost.colPhoto')}</span>
                  <ResizableTh label={t('productCost.colName')} onResize={d => resizeCol('name', d)} className="shrink-0" style={{ width: colWidth('name') }} />
                </div>
                <ResizableTh label={t('productCost.colSku')} align="center" onResize={d => resizeCol('sku', d)} style={CELL_BORDER} />
                <ResizableTh label={`${t('productCost.colMaterialsCost')} (${materialCurrencySymbol})`} align="center" onResize={d => resizeCol('materialsCost', d)} style={CELL_BORDER} />
                <ResizableTh label={`${t('productCost.colOperationsCost')} (${operationCurrencySymbol})`} align="center" onResize={d => resizeCol('operationsCost', d)} style={CELL_BORDER} />
                <ResizableTh label={`${t('productCost.colTotalCost')} (${totalCurrencySymbol})`} align="center" onResize={d => resizeCol('totalCost', d)} style={CELL_BORDER} />
                <ResizableTh label={latestLockDate ? `${t('productCost.colLockedCost')} ${dateStr(latestLockDate)}` : t('productCost.colLockedCost')}
                  align="center" onResize={d => resizeCol('lockedCost', d)} style={CELL_BORDER} />
                <span style={stickyStyle(null, 0, '#fafbff', 'right')} />
              </div>

              {sortedRows.map(r => {
                const total = totalCostFor(r)
                const rowBg = hoveredRow === r.id ? '#f8fafc' : '#fff'
                return (
                  <div key={r.id} className="grid items-center gap-2 px-4 py-2.5 transition-colors"
                    style={{ gridTemplateColumns: gridTemplate, borderBottom: '1px solid rgba(157,200,255,0.12)', background: rowBg }}
                    onMouseEnter={() => setHoveredRow(r.id)} onMouseLeave={() => setHoveredRow(null)}>
                    <div className="flex items-center" style={{ ...stickyStyle(ROW_PAD_LEFT, null, rowBg, 'left'), gap: GRID_GAP }}>
                      <div className="shrink-0 flex items-center justify-center" style={{ width: PHOTO_WIDTH }}>
                        <div className="h-9 w-9 rounded-lg overflow-hidden bg-amber-50 flex items-center justify-center text-amber-400">
                          {r.photo
                            ? <img src={r.photo} alt="" loading="lazy" className="h-full w-full object-cover" />
                            : <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                                <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                                <path d="M2 4.5L8 8L14 4.5M8 15V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>}
                        </div>
                      </div>
                      <button onClick={() => goToProductSpec(r.id)} className="min-w-0 shrink-0 text-left" style={{ width: colWidth('name') }}>
                        <p className="text-sm font-semibold truncate text-blue-600 hover:underline">{r.name}</p>
                        {r.categoryId && <p className="text-[11px] text-slate-400 truncate">{categoryName(r.categoryId)}</p>}
                      </button>
                    </div>
                    <span className="self-stretch flex items-center justify-center text-xs text-slate-400 font-mono truncate" style={CELL_BORDER}>{r.sku}</span>
                    <span className="self-stretch flex items-center justify-center text-sm font-medium text-slate-700 whitespace-nowrap" style={CELL_BORDER}>{fmt(r.materialsCost)} {materialCurrencySymbol}</span>
                    <span className="self-stretch flex items-center justify-center text-sm font-medium text-slate-700 whitespace-nowrap" style={CELL_BORDER}>{fmt(r.operationsCost)} {operationCurrencySymbol}</span>
                    <span className="self-stretch flex items-center justify-center text-sm font-semibold text-slate-800 whitespace-nowrap" style={CELL_BORDER}>
                      {total !== null ? `${fmt(total)} ${totalCurrencySymbol}` : '—'}
                    </span>
                    <span className="self-stretch flex items-center justify-center text-sm font-medium text-slate-600 whitespace-nowrap" style={CELL_BORDER}>
                      {(() => {
                        const locked = latestLocks.get(r.id)
                        return locked ? `${fmt(locked.totalCost)} ${CURRENCY_SYMBOL[locked.calcCurrency]}` : '—'
                      })()}
                    </span>
                    {/* zIndex піднімається, лише коли меню ЦЬОГО рядка відкрите — інакше
                       наступний (нижчий) рядок, чия sticky-колонка йде пізніше в DOM
                       з тим самим z-index, малюється поверх меню (той самий z-index у
                       сусідніх stacking context — виграє останній у DOM-порядку). */}
                    <div className="relative" style={{ ...stickyStyle(null, 0, rowBg, 'right'), zIndex: openMenu === r.id ? 50 : 5 }}>
                      <button onClick={() => setOpenMenu(openMenu === r.id ? null : r.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-blue-500 hover:bg-slate-100 transition-all">
                        <MoreIcon />
                      </button>
                      {openMenu === r.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                          <div className="absolute right-0 top-8 z-20 w-56 rounded-2xl bg-white py-1.5" style={{ border: '1px solid rgba(157,200,255,0.3)', boxShadow: '0 8px 32px rgba(15,23,42,0.14)' }}>
                            <MenuBtn icon={<LayersIcon />} label={t('productCost.actionSpecification')} onClick={() => { setOpenMenu(null); goToProductSpec(r.id) }} />
                            <MenuBtn icon={<HistoryIcon />} label={t('productCost.actionHistory')} onClick={() => { setOpenMenu(null); setHistoryProductId(r.id) }} />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** "⋮" → "Історія собівартості" — усі минулі фіксації одного продукту,
 *  найновіші перші (useProductCostLockHistory). */
function ProductCostHistoryView({ productId, productName, onBack }: { productId: string; productName: string; onBack: () => void }) {
  const { t } = useLocale()
  const historyQ = useProductCostLockHistory(productId)
  const history = historyQ.data ?? []

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title={t('productCost.historyTitle')} subtitle={productName} onBack={onBack} />
      <div className="px-4 py-4 space-y-2">
        {historyQ.isLoading ? (
          <div className="py-10 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : history.length === 0 ? (
          <div className="rounded-2xl bg-white py-12 text-center text-sm text-slate-400" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            {t('productCost.historyEmpty')}
          </div>
        ) : history.map((h: ProductCostLockHistoryEntry, i: number) => (
          <div key={h.batchId} className="rounded-2xl bg-white p-4" style={{ border: '1px solid rgba(157,200,255,0.22)', boxShadow: '0 1px 6px rgba(157,200,255,0.07)' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-800">{dateStr(h.lockedAt)}</p>
                {i === 0 && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: '#dcfce7', color: '#16a34a' }}>{t('productCost.historyLatest')}</span>
                )}
              </div>
              <span className="text-xs text-slate-400">{h.lockedByName}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">{t('productCost.colMaterialsCost')}</p>
                <p className="font-medium text-slate-700">{fmt(h.materialsCost)} {CURRENCY_SYMBOL[h.materialCurrency]}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">{t('productCost.colOperationsCost')}</p>
                <p className="font-medium text-slate-700">{fmt(h.operationsCost)} {CURRENCY_SYMBOL[h.operationCurrency]}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">{t('productCost.colTotalCost')}</p>
                <p className="font-semibold text-slate-800">{fmt(h.totalCost)} {CURRENCY_SYMBOL[h.calcCurrency]}</p>
              </div>
            </div>
            {h.rate !== null && h.materialCurrency !== h.operationCurrency && (
              <p className="mt-2 text-[11px] text-slate-400">
                {t('productCost.rateLabel', { calc: CURRENCY_SYMBOL[h.calcCurrency], other: CURRENCY_SYMBOL[h.calcCurrency === h.materialCurrency ? h.operationCurrency : h.materialCurrency] })} {fmt(h.rate)}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5v8M4 6.5l3 3 3-3M2 11.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function SettingsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7 1.5v1.4M7 11.1v1.4M12.5 7h-1.4M2.9 7H1.5M10.7 3.3l-1 1M4.3 9.7l-1 1M10.7 10.7l-1-1M4.3 4.3l-1-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <rect x="2.5" y="6.5" width="9" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M4.5 6.5V4.5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
function HistoryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1a6 6 0 106 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M7 1L4.5 2.3M7 1l1 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 4v3l2 1.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
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
function LayersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1L13 4.5L7 8L1 4.5L7 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M1 9.5L7 13L13 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function MenuBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98]">
      {icon}
      {label}
    </button>
  )
}

function ResizableTh({ label, onResize, align, style, className }: {
  label: string
  onResize: (deltaX: number) => void
  align?: 'right' | 'center'
  style?: CSSProperties
  className?: string
}) {
  const justify = align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start'
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''
  return (
    <div className={`relative self-stretch flex items-center min-w-0 pr-3 ${className ?? ''}`} style={{ justifyContent: justify, ...style }}>
      <span className={`text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate ${textAlign}`}>{label}</span>
      <ColResizeHandle onResize={onResize} />
    </div>
  )
}

function ColResizeHandle({ onResize }: { onResize: (deltaX: number) => void }) {
  const onPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    let lastX = e.clientX
    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - lastX
      lastX = ev.clientX
      onResize(delta)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  return (
    <div onPointerDown={onPointerDown} onClick={e => e.stopPropagation()}
      className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-3 flex items-center justify-center cursor-col-resize select-none"
      style={{ touchAction: 'none' }}>
      {/* Лінія видима лише на ховері — permanent межу між колонками вже малює
         CELL_BORDER (той самий бордер, що й у тілі таблиці); якщо тримати цю
         лінію завжди видимою (як раніше, bg-slate-300), поруч з CELL_BORDER
         вона дублюється в темнішу "подвійну" лінію на межі колонок. */}
      <div className="h-4 w-px bg-transparent hover:bg-blue-400 hover:w-0.5 transition-all mx-auto" />
    </div>
  )
}
