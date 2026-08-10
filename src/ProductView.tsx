import QRCodeLib from 'react-qr-code'
import { useCatalog } from './hooks/useCatalog'
import { useProducts, useMaterials, useProductStatuses } from './hooks/useProducts'

interface Props {
  productId: string
  onBack: () => void
  onEdit: () => void
}

export default function ProductView({ productId, onBack, onEdit }: Props) {
  const { categories, operations } = useCatalog()
  const productsQ = useProducts()
  const materialsQ = useMaterials()
  const statusesQ = useProductStatuses()
  const products = productsQ.data ?? []
  const materials = materialsQ.data ?? []
  const statuses = statusesQ.data ?? []

  const product = products.find(p => p.id === productId)
  if (!product) return null

  const cat = categories.find(c => c.id === product.categoryId)
  const status = statuses.find(s => s.id === product.statusId)
  const qrUrl = `${window.location.origin}/?product=${product.id}`

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

        {/* Basic info */}
        <div className="rounded-2xl bg-white px-5 py-4 space-y-3" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-slate-800">{product.name}</h2>
              <p className="text-xs font-mono text-slate-400 mt-0.5">{product.sku}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              {cat && (
                <span className="rounded-xl px-3 py-1.5 text-xs font-medium mt-0.5"
                  style={{ background: '#f5f3ff', color: cat.color ?? '#7c3aed' }}>
                  {cat.name}
                </span>
              )}
              {status && (
                <span className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium"
                  style={{ background: `${status.color}1a`, color: status.color }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.color }} />
                  {status.name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Materials */}
        {product.materials.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Матеріали</p>
            <div className="space-y-2">
              {product.materials.map(pm => {
                const mat = materials.find(m => m.id === pm.materialId)
                return (
                  <div key={pm.materialId} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3"
                    style={{ border: '1px solid rgba(157,200,255,0.22)' }}>
                    <div className="h-8 w-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 shrink-0">
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                        <path d="M2 4.5L8 8L14 4.5M8 15V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{mat?.name ?? '—'}</p>
                      <p className="text-xs text-slate-400">{mat?.categoryName}</p>
                    </div>
                    <span className="text-sm font-mono text-slate-600 shrink-0">{pm.qty} {pm.unitShortName}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Operations */}
        {product.operations.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Операції</p>
            <div className="space-y-2">
              {product.operations.map(po => {
                const op = operations.find(o => o.id === po.operationId)
                return (
                  <div key={po.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3"
                    style={{ border: '1px solid rgba(157,200,255,0.22)' }}>
                    <div className="h-8 w-8 rounded-xl bg-orange-50 flex items-center justify-center text-orange-500 shrink-0">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3"/>
                        <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.7 2.7l1.06 1.06M10.24 10.24l1.06 1.06M2.7 11.3l1.06-1.06M10.24 3.76l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                    </div>
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
          </div>
        )}

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
