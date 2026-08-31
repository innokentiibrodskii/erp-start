import { useState, useEffect, useRef } from 'react'
import QRCodeLib from 'react-qr-code'
import { useCatalog, type ProductCategory } from './hooks/useCatalog'
import { useCurrentUser } from './hooks/useCurrentUser'
import { useProducts, useMaterials, useProductStatuses, useProductPhotos, useProductVideos, usePhotoStatuses, type PhotoItem, type VideoItem } from './hooks/useProducts'
import { useAssignments } from './hooks/useAssignments'
import { useStockMovements } from './hooks/useMaterialStock'
import { useCustomFieldDefinitions, useCustomFieldValues } from './hooks/useCustomFields'
import { useMaterialCostCurrency, CURRENCY_SYMBOL } from './hooks/useOrgSettings'
import { useProductEvents, type ProductEvent, type ProductEventType } from './hooks/useProductEvents'
import { fmt } from './lib/materialFormat'
import { useLocale } from './LocaleContext'
import type { TranslationKey } from './i18n'

interface Props {
  productId: string
  onBack: () => void
  onEdit: () => void
}

/** Декартів добуток значень варіантоутворюючих характеристик продукту —
 *  кожна комбінація значень (по одному з кожної групи) є окремим варіантом товару. */
function buildVariants(
  productAttributes: { attributeId: string; attributeName: string; value: string }[],
  variantAttributeIds: Set<string>
): string[][] {
  const groups = new Map<string, { attributeName: string; values: string[] }>()
  for (const pa of productAttributes) {
    if (!variantAttributeIds.has(pa.attributeId)) continue
    if (!groups.has(pa.attributeId)) groups.set(pa.attributeId, { attributeName: pa.attributeName, values: [] })
    groups.get(pa.attributeId)!.values.push(pa.value)
  }
  const groupList = Array.from(groups.values())
  if (groupList.length === 0) return []

  let combos: string[][] = [[]]
  for (const g of groupList) {
    const next: string[][] = []
    for (const combo of combos) {
      for (const val of g.values) next.push([...combo, `${g.attributeName}: ${val}`])
    }
    combos = next
  }
  return combos
}

function buildProductCatPath(id: string | null, all: ProductCategory[], tn: (name: string, nameEn: string | null | undefined) => string): string {
  if (!id) return ''
  const parts: string[] = []
  let cur: string | null = id
  while (cur) {
    const cat = all.find(c => c.id === cur)
    if (!cat) break
    parts.unshift(tn(cat.name, cat.nameEn))
    cur = cat.parentId
  }
  return parts.join(' / ')
}

export default function ProductView({ productId, onBack, onEdit }: Props) {
  const { t, tn } = useLocale()
  // "Менеджер перегляд" теж може редагувати продукт (зміни логуються —
  // sql/manager_view_role.sql, useProductEvents.ts) — та сама умова, що й у
  // ProductCatalog.tsx.
  const { data: currentUser } = useCurrentUser()
  const isManager = currentUser?.role === 'manager' || currentUser?.role === 'admin'
  const isManagerView = currentUser?.role === 'manager_view'
  const canEditProduct = isManager || isManagerView
  const { categories, operations, warehouses, attributes: catalogAttributes } = useCatalog()
  const productsQ = useProducts()
  const materialsQ = useMaterials()
  const currencyQ = useMaterialCostCurrency()
  const currencySymbol = CURRENCY_SYMBOL[currencyQ.data ?? 'UAH']
  const statusesQ = useProductStatuses()
  const assignmentsQ = useAssignments()
  const movementsQ = useStockMovements()
  const customDefsQ = useCustomFieldDefinitions('product')
  const photosQ = useProductPhotos(productId)
  const videosQ = useProductVideos(productId)
  const photoStatusesQ = usePhotoStatuses()
  const products = productsQ.data ?? []
  const materials = materialsQ.data ?? []
  const statuses = statusesQ.data ?? []
  const assignments = assignmentsQ.data ?? []
  const movements = movementsQ.data ?? []
  const customDefs = customDefsQ.data ?? []
  const photos = photosQ.data ?? []
  const videos = videosQ.data ?? []
  const photoStatuses = photoStatusesQ.data ?? []
  // Фото зі статусом isVisible=false (Довідники → "Статуси фото") не показуються
  // у звичайному перегляді — той самий гейтинг, що й у друкованій формі.
  const visiblePhotos = photos.filter(p => (photoStatuses.find(s => s.id === p.statusId)?.isVisible ?? true))

  // "Історія" — аудит-лог змін продукту (хто/коли змінив назву, опис,
  // категорію, статус) — та сама верстка, що й "Історія" у SpecificationPage.tsx.
  const [view, setView] = useState<'detail' | 'history'>('detail')
  const eventsQ = useProductEvents(canEditProduct && view === 'history' ? productId : null)

  const [variantsOpen, setVariantsOpen] = useState(false)
  const [openSection, setOpenSection] = useState<string | null>(null)

  const product = products.find(p => p.id === productId)
  const customValuesQ = useCustomFieldValues('product', product?.id ?? null)

  if (!product) return null

  const productAssignments = assignments.filter(a => a.productId === productId)
  const completedAssignments = productAssignments.filter(a => a.status === 'done')
  const productWriteoffs = movements.filter(m => m.productId === productId && m.type === 'out')

  const catPath = buildProductCatPath(product.categoryId, categories, tn)
  const status = statuses.find(s => s.id === product.statusId)
  const qrUrl = `${window.location.origin}/?product=${product.id}`

  const variantAttributeIds = new Set(catalogAttributes.filter(a => a.isVariant).map(a => a.id))
  const variants = buildVariants(product.attributes, variantAttributeIds)

  // Собівартість матеріалів рахується від базової вартості матеріалу з довідника
  // (Material.cost), а не від ціни останньої поставки — довідникова вартість це
  // єдине "джерело правди" про ціну матеріалу, поставки лише фіксують історію приходів.
  const materialCostById = (materialId: string): number | null =>
    materials.find(m => m.id === materialId)?.cost ?? null
  const materialsCost = product.materials.reduce((sum, pm) => sum + (materialCostById(pm.materialId) ?? 0) * pm.qty, 0)
  const operationsCost = product.operations.reduce((sum, po) => sum + (po.cost ?? 0), 0)

  const filledCustomFields = customDefs.filter(def => {
    if (def.fieldType === 'file') return (customValuesQ.files[def.id]?.length ?? 0) > 0
    const v = customValuesQ.values.find(x => x.fieldDefinitionId === def.id)
    if (!v) return false
    if (def.fieldType === 'text') return !!v.valueText
    if (def.fieldType === 'number') return v.valueNumber !== null
    if (def.fieldType === 'boolean') return v.valueBoolean !== null
    if (def.fieldType === 'select') return !!v.valueOptionId
    return false
  })

  const toggle = (key: string) => setOpenSection(cur => (cur === key ? null : key))

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{ background: 'rgba(248,251,255,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(157,200,255,0.2)' }}>
        <button onClick={() => view === 'history' ? setView('detail') : onBack()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95 transition-all">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="flex-1 text-lg text-slate-800 truncate">
          {view === 'history' ? t('assignments.historyTab') : product.name}
        </h1>
        {view === 'detail' && canEditProduct && (
          <>
            <button onClick={() => setView('history')} title={t('assignments.historyTab')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95 transition-all">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button onClick={onEdit}
              className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-medium text-white active:scale-95 transition-all shrink-0">
              <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
                <path d="M9 2l2 2-7 7H2v-2L9 2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t('common.edit')}
            </button>
          </>
        )}
      </div>

      {view === 'history' ? (
        <div className="px-4 pb-8 pt-4 space-y-2">
          {eventsQ.isLoading ? (
            <p className="py-8 text-center text-sm text-slate-400">{t('common.loading')}</p>
          ) : (eventsQ.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{t('assignments.noHistoryYet')}</p>
          ) : (eventsQ.data ?? []).map(ev => (
            <ProductEventRow key={ev.id} event={ev} categories={categories} statuses={statuses} />
          ))}
        </div>
      ) : (
      <div className="px-4 pb-10 space-y-5 pt-4">
        {/* Photo + Video — окремі блоки в одній лінії */}
        {(visiblePhotos.length > 0 || videos.length > 0) && (
          <div className="flex gap-3">
            {visiblePhotos.length > 0 && (
              <div className="flex-1 min-w-0">
                <ProductPhotoGallery photos={visiblePhotos} productName={product.name} />
              </div>
            )}
            {videos.length > 0 && (
              <div className="flex-1 min-w-0">
                <ProductVideoGallery videos={videos} />
              </div>
            )}
          </div>
        )}

        {/* Name / SKU */}
        <div className="rounded-2xl bg-white px-5 py-4" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-slate-800">{product.name}</h2>
          <p className="text-xs font-mono text-slate-400 mt-0.5">SKU – {product.sku}</p>
        </div>

        {/* Info rows: категорія, собівартість (не для "менеджера перегляд"), статус */}
        <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
          {[
            [t('filters.category'), catPath || '—'],
            ...(isManagerView ? [] : [
              [t('productView.materialsCost'), `${fmt(materialsCost)} ${currencySymbol}`],
              [t('productView.operationsCost'), `${fmt(operationsCost)} ₴`],
            ]),
            [t('productView.statusLabel'), status ? tn(status.name, status.nameEn) : '—'],
          ].map(([label, value], i, arr) => (
            <div key={label} className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(157,200,255,0.15)' : 'none' }}>
              <span className="text-xs text-slate-400">{label}</span>
              <span className="text-sm font-medium text-slate-700 text-right max-w-[60%] truncate">{value}</span>
            </div>
          ))}
        </div>

        {/* Characteristics */}
        {product.attributes.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">{t('productEditor.attributes')}</p>
            <div className="flex flex-wrap gap-2 rounded-2xl bg-white px-4 py-3" style={{ border: '1px solid rgba(157,200,255,0.22)' }}>
              {product.attributes.map(a => (
                <span key={a.valueId} className="rounded-xl px-3 py-1.5 text-xs font-medium" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                  {tn(a.attributeName, a.attributeNameEn)}: {tn(a.value, a.valueEn)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Variants — декартів добуток значень варіантоутворюючих характеристик (згорнуто за замовчуванням) */}
        {variants.length > 0 && (
          <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid rgba(157,200,255,0.22)' }}>
            <button onClick={() => setVariantsOpen(v => !v)}
              className="flex w-full items-center justify-between px-4 py-3.5 text-left">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                {t('productView.variants')} {`(${variants.length})`}
              </p>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                className={`shrink-0 text-slate-400 transition-transform ${variantsOpen ? 'rotate-180' : ''}`}>
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {variantsOpen && (
              <div className="px-4 pb-4 space-y-2" style={{ borderTop: '1px solid rgba(157,200,255,0.15)' }}>
                {variants.map((combo, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-2xl px-4 py-3 mt-3"
                    style={{ background: '#fafbff', border: '1px solid rgba(157,200,255,0.18)' }}>
                    {combo.map((label, j) => (
                      <span key={j} className="rounded-lg px-2 py-1 text-[10px] font-medium" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                        {label}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Матеріали (специфікація) — BOM */}
        <CollapsibleSection title={t('productView.bomTitle')} isOpen={openSection === 'bom'} onToggle={() => toggle('bom')}>
          {product.materials.length === 0 ? (
            <p className="py-3 text-center text-sm text-slate-400">{t('productView.noMaterialsAdded')}</p>
          ) : (
            <div className="space-y-2">
              {product.materials.map(pm => {
                const mat = materials.find(m => m.id === pm.materialId)
                return (
                  <div key={pm.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3"
                    style={{ border: '1px solid rgba(157,200,255,0.18)' }}>
                    <MaterialIcon />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{mat ? tn(mat.name, mat.nameEn) : '—'}</p>
                      <p className="text-xs text-slate-400">{mat ? tn(mat.categoryName, mat.categoryNameEn) : ''}</p>
                    </div>
                    <span className="text-sm font-mono text-slate-600 shrink-0">{pm.qty} {tn(pm.unitShortName, pm.unitShortNameEn)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </CollapsibleSection>

        {/* Операції (специфікація) — BOO */}
        <CollapsibleSection title={t('productView.booTitle')} count={product.operations.length} isOpen={openSection === 'boo'} onToggle={() => toggle('boo')}>
          {product.operations.length === 0 ? (
            <p className="py-3 text-center text-sm text-slate-400">{t('productView.noOperationsAdded')}</p>
          ) : (
            <div className="space-y-2">
              {product.operations.map(po => {
                const op = operations.find(o => o.id === po.operationId)
                return (
                  <div key={po.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3"
                    style={{ border: '1px solid rgba(157,200,255,0.18)' }}>
                    <OperationIcon />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{op ? tn(op.name, op.nameEn) : '—'}</p>
                      <p className="text-xs text-slate-400 truncate">{po.taskName || t('products.noTask')}</p>
                    </div>
                    <span className="text-xs font-mono text-slate-600 shrink-0 text-right">
                      {po.durationMinutes ? `${po.durationMinutes} ${t('common.minutesShort')}` : ''}
                      {po.durationMinutes && po.cost ? ' · ' : ''}
                      {po.cost ? `${po.cost} ₴` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CollapsibleSection>

        {/* Кастомні поля */}
        {customDefs.length > 0 && (
          <CollapsibleSection title={t('directory.customFieldsTitle')} count={filledCustomFields.length} isOpen={openSection === 'custom'} onToggle={() => toggle('custom')}>
            {filledCustomFields.length === 0 ? (
              <p className="py-3 text-center text-sm text-slate-400">{t('productView.noValuesFilled')}</p>
            ) : (
              <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid rgba(157,200,255,0.18)' }}>
                {filledCustomFields.map((def, i) => {
                  const v = customValuesQ.values.find(x => x.fieldDefinitionId === def.id)
                  let display = '—'
                  if (def.fieldType === 'text') display = v?.valueText ?? '—'
                  if (def.fieldType === 'number') display = v?.valueNumber !== null && v?.valueNumber !== undefined ? String(v.valueNumber) : '—'
                  if (def.fieldType === 'boolean') display = v?.valueBoolean ? t('common.yes') : t('common.no')
                  if (def.fieldType === 'select') {
                    const opt = def.options.find(o => o.id === v?.valueOptionId)
                    display = opt ? tn(opt.value, opt.valueEn) : '—'
                  }
                  return (
                    <div key={def.id} className="flex items-center justify-between px-4 py-3"
                      style={{ borderBottom: i < filledCustomFields.length - 1 ? '1px solid rgba(157,200,255,0.15)' : 'none' }}>
                      <span className="text-xs text-slate-400">{tn(def.name, def.nameEn)}</span>
                      {def.fieldType === 'file' ? (
                        <div className="flex flex-col items-end gap-1 max-w-[60%]">
                          {(customValuesQ.files[def.id] ?? []).map(f => (
                            <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 truncate">{f.filename}</a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-slate-700 text-right max-w-[60%] truncate">{display}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CollapsibleSection>
        )}

        {/* Використані матеріали — фактичні списання */}
        <CollapsibleSection title={t('productView.usedMaterialsTitle')} count={productWriteoffs.length} isOpen={openSection === 'used'} onToggle={() => toggle('used')} uppercase>
          {productWriteoffs.length === 0 ? (
            <p className="py-3 text-center text-sm text-slate-400">{t('productView.noWriteoffsYet')}</p>
          ) : (
            <div className="space-y-2">
              {productWriteoffs.map(m => {
                const mat = materials.find(x => x.id === m.materialId)
                const wh = warehouses.find(w => w.id === m.warehouseId)
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3" style={{ border: '1px solid rgba(157,200,255,0.18)' }}>
                    <MaterialIcon />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{mat ? tn(mat.name, mat.nameEn) : '—'}</p>
                      <p className="text-xs text-slate-400 truncate">{mat ? tn(mat.unitShortName, mat.unitShortNameEn) : ''} · {wh ? tn(wh.name, wh.nameEn) : '—'} · {new Date(m.createdAt).toLocaleDateString('uk-UA')}</p>
                    </div>
                    <span className="text-sm font-mono text-slate-600 shrink-0">{fmt(m.qty)} {mat ? tn(mat.unitShortName, mat.unitShortNameEn) : ''}</span>
                  </div>
                )
              })}
            </div>
          )}
        </CollapsibleSection>

        {/* Виконані операції — завершені завдання по цьому продукту */}
        <CollapsibleSection title={t('productView.completedOperationsTitle')} count={completedAssignments.length} isOpen={openSection === 'done'} onToggle={() => toggle('done')} uppercase>
          {completedAssignments.length === 0 ? (
            <p className="py-3 text-center text-sm text-slate-400">{t('productView.noCompletedOperationsYet')}</p>
          ) : (
            <div className="space-y-2">
              {completedAssignments.map(a => (
                <div key={a.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3" style={{ border: '1px solid rgba(157,200,255,0.18)' }}>
                  <OperationIcon />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{tn(a.operationName, a.operationNameEn)}</p>
                    <p className="text-xs text-slate-400 truncate">{a.name} · {t('assignments.assigneePrefix', { name: a.assigneeName })}</p>
                  </div>
                  {a.durationMinutes !== null && (
                    <span className="text-xs font-mono text-slate-600 shrink-0">{a.durationMinutes} {t('common.minutesShort')}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* QR */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">{t('productView.qrCodeLabel')}</p>
          <div className="flex items-center gap-4 rounded-2xl bg-white px-5 py-4" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            <QRCodeLib value={qrUrl} size={80} />
            <div>
              <p className="text-sm font-medium text-slate-700">{t('productView.qrOpensCard')}</p>
              <p className="text-xs text-slate-400 mt-0.5 break-all">{qrUrl}</p>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Photo gallery — карусель у шапці + full-screen перегляд з гортанням
═══════════════════════════════════════════════════════════ */
/** Спільний обробник для каруселей із прокруткою-снепом (фото й відео) —
 *  визначає активний слайд за позицією скролу. */
const PRODUCT_EVENT_LABEL_KEY: Record<ProductEventType, TranslationKey> = {
  created: 'productEvent.created',
  name_changed: 'productEvent.nameChanged',
  description_changed: 'productEvent.descriptionChanged',
  category_changed: 'productEvent.categoryChanged',
  status_changed: 'productEvent.statusChanged',
}

/** Один рядок "Історії" продукту — подія + деталі зміни (стара → нова) + хто
 *  й коли. category_changed/status_changed зберігають id — резолвимо назву за
 *  вже завантаженим каталогом (той самий підхід, що й ProductMaterialEventRow
 *  у SpecificationPage.tsx). */
function ProductEventRow({ event, categories, statuses }: {
  event: ProductEvent
  categories: ProductCategory[]
  statuses: { id: string; name: string; nameEn: string | null }[]
}) {
  const { t, tn } = useLocale()

  const catName = (id: string | null) => {
    if (!id) return '—'
    const c = categories.find(x => x.id === id)
    return c ? tn(c.name, c.nameEn) : '—'
  }
  const statusName = (id: string | null) => {
    if (!id) return '—'
    const s = statuses.find(x => x.id === id)
    return s ? tn(s.name, s.nameEn) : '—'
  }

  const detail = (() => {
    if (event.eventType === 'created' && event.newValue && typeof event.newValue === 'object') return event.newValue.name
    if (event.eventType === 'category_changed') {
      const oldId = typeof event.oldValue === 'string' ? event.oldValue : null
      const newId = typeof event.newValue === 'string' ? event.newValue : null
      return `${catName(oldId)} → ${catName(newId)}`
    }
    if (event.eventType === 'status_changed') {
      const oldId = typeof event.oldValue === 'string' ? event.oldValue : null
      const newId = typeof event.newValue === 'string' ? event.newValue : null
      return `${statusName(oldId)} → ${statusName(newId)}`
    }
    if (typeof event.oldValue === 'string' && typeof event.newValue === 'string') return `${event.oldValue} → ${event.newValue}`
    return null
  })()

  return (
    <div className="rounded-2xl bg-white px-4 py-3" style={{ border: '1px solid rgba(157,200,255,0.22)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700 truncate">{t(PRODUCT_EVENT_LABEL_KEY[event.eventType])}</span>
        <span className="text-[10px] text-slate-400 shrink-0">
          {new Date(event.occurredAt).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      {detail && <p className="text-xs text-slate-500 mt-0.5 truncate">{detail}</p>}
      <p className="text-xs text-slate-400 mt-0.5">{event.actorName}</p>
    </div>
  )
}

function trackScrolled(setIdx: (i: number) => void) {
  return (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.clientWidth === 0) return
    setIdx(Math.round(el.scrollLeft / el.clientWidth))
  }
}

function ProductPhotoGallery({ photos, productName }: { photos: PhotoItem[]; productName: string }) {
  const { t } = useLocale()
  const [activeIndex, setActiveIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const lightboxTrackRef = useRef<HTMLDivElement>(null)

  const openLightboxAt = (idx: number) => {
    setActiveIndex(idx)
    setLightboxOpen(true)
  }

  // При відкритті full-screen перегляду одразу прокрутити до фото, по якому тапнули
  useEffect(() => {
    const track = lightboxTrackRef.current
    if (lightboxOpen && track) track.scrollLeft = activeIndex * track.clientWidth
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxOpen])

  return (
    <>
      <div className="relative">
        <div
          onScroll={trackScrolled(setActiveIndex)}
          className="flex overflow-x-auto rounded-2xl bg-slate-100 h-52"
          style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
        >
          {photos.map((p, i) => (
            <img key={p.key} src={p.url} alt={productName} onClick={() => openLightboxAt(i)}
              loading={i === 0 ? 'eager' : 'lazy'}
              className="h-52 w-full shrink-0 object-cover cursor-zoom-in"
              style={{ scrollSnapAlign: 'start' }} />
          ))}
        </div>
        {photos.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {photos.map((p, i) => (
              <span key={p.key} className="h-1.5 rounded-full transition-all"
                style={{ width: i === activeIndex ? 14 : 6, background: i === activeIndex ? '#fff' : 'rgba(255,255,255,0.55)', boxShadow: '0 0 4px rgba(0,0,0,0.35)' }} />
            ))}
          </div>
        )}
      </div>

      {/* Full-screen перегляд з гортанням усіх фото */}
      {lightboxOpen && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(10,12,20,0.97)' }}
          onClick={() => setLightboxOpen(false)}>
          <div className="flex shrink-0 items-center justify-between px-4 py-3" onClick={e => e.stopPropagation()}>
            <span className="text-xs font-medium text-white/70">{activeIndex + 1} / {photos.length}</span>
            <div className="flex items-center gap-2">
              {photos[activeIndex]?.originalUrl && (
                <a href={photos[activeIndex].originalUrl!} download
                  className="rounded-full bg-white/10 px-3 py-2 text-xs font-medium text-white active:scale-95 transition-all">
                  {t('common.downloadOriginal')}
                </a>
              )}
              <button onClick={() => setLightboxOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white active:scale-95 transition-all">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>
          <div
            ref={lightboxTrackRef}
            onScroll={trackScrolled(setActiveIndex)}
            onClick={e => e.stopPropagation()}
            className="flex flex-1 overflow-x-auto"
            style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
          >
            {photos.map(p => (
              <div key={p.key} className="flex h-full w-full shrink-0 items-center justify-center px-2"
                style={{ scrollSnapAlign: 'start' }}>
                <img src={p.url} alt={productName} className="max-h-full max-w-full object-contain" />
              </div>
            ))}
          </div>
          {photos.length > 1 && (
            <div className="flex shrink-0 justify-center gap-1.5 py-4" onClick={e => e.stopPropagation()}>
              {photos.map((p, i) => (
                <span key={p.key} className="h-1.5 rounded-full transition-all"
                  style={{ width: i === activeIndex ? 14 : 6, background: i === activeIndex ? '#fff' : 'rgba(255,255,255,0.35)' }} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════
   Video gallery — той самий патерн, що й фотокарусель:
   прев'ю-карусель у шапці + full-screen перегляд з гортанням
═══════════════════════════════════════════════════════════ */
function ProductVideoGallery({ videos }: { videos: VideoItem[] }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const lightboxTrackRef = useRef<HTMLDivElement>(null)

  const openLightboxAt = (idx: number) => {
    setActiveIndex(idx)
    setLightboxOpen(true)
  }

  // При відкритті full-screen перегляду одразу прокрутити до відео, по якому тапнули
  useEffect(() => {
    const track = lightboxTrackRef.current
    if (lightboxOpen && track) track.scrollLeft = activeIndex * track.clientWidth
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxOpen])

  return (
    <>
      <div className="relative">
        <div
          onScroll={trackScrolled(setActiveIndex)}
          className="flex overflow-x-auto rounded-2xl bg-slate-900 h-52"
          style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
        >
          {videos.map((v, i) => (
            <div key={v.key} onClick={() => openLightboxAt(i)}
              className="relative h-52 w-full shrink-0 cursor-zoom-in" style={{ scrollSnapAlign: 'start' }}>
              <video src={v.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M4 2.5l9 5.5-9 5.5v-11z" fill="white"/>
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>
        {videos.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {videos.map((v, i) => (
              <span key={v.key} className="h-1.5 rounded-full transition-all"
                style={{ width: i === activeIndex ? 14 : 6, background: i === activeIndex ? '#fff' : 'rgba(255,255,255,0.55)', boxShadow: '0 0 4px rgba(0,0,0,0.35)' }} />
            ))}
          </div>
        )}
      </div>

      {/* Full-screen перегляд з гортанням усіх відео */}
      {lightboxOpen && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(10,12,20,0.97)' }}
          onClick={() => setLightboxOpen(false)}>
          <div className="flex shrink-0 items-center justify-between px-4 py-3" onClick={e => e.stopPropagation()}>
            <span className="text-xs font-medium text-white/70">{activeIndex + 1} / {videos.length}</span>
            <button onClick={() => setLightboxOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white active:scale-95 transition-all">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <div
            ref={lightboxTrackRef}
            onScroll={trackScrolled(setActiveIndex)}
            onClick={e => e.stopPropagation()}
            className="flex flex-1 overflow-x-auto"
            style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
          >
            {videos.map(v => (
              <div key={v.key} className="flex h-full w-full shrink-0 items-center justify-center px-2"
                style={{ scrollSnapAlign: 'start' }}>
                <video src={v.url} controls autoPlay playsInline className="max-h-full max-w-full object-contain" />
              </div>
            ))}
          </div>
          {videos.length > 1 && (
            <div className="flex shrink-0 justify-center gap-1.5 py-4" onClick={e => e.stopPropagation()}>
              {videos.map((v, i) => (
                <span key={v.key} className="h-1.5 rounded-full transition-all"
                  style={{ width: i === activeIndex ? 14 : 6, background: i === activeIndex ? '#fff' : 'rgba(255,255,255,0.35)' }} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function CollapsibleSection({ title, count, isOpen, onToggle, uppercase, children }: {
  title: string
  count?: number
  isOpen: boolean
  onToggle: () => void
  uppercase?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={uppercase ? '' : 'rounded-2xl bg-white overflow-hidden'} style={uppercase ? {} : { border: '1px solid rgba(157,200,255,0.22)' }}>
      <button onClick={onToggle} className={`flex w-full items-center justify-between text-left ${uppercase ? 'px-1 py-1' : 'px-4 py-3.5'}`}>
        <span className={uppercase
          ? 'flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400'
          : 'flex items-center gap-1.5 text-sm font-semibold text-slate-800'}>
          {title}
          {count !== undefined && count > 0 && (
            <span className="rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold px-1.5 py-0.5">{count}</span>
          )}
        </span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
          className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {isOpen && <div className={uppercase ? 'mt-2' : 'px-4 pb-4'} style={uppercase ? {} : { borderTop: '1px solid rgba(157,200,255,0.15)', paddingTop: 12 }}>{children}</div>}
    </div>
  )
}

function MaterialIcon() {
  return (
    <div className="h-8 w-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 shrink-0">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
        <path d="M2 4.5L8 8L14 4.5M8 15V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

function OperationIcon() {
  return (
    <div className="h-8 w-8 rounded-xl bg-orange-50 flex items-center justify-center text-orange-500 shrink-0">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.7 2.7l1.06 1.06M10.24 10.24l1.06 1.06M2.7 11.3l1.06-1.06M10.24 3.76l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    </div>
  )
}
