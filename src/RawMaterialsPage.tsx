import { useMemo, useState } from 'react'
import {
  useDraftMaterials, useDraftMaterialCharacteristics,
  useDraftMaterialTypes, useDraftNomenclatureGroups, useDraftMaterialsGroups,
  DEFAULT_DRAFT_MATERIALS_FILTERS,
  type DraftRawMaterial, type DraftMaterialsFilters, type DraftLookupOption,
} from './hooks/useDraftMaterials'
import { SubPageHeader, BottomSheet, SheetTitle } from './DirectoryCatalog'
import { fmt } from './lib/materialFormat'
import { useLocale } from './LocaleContext'
import type { TranslationKey } from './i18n'

/* ───────────────────────────────────────────────────────────
   "Information about raw materials" — перегляд чернетки імпорту сировини
   (схема draft.* у Supabase, ще не звірена й не перенесена в робочі
   матеріали проєкту). Лише читання: список із пошуком, фільтрами й
   пагінацією (35 814 рядків — забагато для клієнтського фільтра, як у
   решти довідників) і картка з усіма полями по кліку. Дані джерела —
   src/hooks/useDraftMaterials.ts, sql/draft_raw_materials.sql.

   Пошук + панель фільтрів навмисно за тим самим патерном, що на сторінці
   Продуктів (ProductCatalog.tsx: кнопка-іконка з крапкою при активних
   фільтрах → панель списків з одиночним вибором + "Скинути").
─────────────────────────────────────────────────────────── */

interface Props { onBack: () => void }

export default function RawMaterialsPage({ onBack }: Props) {
  const { t } = useLocale()
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<DraftMaterialsFilters>(DEFAULT_DRAFT_MATERIALS_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  const [typeSearch, setTypeSearch] = useState('')
  const [groupSearch, setGroupSearch] = useState('')
  const [openMaterial, setOpenMaterial] = useState<DraftRawMaterial | null>(null)

  const materialsQ = useDraftMaterials(search, page, filters)
  const items = materialsQ.data?.items ?? []
  const hasMore = materialsQ.data?.hasMore ?? false

  const typesQ = useDraftMaterialTypes()
  const nomenclatureGroupsQ = useDraftNomenclatureGroups()
  const materialsGroupsQ = useDraftMaterialsGroups()

  // Довідник BAS ERP містить чимало заведених, але порожніх записів (0
  // матеріалів) — ховаємо їх з фільтра. Який рахунок дивитись (усі чи лише
  // не позначені на видалення) залежить від того самого чекбоксу нижче.
  const nonEmpty = (list: DraftLookupOption[]) =>
    list.filter(o => (filters.hideMarkedForDeletion ? o.activeCount : o.totalCount) > 0)

  const availableTypes = useMemo(() => nonEmpty(typesQ.data ?? []), [typesQ.data, filters.hideMarkedForDeletion])
  const availableNomenclatureGroups = useMemo(() => nonEmpty(nomenclatureGroupsQ.data ?? []), [nomenclatureGroupsQ.data, filters.hideMarkedForDeletion])
  const availableMaterialsGroups = useMemo(() => nonEmpty(materialsGroupsQ.data ?? []), [materialsGroupsQ.data, filters.hideMarkedForDeletion])

  const filteredTypes = useMemo(() => {
    const term = typeSearch.trim().toLowerCase()
    return term ? availableTypes.filter(o => o.name.toLowerCase().includes(term)) : availableTypes
  }, [availableTypes, typeSearch])

  const filteredMaterialsGroups = useMemo(() => {
    const term = groupSearch.trim().toLowerCase()
    return term ? availableMaterialsGroups.filter(o => o.name.toLowerCase().includes(term)) : availableMaterialsGroups
  }, [availableMaterialsGroups, groupSearch])

  const hasActiveFilters =
    filters.materialTypeUuids.length > 0 ||
    filters.nomenclatureGroupUuids.length > 0 ||
    filters.materialsGroupUuids.length > 0 ||
    filters.hideMarkedForDeletion !== DEFAULT_DRAFT_MATERIALS_FILTERS.hideMarkedForDeletion

  const updateFilters = (patch: Partial<DraftMaterialsFilters>) => {
    setFilters(f => ({ ...f, ...patch }))
    setPage(0)
  }
  const resetFilters = () => { setFilters(DEFAULT_DRAFT_MATERIALS_FILTERS); setTypeSearch(''); setGroupSearch(''); setPage(0) }

  // Дебаунс пошуку — 35k рядків, не варто бити запит на кожен символ.
  const searchTimer = useState<{ id: ReturnType<typeof setTimeout> | null }>({ id: null })[0]
  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    if (searchTimer.id) clearTimeout(searchTimer.id)
    searchTimer.id = setTimeout(() => { setSearch(value); setPage(0) }, 350)
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title={t('rawMaterials.title')} subtitle={t('rawMaterials.subtitle')} onBack={onBack} />

      <div className="px-4 pt-4">
        {/* Search + filter row — той самий патерн, що на сторінці Продуктів */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              type="search"
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder={t('rawMaterials.searchPlaceholder')}
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            />
          </div>
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
            <CollapsibleFilterSection
              title={t('rawMaterials.filterAllTypes')}
              allLabel={t('filters.all')}
              options={filteredTypes}
              values={filters.materialTypeUuids}
              onChange={v => updateFilters({ materialTypeUuids: v })}
              search={{ value: typeSearch, onChange: setTypeSearch, placeholder: t('rawMaterials.filterTypeSearchPlaceholder') }}
            />
            <CollapsibleFilterSection
              title={t('rawMaterials.filterAllNomenclatureGroups')}
              allLabel={t('filters.all')}
              options={availableNomenclatureGroups}
              values={filters.nomenclatureGroupUuids}
              onChange={v => updateFilters({ nomenclatureGroupUuids: v })}
            />
            <CollapsibleFilterSection
              title={t('rawMaterials.filterAllMaterialsGroups')}
              allLabel={t('filters.all')}
              options={filteredMaterialsGroups}
              values={filters.materialsGroupUuids}
              onChange={v => updateFilters({ materialsGroupUuids: v })}
              search={{ value: groupSearch, onChange: setGroupSearch, placeholder: t('rawMaterials.filterGroupSearchPlaceholder') }}
            />

            <button onClick={() => updateFilters({ hideMarkedForDeletion: !filters.hideMarkedForDeletion })}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all"
              style={!filters.hideMarkedForDeletion ? { background: '#f8fafc', color: '#1e293b', fontWeight: 500 } : { color: '#64748b' }}>
              <div className="h-4 w-4 rounded border flex items-center justify-center shrink-0"
                style={!filters.hideMarkedForDeletion ? { background: '#1e293b', borderColor: '#1e293b' } : { borderColor: '#cbd5e1' }}>
                {!filters.hideMarkedForDeletion && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                )}
              </div>
              {t('rawMaterials.filterShowMarkedForDeletion')}
            </button>

            {hasActiveFilters && (
              <button onClick={resetFilters} className="w-full rounded-xl py-2 text-xs text-slate-400 hover:text-red-400 transition-colors text-center">
                {t('filters.reset')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="px-4 pb-8">
        {materialsQ.isLoading ? (
          <div className="py-10 text-center text-sm text-slate-400">{t('rawMaterials.loading')}</div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">{t('rawMaterials.empty')}</div>
        ) : (
          <div className="space-y-2">
            {items.map(m => (
              <button
                key={m.idMaterial}
                onClick={() => setOpenMaterial(m)}
                className="flex w-full items-start justify-between gap-3 rounded-2xl bg-white p-4 text-left active:scale-[0.99] transition-all"
                style={{ border: '1px solid rgba(157,200,255,0.25)', boxShadow: '0 1px 8px rgba(157,200,255,0.08)' }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{m.name}</p>
                  <p className="mt-0.5 text-xs text-slate-400 truncate">
                    {[m.code, m.materialsGroupName, m.materialTypeName].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                {m.statusForDeletion && (
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: '#fef2f2', color: '#dc2626' }}>
                    {t('rawMaterials.markedForDeletion')}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {(page > 0 || hasMore) && !materialsQ.isLoading && (
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 disabled:opacity-40 active:scale-95 transition-all"
            >
              {t('rawMaterials.prev')}
            </button>
            <span className="text-xs text-slate-400">{t('rawMaterials.pageOf', { page: page + 1 })}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={!hasMore}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 disabled:opacity-40 active:scale-95 transition-all"
            >
              {t('rawMaterials.next')}
            </button>
          </div>
        )}
      </div>

      {openMaterial && (
        <MaterialCard material={openMaterial} onClose={() => setOpenMaterial(null)} />
      )}
    </div>
  )
}

/** Чекбокс-варіант мультивибору — той самий вигляд, що чекбокс "Показувати
 *  позначені на видалення" нижче, лише переносний у список. */
function FilterOptionCheckbox({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-left transition-all"
      style={checked ? { background: '#f8fafc', color: '#1e293b', fontWeight: 500 } : { color: '#64748b' }}>
      <div className="h-4 w-4 rounded border flex items-center justify-center shrink-0"
        style={checked ? { background: '#1e293b', borderColor: '#1e293b' } : { borderColor: '#cbd5e1' }}>
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        )}
      </div>
      {label}
    </button>
  )
}

/** Фільтр-секція за патерном "Категорія" на сторінці Продуктів
 *  (ProductCatalog.tsx): згорнута — компактна кнопка-select із поточним
 *  вибором і шевроном; розгорнута — "Усі" темною плашкою зверху (коли нічого
 *  не обрано) + список варіантів чекбоксами (можна обрати кілька одразу),
 *  шеврон угорі згортає секцію назад. */
function CollapsibleFilterSection({ title, allLabel, options, values, onChange, search }: {
  title: string
  allLabel: string
  options: DraftLookupOption[]
  values: string[]
  onChange: (ids: string[]) => void
  /** Лише для великих списків (група матеріалів, 739 записів) — пошук
   *  усередині розгорнутої секції; options уже відфільтровані батьком. */
  search?: { value: string; onChange: (v: string) => void; placeholder: string }
}) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const isAll = values.length === 0
  const selectedLabel = isAll
    ? allLabel
    : values.length === 1
      ? (options.find(o => o.id === values[0])?.name ?? allLabel)
      : t('rawMaterials.filterSelectedCount', { count: values.length })
  const toggle = (id: string) => onChange(values.includes(id) ? values.filter(v => v !== id) : [...values, id])
  // Без пошуку (тип/група номенклатури) секцію ховаємо, доки довідник не
  // завантажився; із пошуком (група матеріалів) — лишаємо видимою навіть
  // при 0 збігів, щоб можна було поправити запит.
  if (!search && options.length === 0) return null

  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      {!open ? (
        <button onClick={() => setOpen(true)}
          className="w-full flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-2.5 py-2.5 text-sm text-left transition-all active:scale-[0.99]">
          <span className="text-slate-800 truncate">{selectedLabel}</span>
          <svg className="text-slate-400 shrink-0" width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M2 3.5l3.5 4 3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      ) : (
        <div className="space-y-1.5">
          <div className="w-full flex items-center gap-1 rounded-2xl overflow-hidden"
            style={isAll
              ? { background: '#1e293b', border: '1px solid #1e293b' }
              : { background: '#f8fafc', border: '1px solid rgba(157,200,255,0.25)' }}>
            <button onClick={() => onChange([])} className="flex-1 flex items-center gap-3 px-4 py-2.5 text-left">
              <div className="h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: isAll ? 'white' : '#cbd5e1' }}>
                {isAll && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
              </div>
              <span className="text-sm font-medium" style={{ color: isAll ? 'white' : '#1e293b' }}>{allLabel}</span>
            </button>
            {/* Шеврон згортає секцію назад у компактний select */}
            <button onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center shrink-0"
              style={{ color: isAll ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ transform: 'rotate(180deg)' }}>
                <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          {search && (
            <input
              value={search.value}
              onChange={e => search.onChange(e.target.value)}
              placeholder={search.placeholder}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 transition-all"
            />
          )}
          <div className="max-h-52 overflow-y-auto space-y-1">
            {options.map(o => (
              <FilterOptionCheckbox key={o.id} label={o.name} checked={values.includes(o.id)} onClick={() => toggle(o.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Секція картки, розгорнута за замовчуванням — згортається кліком на
 *  заголовок/шеврон (той самий патерн, що групи в DirectoryCatalog.tsx). */
function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mb-3">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between py-1 text-left">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"
          className={`shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}>
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  )
}

function FieldSection({ title, rows }: { title: string; rows: (React.ReactNode | null)[] }) {
  const visible = rows.filter(Boolean)
  if (visible.length === 0) return null
  return (
    <CollapsibleSection title={title}>
      <div className="rounded-2xl bg-slate-50 px-3.5 divide-y divide-slate-100">{visible}</div>
    </CollapsibleSection>
  )
}

function MaterialCard({ material, onClose }: { material: DraftRawMaterial; onClose: () => void }) {
  const { t } = useLocale()
  const charsQ = useDraftMaterialCharacteristics(material.externalUuidMaterial)
  const chars = charsQ.data ?? []

  const row = (labelKey: TranslationKey, value: string | number | null) => {
    if (value === null || value === '') return null
    return (
      <div key={labelKey} className="flex justify-between gap-3 py-1.5 text-sm">
        <span className="text-slate-400">{t(labelKey)}</span>
        <span className="text-right font-medium text-slate-800 break-words">{value}</span>
      </div>
    )
  }

  return (
    <BottomSheet onClose={onClose}>
      <SheetTitle>{material.name}</SheetTitle>
      <div className="px-5 pb-6">
        <FieldSection title={t('rawMaterials.sectionMain')} rows={[
          row('rawMaterials.field.code', material.code),
          row('rawMaterials.field.article', material.article),
          row('rawMaterials.field.category', material.category),
          row('rawMaterials.field.color', material.color),
          row('rawMaterials.field.colorFamily', material.colorFamily),
          row('rawMaterials.field.size', material.size),
          row('rawMaterials.field.designName', material.designNameForPatterns),
          row('rawMaterials.field.supplierNomenclature', material.supplierNomenclature),
        ]} />

        <FieldSection title={t('rawMaterials.sectionGrouping')} rows={[
          row('rawMaterials.field.materialType', material.materialTypeName),
          row('rawMaterials.field.nomenclatureGroup', material.nomenclatureGroupName),
          row('rawMaterials.field.materialsGroup', material.materialsGroupName),
          row('rawMaterials.field.hierarchyGroup', material.hierarchyGroupName),
          row('rawMaterials.field.hierarchyParentGroup', material.hierarchyParentGroupName),
          row('rawMaterials.field.appointment', material.appointmentName),
        ]} />

        <FieldSection title={t('rawMaterials.sectionSupply')} rows={[
          row('rawMaterials.field.provider', material.providerName),
          row('rawMaterials.field.country', material.country),
          row('rawMaterials.field.supplierPrice', material.supplierPrice !== null ? fmt(material.supplierPrice) : null),
          row('rawMaterials.field.controlPrice', material.controlPrice !== null ? fmt(material.controlPrice) : null),
          row('rawMaterials.field.minimumOrderQuantity', material.minimumOrderQuantity !== null ? fmt(material.minimumOrderQuantity) : null),
          row('rawMaterials.field.productionTime', material.productionTime !== null ? fmt(material.productionTime) : null),
          row('rawMaterials.field.productionTimeDetails', material.productionTimeDetails !== null ? fmt(material.productionTimeDetails) : null),
          row('rawMaterials.field.deliveryTime', material.deliveryTime !== null ? fmt(material.deliveryTime) : null),
          row('rawMaterials.field.percentageOfDefects', material.percentageOfDefects !== null ? fmt(material.percentageOfDefects) : null),
        ]} />

        <CollapsibleSection title={t('rawMaterials.sectionCharacteristics')}>
          {chars.length === 0 ? (
            <p className="text-sm text-slate-400">{t('rawMaterials.characteristicsEmpty')}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {chars.map(c => (
                <span key={c.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{c.value}</span>
              ))}
            </div>
          )}
        </CollapsibleSection>
      </div>
    </BottomSheet>
  )
}
