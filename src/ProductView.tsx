import { useState } from 'react'
import QRCodeLib from 'react-qr-code'
import { useCatalog, type ProductCategory } from './hooks/useCatalog'
import { useProducts, useMaterials, useProductStatuses } from './hooks/useProducts'
import { useAssignments } from './hooks/useAssignments'
import { useStockMovements } from './hooks/useMaterialStock'
import { useCustomFieldDefinitions, useCustomFieldValues } from './hooks/useCustomFields'
import { fmt } from './lib/materialFormat'

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

function buildProductCatPath(id: string | null, all: ProductCategory[]): string {
  if (!id) return ''
  const parts: string[] = []
  let cur: string | null = id
  while (cur) {
    const cat = all.find(c => c.id === cur)
    if (!cat) break
    parts.unshift(cat.name)
    cur = cat.parentId
  }
  return parts.join(' / ')
}

export default function ProductView({ productId, onBack, onEdit }: Props) {
  const { categories, operations, warehouses, attributes: catalogAttributes } = useCatalog()
  const productsQ = useProducts()
  const materialsQ = useMaterials()
  const statusesQ = useProductStatuses()
  const assignmentsQ = useAssignments()
  const movementsQ = useStockMovements()
  const customDefsQ = useCustomFieldDefinitions('product')
  const products = productsQ.data ?? []
  const materials = materialsQ.data ?? []
  const statuses = statusesQ.data ?? []
  const assignments = assignmentsQ.data ?? []
  const movements = movementsQ.data ?? []
  const customDefs = customDefsQ.data ?? []

  const [variantsOpen, setVariantsOpen] = useState(false)
  const [openSection, setOpenSection] = useState<string | null>(null)

  const product = products.find(p => p.id === productId)
  const customValuesQ = useCustomFieldValues('product', product?.id ?? null)

  if (!product) return null

  const productAssignments = assignments.filter(a => a.productId === productId)
  const completedAssignments = productAssignments.filter(a => a.status === 'done')
  const productWriteoffs = movements.filter(m => m.productId === productId && m.type === 'out')

  const catPath = buildProductCatPath(product.categoryId, categories)
  const status = statuses.find(s => s.id === product.statusId)
  const qrUrl = `${window.location.origin}/?product=${product.id}`

  const variantAttributeIds = new Set(catalogAttributes.filter(a => a.isVariant).map(a => a.id))
  const variants = buildVariants(product.attributes, variantAttributeIds)

  const lastMaterialCost = (materialId: string): number | null => {
    const last = movements
      .filter(m => m.materialId === materialId && m.type === 'in' && m.cost !== null)
      .sort((a, b) => b.createdAt - a.createdAt)[0]
    return last?.cost ?? null
  }
  const materialsCost = product.materials.reduce((sum, pm) => sum + (lastMaterialCost(pm.materialId) ?? 0) * pm.qty, 0)
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
        <button onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95 transition-all">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="flex-1 text-lg text-slate-800 truncate">{product.name}</h1>
        <button onClick={onEdit}
          className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-medium text-white active:scale-95 transition-all shrink-0">
          <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
            <path d="M9 2l2 2-7 7H2v-2L9 2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Редагувати
        </button>
      </div>

      <div className="px-4 pb-10 space-y-5 pt-4">
        {/* Photo */}
        {product.photo && (
          <div className="overflow-hidden rounded-2xl bg-slate-100 h-52">
            <img src={product.photo} alt={product.name} className="h-full w-full object-cover" />
          </div>
        )}

        {/* Name / SKU */}
        <div className="rounded-2xl bg-white px-5 py-4" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-slate-800">{product.name}</h2>
          <p className="text-xs font-mono text-slate-400 mt-0.5">SKU – {product.sku}</p>
        </div>

        {/* Info rows: категорія, собівартість, статус */}
        <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
          {[
            ['Категорія', catPath || '—'],
            ['Собівартість матеріалів', `${fmt(materialsCost)} ₴`],
            ['Собівартість операцій', `${fmt(operationsCost)} ₴`],
            ['Статус продукту', status?.name ?? '—'],
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Характеристики</p>
            <div className="flex flex-wrap gap-2 rounded-2xl bg-white px-4 py-3" style={{ border: '1px solid rgba(157,200,255,0.22)' }}>
              {product.attributes.map(a => (
                <span key={a.valueId} className="rounded-xl px-3 py-1.5 text-xs font-medium" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                  {a.attributeName}: {a.value}
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
                Варіанти {`(${variants.length})`}
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
        <CollapsibleSection title="Матеріали (специфікація)" isOpen={openSection === 'bom'} onToggle={() => toggle('bom')}>
          {product.materials.length === 0 ? (
            <p className="py-3 text-center text-sm text-slate-400">Матеріали не додані</p>
          ) : (
            <div className="space-y-2">
              {product.materials.map(pm => {
                const mat = materials.find(m => m.id === pm.materialId)
                return (
                  <div key={pm.materialId} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3"
                    style={{ border: '1px solid rgba(157,200,255,0.18)' }}>
                    <MaterialIcon />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{mat?.name ?? '—'}</p>
                      <p className="text-xs text-slate-400">{mat?.categoryName}</p>
                    </div>
                    <span className="text-sm font-mono text-slate-600 shrink-0">{pm.qty} {pm.unitShortName}</span>
                  </div>
                )
              })}
            </div>
          )}
        </CollapsibleSection>

        {/* Операції (специфікація) — BOO */}
        <CollapsibleSection title="Операції (специфікація)" count={product.operations.length} isOpen={openSection === 'boo'} onToggle={() => toggle('boo')}>
          {product.operations.length === 0 ? (
            <p className="py-3 text-center text-sm text-slate-400">Операції не додані</p>
          ) : (
            <div className="space-y-2">
              {product.operations.map(po => {
                const op = operations.find(o => o.id === po.operationId)
                return (
                  <div key={po.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3"
                    style={{ border: '1px solid rgba(157,200,255,0.18)' }}>
                    <OperationIcon />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{op?.name ?? '—'}</p>
                      <p className="text-xs text-slate-400 truncate">{po.taskName || 'Без завдання'}</p>
                    </div>
                    <span className="text-xs font-mono text-slate-600 shrink-0 text-right">
                      {po.durationMinutes ? `${po.durationMinutes} хв` : ''}
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
          <CollapsibleSection title="Кастомні поля" count={filledCustomFields.length} isOpen={openSection === 'custom'} onToggle={() => toggle('custom')}>
            {filledCustomFields.length === 0 ? (
              <p className="py-3 text-center text-sm text-slate-400">Значення не заповнені</p>
            ) : (
              <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid rgba(157,200,255,0.18)' }}>
                {filledCustomFields.map((def, i) => {
                  const v = customValuesQ.values.find(x => x.fieldDefinitionId === def.id)
                  let display = '—'
                  if (def.fieldType === 'text') display = v?.valueText ?? '—'
                  if (def.fieldType === 'number') display = v?.valueNumber !== null && v?.valueNumber !== undefined ? String(v.valueNumber) : '—'
                  if (def.fieldType === 'boolean') display = v?.valueBoolean ? 'Так' : 'Ні'
                  if (def.fieldType === 'select') display = def.options.find(o => o.id === v?.valueOptionId)?.value ?? '—'
                  return (
                    <div key={def.id} className="flex items-center justify-between px-4 py-3"
                      style={{ borderBottom: i < filledCustomFields.length - 1 ? '1px solid rgba(157,200,255,0.15)' : 'none' }}>
                      <span className="text-xs text-slate-400">{def.name}</span>
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
        <CollapsibleSection title="Використані матеріали" count={productWriteoffs.length} isOpen={openSection === 'used'} onToggle={() => toggle('used')} uppercase>
          {productWriteoffs.length === 0 ? (
            <p className="py-3 text-center text-sm text-slate-400">Списань матеріалів для цього продукту ще немає</p>
          ) : (
            <div className="space-y-2">
              {productWriteoffs.map(m => {
                const mat = materials.find(x => x.id === m.materialId)
                const wh = warehouses.find(w => w.id === m.warehouseId)
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3" style={{ border: '1px solid rgba(157,200,255,0.18)' }}>
                    <MaterialIcon />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{mat?.name ?? '—'}</p>
                      <p className="text-xs text-slate-400 truncate">{mat?.unitShortName} · {wh?.name ?? '—'} · {new Date(m.createdAt).toLocaleDateString('uk-UA')}</p>
                    </div>
                    <span className="text-sm font-mono text-slate-600 shrink-0">{fmt(m.qty)} {mat?.unitShortName}</span>
                  </div>
                )
              })}
            </div>
          )}
        </CollapsibleSection>

        {/* Виконані операції — завершені завдання по цьому продукту */}
        <CollapsibleSection title="Виконані операції" count={completedAssignments.length} isOpen={openSection === 'done'} onToggle={() => toggle('done')} uppercase>
          {completedAssignments.length === 0 ? (
            <p className="py-3 text-center text-sm text-slate-400">Виконаних операцій для цього продукту ще немає</p>
          ) : (
            <div className="space-y-2">
              {completedAssignments.map(a => (
                <div key={a.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3" style={{ border: '1px solid rgba(157,200,255,0.18)' }}>
                  <OperationIcon />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{a.operationName}</p>
                    <p className="text-xs text-slate-400 truncate">{a.name} · Виконавець: {a.assigneeName}</p>
                  </div>
                  {a.durationMinutes !== null && (
                    <span className="text-xs font-mono text-slate-600 shrink-0">{a.durationMinutes} хв</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* QR */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">QR-код</p>
          <div className="flex items-center gap-4 rounded-2xl bg-white px-5 py-4" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            <QRCodeLib value={qrUrl} size={80} />
            <div>
              <p className="text-sm font-medium text-slate-700">Відкриє картку продукту</p>
              <p className="text-xs text-slate-400 mt-0.5 break-all">{qrUrl}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
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
