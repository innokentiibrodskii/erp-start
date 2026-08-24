import { useState } from 'react'
import { useDashboardStats, useDrilldownRecords, SPECIFICATION_FIELD_ID, type DashboardFieldStat } from './hooks/useDashboardStats'
import type { EntityType } from './hooks/useCustomFields'
import { useMaterialCostCurrency, CURRENCY_SYMBOL } from './hooks/useOrgSettings'
import { fmt } from './lib/materialFormat'
import { useLocale } from './LocaleContext'
import type { TranslationKey } from './i18n'

/* ───────────────────────────────────────────────────────────
   "Дашборди" — агрегована статистика по кастомних select-полях
   продуктів/матеріалів/постачальників: скільки записів мають
   кожне значення поля. Дані рахуються на клієнті з наявних
   таблиць (hooks/useDashboardStats.ts) — нової схеми в базі не
   потрібно. Клік на значення (бар) відкриває список записів, що
   в нього увійшли (useDrilldownRecords) — самі картки сутностей
   нікуди не ведуть.
─────────────────────────────────────────────────────────── */

const ENTITY_LABEL_KEY: Record<EntityType, TranslationKey> = {
  product: 'nav.products',
  material: 'nav.materials',
  supplier: 'directory.tiles.suppliers.label',
}
const ENTITY_TOTAL_KEY: Record<EntityType, TranslationKey> = {
  product: 'dashboards.totalProducts',
  material: 'dashboards.totalMaterials',
  supplier: 'dashboards.totalSuppliers',
}
const ENTITIES: EntityType[] = ['product', 'material', 'supplier']

// Циклічна палітра для значень усередині одного поля — за індексом, не за сутністю.
const BAR_COLORS = ['#3b82f6', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6', '#ef4444']

/** Мінімальний ідентифікатор деталізації — саме він (не готові підписи) кодується
 *  в deep-link URL (?field=...&value=...), щоб "назад" з картки продукту/матеріалу
 *  могло відновити точно той самий список, а не просто верхній рівень дашбордів.
 *  Підписи (fieldLabel/valueLabel/count) DrilldownPage сама підтягує з
 *  useDashboardStats — так вони завжди актуальні й не дублюються в URL. */
export interface DrilldownTarget {
  entityType: EntityType
  definitionId: string
  optionId: string
}

export default function DashboardsPage({ initialDrilldown = null }: { initialDrilldown?: DrilldownTarget | null }) {
  const { t } = useLocale()
  const [search, setSearch] = useState('')
  const [drilldown, setDrilldown] = useState<DrilldownTarget | null>(initialDrilldown)
  const q = search.trim().toLowerCase()

  if (drilldown) return <DrilldownPage target={drilldown} onBack={() => setDrilldown(null)} />

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="px-4 pt-5 pb-3">
        <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl text-slate-800 mb-1">{t('nav.dashboards')}</h1>
        <p className="text-xs text-slate-400 mb-3">{ENTITIES.length} {t('products.items')}</p>

        <div className="relative mb-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('dashboards.searchPlaceholder')}
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
        </div>
      </div>

      <div className="px-4 space-y-3 pb-8">
        {ENTITIES.map(entityType => (
          <EntityCard key={entityType} entityType={entityType} search={q} onSelectValue={setDrilldown} />
        ))}
      </div>
    </div>
  )
}

function EntityCard({ entityType, search, onSelectValue }: { entityType: EntityType; search: string; onSelectValue: (t: DrilldownTarget) => void }) {
  const { t, tn } = useLocale()
  const { totalCount, fields, isLoading } = useDashboardStats(entityType)

  const entityLabel = t(ENTITY_LABEL_KEY[entityType]).toLowerCase()
  const matchingFields = search
    ? fields.filter(f => tn(f.name, f.nameEn).toLowerCase().includes(search)
        || entityLabel.includes(search)
        || f.values.some(v => tn(v.label, v.labelEn).toLowerCase().includes(search)))
    : fields
  // Якщо шукають щось, що не збігається з жодним полем цієї картки й не з назвою сутності — картку ховаємо.
  if (search && matchingFields.length === 0 && !entityLabel.includes(search)) return null

  return (
    <div className="rounded-2xl bg-white p-4" style={{ border: '1px solid rgba(157,200,255,0.25)', boxShadow: '0 1px 8px rgba(157,200,255,0.08)' }}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-slate-800">{t(ENTITY_TOTAL_KEY[entityType])}</span>
        <span className="text-xl font-bold" style={{ color: '#3b82f6' }}>{isLoading ? '—' : totalCount}</span>
      </div>

      {isLoading ? (
        <p className="py-4 text-center text-xs text-slate-400">{t('common.loading')}</p>
      ) : fields.length === 0 ? (
        <p className="text-xs text-slate-300 italic">{t('dashboards.noSelectFields')}</p>
      ) : (
        <div className="space-y-4">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('materials.customFields')}</label>
          {matchingFields.map(field => (
            <FieldStatGroup key={field.definitionId} entityType={entityType} field={field} onSelectValue={onSelectValue} />
          ))}
        </div>
      )}
    </div>
  )
}

function FieldStatGroup({ entityType, field, onSelectValue }: { entityType: EntityType; field: DashboardFieldStat; onSelectValue: (t: DrilldownTarget) => void }) {
  const { t, tn } = useLocale()
  const fieldLabel = tn(field.name, field.nameEn)
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">{fieldLabel}</p>
      <div className="space-y-1.5">
        {field.values.map((v, i) => {
          const valueLabel = tn(v.label, v.labelEn)
          const clickable = v.count > 0
          return (
            <button key={v.optionId} disabled={!clickable}
              onClick={() => clickable && onSelectValue({ entityType, definitionId: field.definitionId, optionId: v.optionId })}
              className="relative h-8 w-full rounded-full overflow-hidden text-left transition-transform active:scale-[0.98] disabled:active:scale-100"
              style={{ background: '#f1f5f9', cursor: clickable ? 'pointer' : 'default' }}
              title={clickable ? t('dashboards.viewRecordsHint') : undefined}>
              {v.count > 0 ? (
                <div className="absolute inset-y-0 left-0 flex items-center gap-2 rounded-full px-3"
                  style={{ width: `${Math.max(v.fraction * 100, 28)}%`, background: BAR_COLORS[i % BAR_COLORS.length] }}>
                  <span className="text-xs font-medium text-white truncate">{valueLabel}</span>
                  <span className="text-xs font-semibold text-white shrink-0">{v.count}</span>
                </div>
              ) : (
                <div className="absolute inset-y-0 left-0 flex items-center px-3">
                  <span className="text-xs text-slate-400 truncate">{valueLabel}</span>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────
   Деталізація: список записів за конкретним значенням поля.
─────────────────────────────────────────────────────────── */

/** Перехід на конкретний продукт/матеріал — той самий deep-link механізм
 *  (?product=id / ?material=id), яким уже користується QR-сканування:
 *  Shell.tsx читає ці параметри при завантаженні й одразу відкриває картку.
 *  Постачальники без окремої сторінки картки — для них перехід не робимо.
 *  field/value — той самий definitionId/optionId деталізації, з якої зайшли:
 *  Shell.tsx передасть їх назад у DashboardsPage, коли натиснуть "назад" на
 *  картці, щоб відновився саме цей список, а не верхній рівень дашбордів. */
function goToRecord(target: DrilldownTarget, id: string) {
  const param = target.entityType === 'product' ? 'product' : target.entityType === 'material' ? 'material' : null
  if (!param) return
  // "Специфікація" — одразу відкриваємо шторку матеріалів/операцій продукту
  // (view=materials), а не повну картку, бо саме за цим сюди й прийшли.
  const viewParam = target.definitionId === SPECIFICATION_FIELD_ID ? '&view=materials' : ''
  window.location.href = `${window.location.pathname}?${param}=${id}&from=dashboards&field=${target.definitionId}&value=${target.optionId}${viewParam}`
}

function DrilldownPage({ target, onBack }: { target: DrilldownTarget; onBack: () => void }) {
  const { t, tn } = useLocale()
  const { fields, isLoading: statsLoading } = useDashboardStats(target.entityType)
  const recordsQ = useDrilldownRecords(target.entityType, target.definitionId, target.optionId)
  const navigable = target.entityType !== 'supplier'
  const currencyQ = useMaterialCostCurrency()
  const currencySymbol = CURRENCY_SYMBOL[currencyQ.data ?? 'UAH']

  // Підписи деталізації — не з URL, а свіжо підтягнуті зі статистики (та сама
  // логіка, що й на верхньому рівні), щоб точно збігались і не застарівали.
  const field = fields.find(f => f.definitionId === target.definitionId)
  const value = field?.values.find(v => v.optionId === target.optionId)
  const fieldLabel = field ? tn(field.name, field.nameEn) : ''
  const valueLabel = value ? tn(value.label, value.labelEn) : ''
  const count = value?.count ?? 0
  const isSpecTable = target.definitionId === SPECIFICATION_FIELD_ID

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <button onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95 transition-all">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="min-w-0">
          <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-slate-800 truncate">{statsLoading ? '…' : valueLabel}</h1>
          <p className="text-xs text-slate-400 truncate">{statsLoading ? t('common.loading') : `${fieldLabel} · ${count} ${t('products.items')}`}</p>
        </div>
      </div>

      <div className="px-4 pb-8">
        {recordsQ.isLoading ? (
          <div className="py-10 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : (recordsQ.data ?? []).length === 0 ? (
          <div className="rounded-2xl bg-white py-12 text-center text-sm text-slate-400" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            {t('common.notFound')}
          </div>
        ) : isSpecTable ? (
          /* "Специфікація" — не проста картка, а таблиця з даними самої
             специфікації (к-сть матеріалів/операцій), а не лише назва. */
          <div className="overflow-x-auto rounded-2xl bg-white" style={{ border: '1px solid rgba(157,200,255,0.22)', boxShadow: '0 1px 6px rgba(157,200,255,0.07)' }}>
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: '420px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(157,200,255,0.2)' }}>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('dashboards.specTable.product')}</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('dashboards.specTable.materials')}</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('dashboards.specTable.operations')}</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {(recordsQ.data ?? []).map(r => (
                  <tr key={r.id} onClick={() => goToRecord(target, r.id)}
                    className="cursor-pointer hover:bg-slate-50 transition-colors" style={{ borderBottom: '1px solid rgba(157,200,255,0.12)' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-8 w-8 shrink-0 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center text-slate-400">
                          {r.photo ? <img src={r.photo} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="text-xs">📦</span>}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{r.name}</p>
                          {r.code && <p className="text-[11px] font-mono text-slate-400 truncate">{r.code}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <p className="font-medium text-slate-700">{fmt(r.materialsCost ?? 0)} {currencySymbol}</p>
                      <p className="text-[10px] text-slate-400">{r.materialsCount ?? 0} {t('dashboards.specTable.itemsShort')}</p>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <p className="font-medium text-slate-700">{fmt(r.operationsCost ?? 0)} ₴</p>
                      <p className="text-[10px] text-slate-400">{r.operationsCount ?? 0} {t('dashboards.specTable.itemsShort')}</p>
                    </td>
                    <td className="pr-3">
                      <svg className="text-slate-300" width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M5 3l5 4-5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-2">
            {(recordsQ.data ?? []).map(r => {
              const Row = navigable ? 'button' : 'div'
              return (
                <Row key={r.id} onClick={navigable ? () => goToRecord(target, r.id) : undefined}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-left active:scale-[0.98] transition-all"
                  style={{ border: '1px solid rgba(157,200,255,0.22)', boxShadow: '0 1px 6px rgba(157,200,255,0.07)' }}>
                  <div className="h-11 w-11 shrink-0 rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center text-slate-400">
                    {r.photo ? <img src={r.photo} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="text-sm">📦</span>}
                  </div>
                  <span className="flex-1 min-w-0 text-sm font-medium text-slate-800 truncate">{r.name}</span>
                  {r.code && <span className="text-xs font-mono text-slate-400 shrink-0">{r.code}</span>}
                  {navigable && (
                    <svg className="text-slate-300 shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M5 3l5 4-5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </Row>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
