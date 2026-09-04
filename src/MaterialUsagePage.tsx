import { useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import * as XLSX from 'xlsx'
import { useProducts } from './hooks/useProducts'
import { useMaterials, type Material } from './hooks/useMaterials'
import { useCatalog } from './hooks/useCatalog'
import { useCustomFieldDefinitions, useAllCustomFieldValues, type CustomFieldDefinition } from './hooks/useCustomFields'
import { useLatestProductSpecifications } from './hooks/useProductSpecifications'
import { useCurrentUser } from './hooks/useCurrentUser'
import { useLocale } from './LocaleContext'
import { fmt, dateStr } from './lib/materialFormat'
import { SubPageHeader } from './DirectoryCatalog'
import { CategoryTreeNode } from './CategoryTreeNode'
import type { TranslationKey } from './i18n'

/* ───────────────────────────────────────────────────────────
   Дашборди → "Матеріали, які використовуються у продукції" — перенесено
   з Довідники → Матеріали → "Використовуються у продукціях"
   (sql/material_usage_custom_field_flag.sql лишається чинним — колонки
   showInMaterialUsage тут теж показуються) за макетом Figma
   (node 207:6249): фото матеріалу, групування з розгортанням (замість
   завжди розгорнутого rowSpan), к-сть/операція/продукт по кожному
   рядку специфікації, статистика зверху, фільтри по категорії
   матеріалу/продукту/кастомних полях обох сутностей, експорт у Excel.
─────────────────────────────────────────────────────────── */

/** Псевдо-значення фільтра за кастомним полем: рядки, де це поле взагалі не
 *  заповнене — той самий підхід, що й у PrintFormsPage.tsx (Look book). */
const FILTER_UNSET = '__unset__'

const LS_COL_WIDTHS = 'materialUsage_colWidths'
const DEFAULT_COL_WIDTHS: Record<string, number> = { material: 220, code: 100, qty: 90, operation: 120, specStatus: 130, specDate: 110, product: 150 }
const MIN_COL_WIDTH = 60

// Закріплена (sticky) зона зліва — шеврон розгортання, фото й назва
// матеріалу — та закріплена праворуч колонка "більше дій". Перша навмисно
// ОДНА sticky-комірка (не три окремі з grid-gap між ними): grid-gap не
// належить жодному grid-елементу, тож нічим не покритий — коли він лежить
// МІЖ двома незалежно закріпленими комірками, крізь нього на скролі
// проступає сусідня, не закріплена колонка цього ж рядка.
//
// Але лишається ще один зазор, не пов'язаний з gap-2 узагалі: сам px-4
// РЯДКА (ROW_PAD_LEFT) — це ЙОГО ВЛАСНИЙ (не sticky) відступ від краю
// scroll-контейнера до sticky-зони. При достатньому скролі вправо НЕ sticky
// колонка "Артикул" (вона йде одразу після sticky-зони) від'їжджає ліворуч
// НАСТІЛЬКИ, що опиняється рівно в цьому padding-проміжку — і той її
// "хвостик", що не встиг доїхати до самого лівого краю scroll-контейнера
// (де його вже обрізає overflow-x), лишається видимим у щілині між краєм
// контейнера й лівим краєм sticky-зони. Тому OUTER-запас (у бік цього
// padding, де немає нічого "свого") — щедрий, аж до краю контейнера;
// INNER-запас (у бік сусідньої, реальної колонки цього ж рядка, яку не
// можна ховати) — свідомо малий, лише підстраховка від дробових пікселів.
const CHEVRON_WIDTH = 28
const PHOTO_WIDTH = 44
const ROW_PAD_LEFT = 16
const GRID_GAP = 8
const STICKY_BLEED_OUTER = ROW_PAD_LEFT + 8
const STICKY_BLEED_INNER = 8
function stickyLeftWidth(materialWidth: number): number {
  return CHEVRON_WIDTH + GRID_GAP + PHOTO_WIDTH + GRID_GAP + materialWidth
}
const CELL_BORDER_COLOR = 'rgba(157,200,255,0.25)'
const CELL_BORDER: CSSProperties = { borderRight: `1px solid ${CELL_BORDER_COLOR}` }

/** bg обов'язковий — це й "заливка" boxShadow, що перекриває стики з обох
 *  боків. side визначає, який бік — "зовнішній" (у бік власного padding
 *  рядка, де можна щедро заливати) чи "внутрішній" (у бік сусідньої
 *  реальної колонки цього ж рядка, де запас має лишатись малим — і саме
 *  на цьому боці малюємо межу колонки, inset-тінню, щоб не зсунути layout). */
function stickyStyle(left: number | null, right: number | null, bg: string, outerSide: 'left' | 'right'): CSSProperties {
  const outer = `${outerSide === 'left' ? '-' : ''}${STICKY_BLEED_OUTER}px 0 0 0 ${bg}`
  const inner = `${outerSide === 'left' ? '' : '-'}${STICKY_BLEED_INNER}px 0 0 0 ${bg}`
  const border = `inset ${outerSide === 'left' ? '-1px' : '1px'} 0 0 0 ${CELL_BORDER_COLOR}`
  const s: CSSProperties = { position: 'sticky', zIndex: 5, background: bg, boxShadow: `${outer}, ${inner}, ${border}` }
  if (left !== null) s.left = left
  if (right !== null) s.right = right
  return s
}

/** Статус специфікації продукту — той самий розрахунок, що й SpecificationPage.tsx
 *  (specEditing ? 'draft' : (latestVersion?.status ?? 'none')), лише одразу по
 *  всіх продуктах у таблиці (useLatestProductSpecifications). */
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

interface UsageRow {
  key: string
  productId: string
  productName: string
  productSku: string
  materialId: string
  qty: number
  unitShortName: string
  unitShortNameEn: string | null
  operationId: string | null
}

interface MaterialGroup {
  material: Material
  rows: UsageRow[]
}

// sub=materialUsage — Shell.tsx відкриває цю саму таблицю (а не верхній рівень
// дашбордів), коли користувач натискає "назад" з картки матеріалу/специфікації.
const goToMaterial = (id: string) => { window.location.href = `${window.location.pathname}?material=${id}&from=dashboards&sub=materialUsage` }
// "Специфікація" — та сама шторка матеріалів/операцій продукту, що й на
// картці продукту (view=materials), той самий deep-link патерн, що вже
// використовує DashboardsPage.tsx (goToRecord) для деталізації "Специфікація".
const goToProductSpec = (id: string) => { window.location.href = `${window.location.pathname}?product=${id}&from=dashboards&view=materials&sub=materialUsage` }

export default function MaterialUsagePage({ onBack }: { onBack: () => void }) {
  const { t, tn } = useLocale()
  const { data: currentUser } = useCurrentUser()
  const canOpenMaterial = currentUser?.role === 'admin' || currentUser?.role === 'manager'

  const productsQ = useProducts()
  const materialsQ = useMaterials()
  const { operations, materialCategories } = useCatalog()
  const products = (productsQ.data ?? []).filter(p => !p.archived)
  const materials = materialsQ.data ?? []

  const materialFieldsQ = useCustomFieldDefinitions('material')
  const materialFields = materialFieldsQ.data ?? []
  const materialValuesQ = useAllCustomFieldValues('material')
  const materialValues = materialValuesQ.data ?? []
  // Ці поля матеріалу вмикаються окремим перемикачем у конструкторі кастомних
  // полів (Довідники → Кастомні поля → Матеріали) — не всі доречні в
  // загальній таблиці використання.
  const materialUsageFields = materialFields.filter(f => f.showInMaterialUsage)

  const productFieldsQ = useCustomFieldDefinitions('product')
  const productFields = productFieldsQ.data ?? []
  const productValuesQ = useAllCustomFieldValues('product')
  const productValues = productValuesQ.data ?? []

  const latestSpecsQ = useLatestProductSpecifications()
  const specStatusByProductId = useMemo(() => {
    const latestById = new Map(latestSpecsQ.data?.map(s => [s.productId, s]))
    const map = new Map<string, { status: SpecStatus; activatedAt: number | null }>()
    for (const p of products) {
      const latest = latestById.get(p.id)
      map.set(p.id, {
        status: p.specificationEditing ? 'draft' : (latest?.status ?? 'none'),
        activatedAt: latest?.activatedAt ?? null,
      })
    }
    return map
  }, [products, latestSpecsQ.data])

  const isLoading = productsQ.isLoading || materialsQ.isLoading

  const [search, setSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [categoryId, setCategoryId] = useState('')
  const [productId, setProductId] = useState('')
  const [materialFieldId, setMaterialFieldId] = useState('')
  const [materialFieldValueIds, setMaterialFieldValueIds] = useState<string[]>([])
  const [productFieldId, setProductFieldId] = useState('')
  const [productFieldValueIds, setProductFieldValueIds] = useState<string[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  // Той самий "компактний select → розгорнутий список" патерн, що й секція
  // "Категорія" у фільтрі матеріалів (MaterialStock.tsx) і продуктів (ProductCatalog.tsx).
  const [catSectionOpen, setCatSectionOpen] = useState(false)
  const [expandedFilterCats, setExpandedFilterCats] = useState<string[]>([])
  const toggleExpandFilterCat = (id: string) => setExpandedFilterCats(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  const [productSectionOpen, setProductSectionOpen] = useState(false)
  const [productFilterQuery, setProductFilterQuery] = useState('')
  const [materialFieldSectionOpen, setMaterialFieldSectionOpen] = useState(false)
  const [productFieldSectionOpen, setProductFieldSectionOpen] = useState(false)

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

  const materialFilterableFields = materialFields.filter(f => f.fieldType === 'select' || f.fieldType === 'boolean')
  const productFilterableFields = productFields.filter(f => f.fieldType === 'select' || f.fieldType === 'boolean')
  const materialField = materialFields.find(f => f.id === materialFieldId) ?? null
  const productField = productFields.find(f => f.id === productFieldId) ?? null
  const toggleMaterialFieldValue = (id: string) => setMaterialFieldValueIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  const toggleProductFieldValue = (id: string) => setProductFieldValueIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])

  const matchingMaterialIds = useMemo(() => {
    if (!materialField || materialFieldValueIds.length === 0) return null
    const realIds = materialFieldValueIds.filter(id => id !== FILTER_UNSET)
    const matches = new Set(
      materialValues
        .filter(v => v.fieldDefinitionId === materialField.id && (
          materialField.fieldType === 'boolean' ? realIds.includes(String(v.valueBoolean)) : v.valueOptionId !== null && realIds.includes(v.valueOptionId)
        ))
        .map(v => v.entityId)
    )
    if (materialFieldValueIds.includes(FILTER_UNSET)) {
      const withValueIds = new Set(materialValues.filter(v => v.fieldDefinitionId === materialField.id).map(v => v.entityId))
      for (const m of materials) if (!withValueIds.has(m.id)) matches.add(m.id)
    }
    return matches
  }, [materialField, materialFieldValueIds, materialValues, materials])

  const matchingProductIds = useMemo(() => {
    if (!productField || productFieldValueIds.length === 0) return null
    const realIds = productFieldValueIds.filter(id => id !== FILTER_UNSET)
    const matches = new Set(
      productValues
        .filter(v => v.fieldDefinitionId === productField.id && (
          productField.fieldType === 'boolean' ? realIds.includes(String(v.valueBoolean)) : v.valueOptionId !== null && realIds.includes(v.valueOptionId)
        ))
        .map(v => v.entityId)
    )
    if (productFieldValueIds.includes(FILTER_UNSET)) {
      const withValueIds = new Set(productValues.filter(v => v.fieldDefinitionId === productField.id).map(v => v.entityId))
      for (const p of products) if (!withValueIds.has(p.id)) matches.add(p.id)
    }
    return matches
  }, [productField, productFieldValueIds, productValues, products])

  const materialById = useMemo(() => new Map(materials.map(m => [m.id, m])), [materials])
  const operationById = useMemo(() => new Map(operations.map(o => [o.id, o])), [operations])

  const allRows = useMemo<UsageRow[]>(() => products.flatMap(p => p.materials.map(pm => ({
    key: pm.id,
    productId: p.id,
    productName: p.name,
    productSku: p.sku,
    materialId: pm.materialId,
    qty: pm.qty,
    unitShortName: pm.unitShortName,
    unitShortNameEn: pm.unitShortNameEn,
    operationId: pm.operationId,
  }))), [products])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allRows.filter(r => {
      const material = materialById.get(r.materialId)
      const matchSearch = !q
        || r.productName.toLowerCase().includes(q)
        || r.productSku.toLowerCase().includes(q)
        || (material ? tn(material.name, material.nameEn).toLowerCase().includes(q) : false)
        || (material?.code ?? '').toLowerCase().includes(q)
      const matchCategory = !categoryId || material?.categoryId === categoryId
      const matchProduct = !productId || r.productId === productId
      const matchMaterialField = matchingMaterialIds === null || matchingMaterialIds.has(r.materialId)
      const matchProductField = matchingProductIds === null || matchingProductIds.has(r.productId)
      return matchSearch && matchCategory && matchProduct && matchMaterialField && matchProductField
    })
  }, [allRows, search, categoryId, productId, matchingMaterialIds, matchingProductIds, materialById, tn])

  const groups = useMemo<MaterialGroup[]>(() => {
    const byMaterial = new Map<string, UsageRow[]>()
    for (const r of filteredRows) {
      const arr = byMaterial.get(r.materialId)
      if (arr) arr.push(r)
      else byMaterial.set(r.materialId, [r])
    }
    const list: MaterialGroup[] = []
    for (const [materialId, rows] of byMaterial) {
      // Матеріал видалено з довідника, а рядок специфікації лишився — не
      // рендеримо групу без даних матеріалу (фото/код/категорія), як і
      // раніше ховались такі рядки в старій версії сторінки.
      const material = materialById.get(materialId)
      if (!material) continue
      rows.sort((a, b) => a.productName.localeCompare(b.productName, 'uk'))
      list.push({ material, rows })
    }
    list.sort((a, b) => tn(a.material.name, a.material.nameEn).localeCompare(tn(b.material.name, b.material.nameEn), 'uk'))
    return list
  }, [filteredRows, materialById, tn])

  const distinctProductCount = useMemo(() => new Set(filteredRows.map(r => r.productId)).size, [filteredRows])
  const distinctMaterialCount = groups.length

  const toggleExpand = (materialId: string) => setExpanded(s => {
    const next = new Set(s)
    if (next.has(materialId)) next.delete(materialId)
    else next.add(materialId)
    return next
  })

  const productsForFilter = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of allRows) if (!seen.has(r.productId)) seen.set(r.productId, r.productName)
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'uk'))
  }, [allRows])

  const hasActiveFilters = !!categoryId || !!productId || materialFieldValueIds.length > 0 || productFieldValueIds.length > 0

  const resetFilters = () => {
    setCategoryId('')
    setProductId('')
    setMaterialFieldId(''); setMaterialFieldValueIds([])
    setProductFieldId(''); setProductFieldValueIds([])
  }

  const categoryName = (id: string | null): string => {
    const c = materialCategories.find(c => c.id === id)
    return c ? tn(c.name, c.nameEn) : ''
  }
  const filterCat = categoryId ? materialCategories.find(c => c.id === categoryId) ?? null : null
  const selectedCatLabel = filterCat ? tn(filterCat.name, filterCat.nameEn) : t('common.allCategories')
  const selectedProductName = productId ? productsForFilter.find(p => p.id === productId)?.name ?? '' : ''
  const selectedProductLabel = productId ? selectedProductName : t('filters.all')
  const materialFieldValueText = (materialId: string, d: CustomFieldDefinition): string => {
    const v = materialValues.find(v => v.entityId === materialId && v.fieldDefinitionId === d.id)
    if (!v) return ''
    if (d.fieldType === 'boolean') return v.valueBoolean ? '✓' : ''
    if (d.fieldType === 'number') return v.valueNumber !== null ? fmt(v.valueNumber) : ''
    if (d.fieldType === 'select') {
      const opt = d.options.find(o => o.id === v.valueOptionId)
      return opt ? tn(opt.value, opt.valueEn) : ''
    }
    return v.valueText ?? ''
  }
  const operationName = (id: string | null): string => {
    if (!id) return '—'
    const o = operationById.get(id)
    return o ? tn(o.name, o.nameEn) : '—'
  }
  /** Агрегована операція групи (згорнутий рядок) — сама назва, якщо у всіх
   *  рядків та сама операція, інакше t('materialUsage.mixed') ("MIX"), як
   *  на макеті Figma. */
  const groupOperationLabel = (rows: UsageRow[]): string => {
    const ids = new Set(rows.map(r => r.operationId))
    if (ids.size === 1) return operationName(rows[0].operationId)
    return t('materialUsage.mixed')
  }

  const exportExcel = () => {
    const sheetRows = filteredRows.map(r => {
      const material = materialById.get(r.materialId)
      return {
        [t('materialUsage.exportColMaterial')]: material ? tn(material.name, material.nameEn) : '—',
        [t('materialUsage.exportColCode')]: material?.code ?? '',
        [t('materialUsage.exportColCategory')]: material ? categoryName(material.categoryId) : '',
        [t('materialUsage.exportColProduct')]: r.productName,
        [t('materialUsage.exportColSku')]: r.productSku,
        [t('materialUsage.exportColQty')]: r.qty,
        [t('materialUsage.exportColUnit')]: tn(r.unitShortName, r.unitShortNameEn),
        [t('materialUsage.exportColOperation')]: operationName(r.operationId),
      }
    })
    const sheet = XLSX.utils.json_to_sheet(sheetRows)
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, t('materialUsage.exportSheetName').slice(0, 31))
    XLSX.writeFile(book, `${t('materialUsage.exportFileName')}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // Ширина колонок регулюється користувачем (перетягуванням за правий край
  // заголовка) і зберігається в localStorage. Перший трек — ОДНА об'єднана
  // зона шеврон+фото+матеріал (stickyLeftWidth, div.dts. коментар вище),
  // дії — фіксовані (просто іконка), решта — resizable.
  const gridTemplate = [
    `${stickyLeftWidth(colWidth('material'))}px`, `${colWidth('code')}px`, `${colWidth('qty')}px`, `${colWidth('operation')}px`,
    ...materialUsageFields.map(d => `${colWidth(`field:${d.id}`)}px`),
    `${colWidth('product')}px`, `${colWidth('specStatus')}px`, `${colWidth('specDate')}px`, '36px',
  ].join(' ')

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title={t('materialUsage.title')} subtitle={t('directory.countRecords', { count: filteredRows.length })} onBack={onBack} />

      <div className="px-4 pt-3 space-y-3">
        {/* flex-wrap — на вузьких екранах кнопка переноситься на другий рядок
           замість того, щоб розпирати сторінку по горизонталі (сторінка сама
           ніколи не повинна скролитись вбік — лише таблиця, у власному
           overflow-x-auto нижче). */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('materialUsage.searchPlaceholder')}
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
          </div>
          <button onClick={exportExcel} disabled={filteredRows.length === 0}
            className="flex items-center gap-1.5 rounded-2xl bg-slate-800 px-3.5 sm:px-4 py-2.5 text-xs font-semibold text-white active:scale-95 transition-all shrink-0 disabled:opacity-40">
            <DownloadIcon />
            <span className="hidden sm:inline">{t('materialUsage.exportButton')}</span>
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

        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2" style={{ border: '1px solid rgba(157,200,255,0.3)' }}>
            <span className="text-2xl font-semibold text-slate-800">{distinctProductCount}</span>
            <span className="text-[11px] leading-tight text-slate-400 max-w-[70px]">{t('materialUsage.statProducts')}</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2" style={{ border: '1px solid rgba(157,200,255,0.3)' }}>
            <span className="text-2xl font-semibold text-slate-800">{distinctMaterialCount}</span>
            <span className="text-[11px] leading-tight text-slate-400 max-w-[70px]">{t('materialUsage.statMaterials')}</span>
          </div>
        </div>

        {filterOpen && (
          <div className="rounded-2xl bg-white p-4 space-y-3" style={{ border: '1px solid rgba(157,200,255,0.3)', boxShadow: '0 2px 12px rgba(157,200,255,0.1)' }}>
            {/* Категорія матеріалу — той самий патерн, що на сторінці Матеріали
               (MaterialStock.tsx): згорнутий compact-button, розгортається в
               ієрархічний список (CategoryTreeNode) з одиночним вибором. */}
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('materialUsage.filterCategoryLabel')}</p>
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
                  {materialCategories.filter(c => c.parentId === null).map(cat => (
                    <CategoryTreeNode key={cat.id} cat={cat} depth={0} allCats={materialCategories} selectedId={categoryId || null}
                      expandedIds={expandedFilterCats} onSelect={id => setCategoryId(id)} onToggleExpand={toggleExpandFilterCat} />
                  ))}
                </div>
              )}
            </div>

            {/* Продукт — той самий компактний patern, лише без ієрархії (плаский список). */}
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('materialUsage.filterProductLabel')}</p>
              {!productSectionOpen ? (
                <button onClick={() => setProductSectionOpen(true)}
                  className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-2.5 py-2.5 text-sm text-left transition-all active:scale-[0.99]">
                  <span className="text-slate-800 truncate">{selectedProductLabel}</span>
                  <svg className="text-slate-400 shrink-0" width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M2 3.5l3.5 4 3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1 rounded-2xl overflow-hidden"
                    style={productId === '' ? { background: '#1e293b', border: '1px solid #1e293b' } : { background: '#f8fafc', border: '1px solid rgba(157,200,255,0.25)' }}>
                    <button onClick={() => setProductId('')} className="flex-1 px-4 py-2.5 text-left text-sm font-medium" style={{ color: productId === '' ? 'white' : '#1e293b' }}>
                      {t('filters.all')}
                    </button>
                    <button onClick={() => { setProductSectionOpen(false); setProductFilterQuery('') }} className="flex h-9 w-9 items-center justify-center shrink-0"
                      style={{ color: productId === '' ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ transform: 'rotate(180deg)' }}>
                        <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                  {/* Список продуктів може бути довгим — пошук усередині фільтра,
                     щоб не гортати вручну (окремо від головного пошуку сторінки). */}
                  <input type="search" value={productFilterQuery} onChange={e => setProductFilterQuery(e.target.value)}
                    placeholder={t('materialUsage.filterProductSearchPlaceholder')}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 transition-all" />
                  <div className="space-y-1 max-h-56 overflow-y-auto">
                    {productsForFilter
                      .filter(p => p.name.toLowerCase().includes(productFilterQuery.trim().toLowerCase()))
                      .map(p => {
                        const active = productId === p.id
                        return (
                          <button key={p.id} onClick={() => setProductId(active ? '' : p.id)}
                            className="flex w-full items-center rounded-xl px-3 py-2 text-sm transition-all"
                            style={active ? { background: '#f8fafc', color: '#1e293b', fontWeight: 500 } : { color: '#64748b' }}>
                            {p.name}
                          </button>
                        )
                      })}
                  </div>
                </div>
              )}
            </div>

            {/* Кастомні поля — двокроково (яке поле → яке значення), той самий
               компактний список для вибору поля, і множинний вибір значень +
               "Не заповнено" для самого значення — точно як фільтр Look book
               (PrintFormsPage.tsx). */}
            {materialFilterableFields.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('materialUsage.filterMaterialFieldLabel')}</p>
                {!materialFieldSectionOpen ? (
                  <button onClick={() => setMaterialFieldSectionOpen(true)}
                    className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-2.5 py-2.5 text-sm text-left transition-all active:scale-[0.99]">
                    <span className="text-slate-800 truncate">{materialField ? tn(materialField.name, materialField.nameEn) : t('filters.allFields')}</span>
                    <svg className="text-slate-400 shrink-0" width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M2 3.5l3.5 4 3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                ) : (
                  <div className="space-y-1 max-h-56 overflow-y-auto mb-1.5">
                    <div className="flex items-center gap-1 rounded-2xl overflow-hidden"
                      style={materialFieldId === '' ? { background: '#1e293b', border: '1px solid #1e293b' } : { background: '#f8fafc', border: '1px solid rgba(157,200,255,0.25)' }}>
                      <button onClick={() => { setMaterialFieldId(''); setMaterialFieldValueIds([]) }} className="flex-1 px-4 py-2.5 text-left text-sm font-medium" style={{ color: materialFieldId === '' ? 'white' : '#1e293b' }}>
                        {t('filters.allFields')}
                      </button>
                      <button onClick={() => setMaterialFieldSectionOpen(false)} className="flex h-9 w-9 items-center justify-center shrink-0"
                        style={{ color: materialFieldId === '' ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ transform: 'rotate(180deg)' }}>
                          <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                    {materialFilterableFields.map(f => {
                      const active = materialFieldId === f.id
                      return (
                        <button key={f.id} onClick={() => { setMaterialFieldId(active ? '' : f.id); setMaterialFieldValueIds([]) }}
                          className="flex w-full items-center rounded-xl px-3 py-2 text-sm transition-all"
                          style={active ? { background: '#f8fafc', color: '#1e293b', fontWeight: 500 } : { color: '#64748b' }}>
                          {tn(f.name, f.nameEn)}
                        </button>
                      )
                    })}
                  </div>
                )}
                {materialField && (
                  <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <label className="flex items-center justify-between rounded-lg bg-white px-3 py-2 cursor-pointer" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
                      <span className="text-sm text-slate-600">{t('materialUsage.filterNotSet')}</span>
                      <input type="checkbox" checked={materialFieldValueIds.includes(FILTER_UNSET)} onChange={() => toggleMaterialFieldValue(FILTER_UNSET)}
                        className="h-4 w-4 rounded accent-slate-800" />
                    </label>
                    {(materialField.fieldType === 'boolean'
                      ? [['true', t('common.yes')], ['false', t('common.no')]]
                      : materialField.options.map(o => [o.id, tn(o.value, o.valueEn)] as [string, string])
                    ).map(([val, label]) => (
                      <label key={val} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 cursor-pointer" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
                        <span className="text-sm text-slate-600">{label}</span>
                        <input type="checkbox" checked={materialFieldValueIds.includes(val)} onChange={() => toggleMaterialFieldValue(val)}
                          className="h-4 w-4 rounded accent-slate-800" />
                      </label>
                    ))}
                    <p className="text-[10px] text-slate-400 px-1">{t('materialUsage.filterValueHint')}</p>
                  </div>
                )}
              </div>
            )}
            {productFilterableFields.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('materialUsage.filterProductFieldLabel')}</p>
                {!productFieldSectionOpen ? (
                  <button onClick={() => setProductFieldSectionOpen(true)}
                    className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-2.5 py-2.5 text-sm text-left transition-all active:scale-[0.99]">
                    <span className="text-slate-800 truncate">{productField ? tn(productField.name, productField.nameEn) : t('filters.allFields')}</span>
                    <svg className="text-slate-400 shrink-0" width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M2 3.5l3.5 4 3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                ) : (
                  <div className="space-y-1 max-h-56 overflow-y-auto mb-1.5">
                    <div className="flex items-center gap-1 rounded-2xl overflow-hidden"
                      style={productFieldId === '' ? { background: '#1e293b', border: '1px solid #1e293b' } : { background: '#f8fafc', border: '1px solid rgba(157,200,255,0.25)' }}>
                      <button onClick={() => { setProductFieldId(''); setProductFieldValueIds([]) }} className="flex-1 px-4 py-2.5 text-left text-sm font-medium" style={{ color: productFieldId === '' ? 'white' : '#1e293b' }}>
                        {t('filters.allFields')}
                      </button>
                      <button onClick={() => setProductFieldSectionOpen(false)} className="flex h-9 w-9 items-center justify-center shrink-0"
                        style={{ color: productFieldId === '' ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ transform: 'rotate(180deg)' }}>
                          <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                    {productFilterableFields.map(f => {
                      const active = productFieldId === f.id
                      return (
                        <button key={f.id} onClick={() => { setProductFieldId(active ? '' : f.id); setProductFieldValueIds([]) }}
                          className="flex w-full items-center rounded-xl px-3 py-2 text-sm transition-all"
                          style={active ? { background: '#f8fafc', color: '#1e293b', fontWeight: 500 } : { color: '#64748b' }}>
                          {tn(f.name, f.nameEn)}
                        </button>
                      )
                    })}
                  </div>
                )}
                {productField && (
                  <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <label className="flex items-center justify-between rounded-lg bg-white px-3 py-2 cursor-pointer" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
                      <span className="text-sm text-slate-600">{t('materialUsage.filterNotSet')}</span>
                      <input type="checkbox" checked={productFieldValueIds.includes(FILTER_UNSET)} onChange={() => toggleProductFieldValue(FILTER_UNSET)}
                        className="h-4 w-4 rounded accent-slate-800" />
                    </label>
                    {(productField.fieldType === 'boolean'
                      ? [['true', t('common.yes')], ['false', t('common.no')]]
                      : productField.options.map(o => [o.id, tn(o.value, o.valueEn)] as [string, string])
                    ).map(([val, label]) => (
                      <label key={val} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 cursor-pointer" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
                        <span className="text-sm text-slate-600">{label}</span>
                        <input type="checkbox" checked={productFieldValueIds.includes(val)} onChange={() => toggleProductFieldValue(val)}
                          className="h-4 w-4 rounded accent-slate-800" />
                      </label>
                    ))}
                    <p className="text-[10px] text-slate-400 px-1">{t('materialUsage.filterValueHint')}</p>
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
        ) : groups.length === 0 ? (
          <div className="rounded-2xl bg-white py-12 text-center text-sm text-slate-400" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            {t('directory.materialUsageEmpty')}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white" style={{ border: '1px solid rgba(157,200,255,0.22)', boxShadow: '0 1px 6px rgba(157,200,255,0.07)' }}>
            {/* width:max-content — без цього div розтягувався б на всю ширину
               зовнішнього overflow-x-auto контейнера (той часто ширший за
               реальний вміст таблиці, коли колонок мало), а закріплені
               (sticky) колонки прилипали б до краю ЦЬОГО розтягнутого
               контейнера — звідси порожній розрив між "Продукт" і "⋮". */}
            <div style={{ width: 'max-content' }}>
              <div className="grid items-center gap-2 px-4 py-3 bg-[#fafbff]" style={{ gridTemplateColumns: gridTemplate, borderBottom: '1px solid rgba(157,200,255,0.2)' }}>
                <div className="flex items-center" style={{ ...stickyStyle(ROW_PAD_LEFT, null, '#fafbff', 'left'), gap: GRID_GAP }}>
                  <span className="shrink-0" style={{ width: CHEVRON_WIDTH }} />
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400" style={{ width: PHOTO_WIDTH }}>{t('materialUsage.colPhoto')}</span>
                  <ResizableTh label={t('directory.materialUsageColMaterial')} onResize={d => resizeCol('material', d)}
                    className="shrink-0" style={{ width: colWidth('material') }} />
                </div>
                <ResizableTh label={t('materialUsage.colCode')} align="center" onResize={d => resizeCol('code', d)} />
                <ResizableTh label={t('directory.materialUsageColQty')} align="center" onResize={d => resizeCol('qty', d)} />
                <ResizableTh label={t('materialUsage.colOperation')} align="center" onResize={d => resizeCol('operation', d)} />
                {materialUsageFields.map(d => (
                  <ResizableTh key={d.id} label={tn(d.name, d.nameEn)} onResize={delta => resizeCol(`field:${d.id}`, delta)} />
                ))}
                <ResizableTh label={t('directory.materialUsageColProduct')} onResize={d => resizeCol('product', d)} />
                <ResizableTh label={t('materialUsage.colSpecStatus')} onResize={d => resizeCol('specStatus', d)} />
                <ResizableTh label={t('materialUsage.colSpecDate')} onResize={d => resizeCol('specDate', d)} />
                <span style={stickyStyle(null, 0, '#fafbff', 'right')} />
              </div>

              {groups.map(g => {
                const isOpen = expanded.has(g.material.id)
                return (
                  <div key={g.material.id}>
                    {/* Групова стрічка (матеріал) — завжди видима, розгортає рядки нижче.
                       "group"/"group-hover" — закріплені (sticky) комірки самі не бачать
                       :hover рядка (в них своє тло, щоб перекривати те, що скролиться
                       під ними), тож підхоплюють підсвітку через group-hover явно. */}
                    <div className="group grid items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer"
                      style={{ gridTemplateColumns: gridTemplate, borderBottom: '1px solid rgba(157,200,255,0.12)' }}
                      onClick={() => toggleExpand(g.material.id)}>
                      {/* Одна закріплена (sticky) обгортка на весь блок шеврон+фото+
                         матеріал — усередині звичайний flex-gap, не grid-gap, тож
                         немає непокритого проміжку, крізь який на скролі могла б
                         просвічувати сусідня, не закріплена колонка цього ж рядка. */}
                      <div className="flex items-center group-hover:bg-slate-50" style={{ ...stickyStyle(ROW_PAD_LEFT, null, '#fff', 'left'), gap: GRID_GAP }}>
                        <div className="shrink-0 flex items-center justify-center" style={{ width: CHEVRON_WIDTH }}>
                          <button className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400"
                            style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                        <div className="shrink-0 flex items-center justify-center" style={{ width: PHOTO_WIDTH }}>
                          <div className="h-9 w-9 rounded-lg overflow-hidden bg-amber-50 flex items-center justify-center text-amber-400">
                            {g.material.photo
                              ? <img src={g.material.photo} alt="" loading="lazy" className="h-full w-full object-cover" />
                              : <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                                  <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                                  <path d="M2 4.5L8 8L14 4.5M8 15V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>}
                          </div>
                        </div>
                        <div className="min-w-0 shrink-0" style={{ width: colWidth('material') }}
                          onClick={e => { if (canOpenMaterial) { e.stopPropagation(); goToMaterial(g.material.id) } }}>
                          <p className={`text-sm font-semibold truncate ${canOpenMaterial ? 'text-blue-600 hover:underline' : 'text-slate-800'}`}>{tn(g.material.name, g.material.nameEn)}</p>
                          {g.material.categoryId && <p className="text-[11px] text-slate-400 truncate">{categoryName(g.material.categoryId)}</p>}
                        </div>
                      </div>
                      <span className="self-stretch flex items-center justify-center text-xs text-slate-400 font-mono truncate" style={CELL_BORDER}>{g.material.code ?? '—'}</span>
                      <span className="self-stretch flex items-center justify-center text-sm font-medium text-slate-700 whitespace-nowrap" style={CELL_BORDER}>
                        {fmt(g.rows.reduce((s, r) => s + r.qty, 0))} {tn(g.material.unitShortName, g.material.unitShortNameEn)}
                      </span>
                      <span className="self-stretch flex items-center justify-center text-xs font-medium text-slate-500 uppercase truncate" style={CELL_BORDER}>{groupOperationLabel(g.rows)}</span>
                      {materialUsageFields.map(d => (
                        <span key={d.id} className="self-stretch flex items-center text-xs text-slate-600 truncate" style={CELL_BORDER}>{materialFieldValueText(g.material.id, d) || '—'}</span>
                      ))}
                      {/* Статус/дата специфікації — атрибут продукту, не матеріалу: на
                         згорнутому груповому рядку немає єдиного значення, коли
                         матеріал використовується в кількох продуктах одразу. */}
                      <span className="self-stretch flex items-center text-xs font-medium text-slate-500" style={CELL_BORDER}>{t('materialUsage.productsCount', { count: g.rows.length })}</span>
                      <span className="self-stretch flex items-center justify-center text-xs text-slate-300" style={CELL_BORDER}>—</span>
                      <span className="self-stretch flex items-center justify-center text-xs text-slate-300">—</span>
                      <div className="relative group-hover:bg-slate-50" style={{ ...stickyStyle(null, 0, '#fff', 'right'), zIndex: openMenu === `m-${g.material.id}` ? 50 : 5 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setOpenMenu(openMenu === `m-${g.material.id}` ? null : `m-${g.material.id}`)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-blue-500 hover:bg-slate-100 transition-all">
                          <MoreIcon />
                        </button>
                        {openMenu === `m-${g.material.id}` && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                            <div className="absolute right-0 top-8 z-20 w-52 rounded-2xl bg-white py-1.5" style={{ border: '1px solid rgba(157,200,255,0.3)', boxShadow: '0 8px 32px rgba(15,23,42,0.14)' }}>
                              <MenuBtn icon={<PackageIcon />} label={t('materialUsage.actionMaterialDetails')} onClick={() => { setOpenMenu(null); goToMaterial(g.material.id) }} />
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Розгорнуті рядки — по одному на кожен продукт, що використовує цей матеріал */}
                    {isOpen && g.rows.map(r => {
                      const spec = specStatusByProductId.get(r.productId)
                      return (
                      <div key={r.key} className="group grid items-center gap-2 px-4 py-2 hover:bg-slate-50 transition-colors"
                        style={{ gridTemplateColumns: gridTemplate, borderBottom: '1px solid rgba(157,200,255,0.12)', background: '#f8fbff' }}>
                        <span className="group-hover:bg-slate-50" style={stickyStyle(ROW_PAD_LEFT, null, '#f8fbff', 'left')} />
                        <span className="self-stretch" style={CELL_BORDER} />
                        <span className="self-stretch flex items-center justify-center text-sm text-slate-700 whitespace-nowrap" style={CELL_BORDER}>{fmt(r.qty)} {tn(r.unitShortName, r.unitShortNameEn)}</span>
                        <span className="self-stretch flex items-center justify-center text-xs text-slate-500 uppercase truncate" style={CELL_BORDER}>{operationName(r.operationId)}</span>
                        {materialUsageFields.map(d => <span key={d.id} className="self-stretch" style={CELL_BORDER} />)}
                        <span className="self-stretch flex flex-col justify-center min-w-0" style={CELL_BORDER}>
                          <button onClick={() => goToProductSpec(r.productId)} className="text-sm font-medium text-blue-600 hover:underline text-left truncate block">
                            {r.productName}
                          </button>
                          <span className="text-[11px] text-slate-400">{r.productSku}</span>
                        </span>
                        <span className="self-stretch flex items-center justify-center" style={CELL_BORDER}>
                          {spec && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ background: SPEC_STATUS_STYLE[spec.status].bg, color: SPEC_STATUS_STYLE[spec.status].text }}>
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: SPEC_STATUS_STYLE[spec.status].text }} />
                              {t(SPEC_STATUS_LABEL_KEY[spec.status])}
                            </span>
                          )}
                        </span>
                        <span className="self-stretch flex items-center justify-center text-xs text-slate-500 whitespace-nowrap">{spec?.activatedAt ? dateStr(spec.activatedAt) : '—'}</span>
                        <div className="relative group-hover:bg-slate-50" style={{ ...stickyStyle(null, 0, '#f8fbff', 'right'), zIndex: openMenu === `p-${r.key}` ? 50 : 5 }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => setOpenMenu(openMenu === `p-${r.key}` ? null : `p-${r.key}`)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-blue-500 hover:bg-slate-100 transition-all">
                            <MoreIcon />
                          </button>
                          {openMenu === `p-${r.key}` && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                              <div className="absolute right-0 top-8 z-20 w-56 rounded-2xl bg-white py-1.5" style={{ border: '1px solid rgba(157,200,255,0.3)', boxShadow: '0 8px 32px rgba(15,23,42,0.14)' }}>
                                <MenuBtn icon={<LayersIcon />} label={t('materialUsage.actionProductSpec')} onClick={() => { setOpenMenu(null); goToProductSpec(r.productId) }} />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      )
                    })}
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

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5v8M4 6.5l3 3 3-3M2 11.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
function PackageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1L13 4.5V9.5L7 13L1 9.5V4.5L7 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M1 4.5L7 8L13 4.5M7 13V8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
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

/** Заголовок колонки з ручкою зміни ширини (перетягування) — колонка сама
 *  keeps контроль над своєю шириною через onResize, тут лише drag-жест. */
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
    <div className={`relative flex items-center min-w-0 pr-3 ${className ?? ''}`} style={{ justifyContent: justify, ...style }}>
      <span className={`text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate ${textAlign}`}>{label}</span>
      <ColResizeHandle onResize={onResize} />
    </div>
  )
}

/** Тонка "ручка" на правому краю заголовка — pointer-based drag (не HTML5 DnD),
 *  щоб працювати однаково для миші й тача; накопичена ширина зберігається
 *  в localStorage самим ResizableTh/onResize (MaterialUsagePage.tsx). */
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
      <div className="h-4 w-px bg-slate-300 hover:bg-blue-400 hover:w-0.5 transition-all mx-auto" />
    </div>
  )
}
