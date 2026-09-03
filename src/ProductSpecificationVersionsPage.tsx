import { useState } from 'react'
import { useCatalog } from './hooks/useCatalog'
import { useMaterials } from './hooks/useProducts'
import {
  useProductSpecifications, useProductSpecificationDetail, useProductSpecificationEvents,
  useProductSpecificationMutations, type ProductSpecificationEvent, type ProductSpecificationEventType,
} from './hooks/useProductSpecifications'
import { useOperationCostCurrency, CURRENCY_SYMBOL } from './hooks/useOrgSettings'
import { fmt } from './lib/materialFormat'
import { useLocale } from './LocaleContext'
import type { TranslationKey } from './i18n'

/* ───────────────────────────────────────────────────────────
   "Історія змін версій" (sql/product_specifications.sql) — під-сторінка
   SpecificationPage.tsx (view === 'versions'), назад веде спільна шапка
   тієї сторінки. Список версій + стрічка подій "хто і коли" почав
   редагування/зберіг версію/закрив попередню; клік по версії — знімок
   матеріалів+операцій на момент збереження, з кнопкою "Відновити" для
   версій, крім останньої.
─────────────────────────────────────────────────────────── */

const EVENT_LABEL_KEY: Record<ProductSpecificationEventType, TranslationKey> = {
  draft_started: 'specificationEvent.draftStarted',
  version_saved: 'specificationEvent.versionSaved',
  status_changed: 'specificationEvent.statusChanged',
}

function fmtDateTime(ms: number): string {
  return new Date(ms).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ProductSpecificationVersionsPage({ productId, onRestored }: {
  productId: string
  onRestored: () => void
}) {
  const { t, tn } = useLocale()
  const operationCurrencyQ = useOperationCostCurrency()
  const operationCurrencySymbol = CURRENCY_SYMBOL[operationCurrencyQ.data ?? 'UAH']
  const { operations } = useCatalog()
  const materialsQ = useMaterials()
  const materials = materialsQ.data ?? []
  const versionsQ = useProductSpecifications(productId)
  const eventsQ = useProductSpecificationEvents(productId)
  const { restoreVersion, isSaving } = useProductSpecificationMutations()
  const [detailId, setDetailId] = useState<string | null>(null)
  const detailQ = useProductSpecificationDetail(detailId)

  const versions = versionsQ.data ?? []
  const latestId = versions[0]?.id ?? null

  if (detailId) {
    const version = versions.find(v => v.id === detailId)
    const detail = detailQ.data
    return (
      <div className="px-4 pb-8">
        <button onClick={() => setDetailId(null)} className="mb-3 flex items-center gap-1.5 text-sm text-slate-500">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          {version ? t('productSpecification.versionLabel', { n: version.versionNumber }) : ''}
        </button>
        {detailQ.isLoading ? (
          <p className="py-8 text-center text-sm text-slate-400">{t('common.loading')}</p>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">{t('nav.materials')}</h3>
              {(detail?.materials ?? []).length === 0 ? (
                <p className="text-sm text-slate-400">{t('products.noMaterials')}</p>
              ) : (
                <div className="space-y-1.5">
                  {(detail?.materials ?? []).map(m => {
                    const mat = materials.find(x => x.id === m.materialId)
                    const op = m.operationId ? operations.find(x => x.id === m.operationId) : null
                    return (
                      <div key={m.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm" style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">{mat ? tn(mat.name, mat.nameEn) : '—'}</p>
                          <p className="truncate text-xs text-slate-400">{op ? tn(op.name, op.nameEn) : t('products.noOperation')}</p>
                        </div>
                        <span className="shrink-0 font-mono text-slate-600">{fmt(m.qty)} {tn(m.unitShortName, m.unitShortNameEn)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">{t('products.operationsLabel')}</h3>
              {(detail?.operations ?? []).length === 0 ? (
                <p className="text-sm text-slate-400">{t('products.noOperations')}</p>
              ) : (
                <div className="space-y-1.5">
                  {(detail?.operations ?? []).map(o => {
                    const op = operations.find(x => x.id === o.operationId)
                    return (
                      <div key={o.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm" style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">{op ? tn(op.name, op.nameEn) : '—'}</p>
                          <p className="truncate text-xs text-slate-400">{o.taskName || t('products.noTask')}</p>
                        </div>
                        <span className="shrink-0 text-right font-mono text-xs text-slate-600">
                          {o.durationMinutes ? `${o.durationMinutes} ${t('common.minutesShort')}` : ''}
                          {o.durationMinutes && o.cost ? ' · ' : ''}
                          {o.cost ? `${o.cost} ${operationCurrencySymbol}` : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {version && version.id !== latestId && (
              <button disabled={isSaving}
                onClick={async () => { await restoreVersion({ specificationId: version.id, productId }); onRestored() }}
                className="w-full rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition-all">
                {t('productSpecification.restoreButton')}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="px-4 pb-8 space-y-5">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{t('productSpecification.versionsTitle')}</h3>
        {versionsQ.isLoading ? (
          <p className="py-4 text-center text-sm text-slate-400">{t('common.loading')}</p>
        ) : versions.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">{t('productSpecification.noVersionsYet')}</p>
        ) : (
          <div className="space-y-2">
            {versions.map(v => (
              <button key={v.id} onClick={() => setDetailId(v.id)}
                className="w-full rounded-2xl bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50"
                style={{ border: '1px solid rgba(157,200,255,0.22)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800">{t('productSpecification.versionLabel', { n: v.versionNumber })}</span>
                  <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: v.status === 'active' ? '#dcfce7' : '#f1f5f9', color: v.status === 'active' ? '#16a34a' : '#64748b' }}>
                    {t(v.status === 'active' ? 'productSpecification.statusActive' : 'productSpecification.statusClosed')}
                  </span>
                </div>
                {v.restoredFromVersionNumber !== null && (
                  <p className="mt-0.5 text-xs text-amber-600">{t('productSpecification.restoredFromLabel', { n: v.restoredFromVersionNumber })}</p>
                )}
                <p className="mt-0.5 text-xs text-slate-400">{v.createdByName} · {fmtDateTime(v.createdAt)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{t('assignments.historyTab')}</h3>
        {eventsQ.isLoading ? (
          <p className="py-4 text-center text-sm text-slate-400">{t('common.loading')}</p>
        ) : (eventsQ.data ?? []).length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">{t('assignments.noHistoryYet')}</p>
        ) : (
          <div className="space-y-2">
            {(eventsQ.data ?? []).map(ev => <SpecificationEventRow key={ev.id} event={ev} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function SpecificationEventRow({ event }: { event: ProductSpecificationEvent }) {
  const { t } = useLocale()
  return (
    <div className="rounded-2xl bg-white px-4 py-3" style={{ border: '1px solid rgba(157,200,255,0.22)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700 truncate">
          {t(EVENT_LABEL_KEY[event.eventType])}{event.versionNumber !== null ? ` · ${t('productSpecification.versionLabel', { n: event.versionNumber })}` : ''}
        </span>
        <span className="text-[10px] text-slate-400 shrink-0">{fmtDateTime(event.occurredAt)}</span>
      </div>
      <p className="text-xs text-slate-400 mt-0.5">{event.actorName}</p>
    </div>
  )
}
