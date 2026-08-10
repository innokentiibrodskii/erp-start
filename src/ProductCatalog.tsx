import { useState, useRef, useEffect } from 'react'
import QRCodeLib from 'react-qr-code'
import { useCatalog } from './hooks/useCatalog'
import { useProducts, useMaterials, useProductStatuses, type Product } from './hooks/useProducts'
import { useProductMaterialMutations } from './hooks/useProductMaterials'
import { useProductOperationMutations } from './hooks/useProductOperations'
import ProductEditor from './ProductEditor'
import ProductView from './ProductView'
import MaterialPickerSheet from './MaterialPickerSheet'
import OperationPickerSheet from './OperationPickerSheet'

type QuickActionType = 'materials' | 'operations' | 'attributes'

const LS_SORT_BY  = 'products_sortBy'
const LS_SORT_DIR = 'products_sortDir'
const LS_FILTER   = 'products_filterStatusId'

function ls<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback } catch { return fallback }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* ignore */ }
}

interface Props { onNavigate: (page: string) => void }

export default function ProductCatalog({ onNavigate: _onNavigate }: Props) {
  const { categories, operations } = useCatalog()
  const productsQ = useProducts()
  const materialsQ = useMaterials()
  const statusesQ = useProductStatuses()
  const { addMaterial, removeMaterial } = useProductMaterialMutations()
  const { removeOperation } = useProductOperationMutations()
  const products = productsQ.data ?? []
  const materials = materialsQ.data ?? []
  const productStatuses = statusesQ.data ?? []

  const defaultStatusId = productStatuses.find(s => s.isDefault)?.id ?? null

  const [search, setSearch]           = useState('')
  const [editId, setEditId]           = useState<string | 'new' | null>(null)
  const [viewId, setViewId]           = useState<string | null>(null)
  const [qrProductId, setQrProductId] = useState<string | null>(null)
  const [quickAction, setQuickAction] = useState<{ productId: string; type: QuickActionType } | null>(null)
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false)
  const [operationPickerOpen, setOperationPickerOpen] = useState(false)

  const [sortBy, setSortBy]   = useState<'name' | 'createdAt' | 'updatedAt'>(() => ls(LS_SORT_BY, 'createdAt'))
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => ls(LS_SORT_DIR, 'desc'))
  const [filterStatusId, setFilterStatusId] = useState<string | null>(() => ls(LS_FILTER, null))

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
  const filterRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activeStatus = productStatuses.find(s => s.id === filterStatusId)
  const hasActiveFilters = filterStatusId !== null || sortBy !== 'createdAt' || sortDir !== 'desc'

  const filtered = products
    .filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
      const matchStatus = filterStatusId === null || p.statusId === filterStatusId
      return matchSearch && matchStatus
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name, 'uk')
      else cmp = a[sortBy] - b[sortBy]
      return sortDir === 'asc' ? cmp : -cmp
    })

  const getCat = (id: string | null) => categories.find(c => c.id === id)

  if (editId !== null) {
    return <ProductEditor productId={editId === 'new' ? null : editId} onBack={() => setEditId(null)} />
  }
  if (viewId !== null) {
    return <ProductView productId={viewId} onBack={() => setViewId(null)} onEdit={() => { setEditId(viewId); setViewId(null) }} />
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div className="px-4 pt-5 pb-4">
        <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl text-slate-800 mb-1">Продукти</h1>
        <p className="text-xs text-slate-400 mb-4">
          {filtered.length !== products.length
            ? <>{filtered.length} з {products.length} · {activeStatus ? <span style={{ color: activeStatus.color }}>{activeStatus.name}</span> : 'Всі'}</>
            : <>{products.length} позицій</>
          }
        </p>

        {/* Search + filter row */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input type="search" placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
          </div>
          {/* Filter/sort button */}
          <div className="relative shrink-0" ref={filterRef}>
            <button onClick={() => setFilterOpen(v => !v)}
              className="relative flex h-[46px] w-[46px] items-center justify-center rounded-2xl border transition-all active:scale-95"
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
            {/* Dropdown panel */}
            {filterOpen && (
              <div className="absolute right-0 top-[52px] z-30 w-64 rounded-2xl bg-white p-4 space-y-4"
                style={{ boxShadow: '0 8px 32px rgba(0,0,60,0.12)', border: '1px solid rgba(157,200,255,0.25)' }}>
                {/* Sort */}
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Сортування</p>
                  <div className="space-y-1">
                    {([['name', 'За назвою'], ['createdAt', 'За датою створення'], ['updatedAt', 'За датою змін']] as ['name' | 'createdAt' | 'updatedAt', string][]).map(([key, label]) => {
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
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Статус</p>
                    <div className="space-y-1">
                      <button onClick={() => setFilter(null)}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all"
                        style={filterStatusId === null ? { background: '#f8fafc', color: '#1e293b', fontWeight: 500 } : { color: '#64748b' }}>
                        <span className="h-2 w-2 rounded-full bg-slate-300" />
                        Всі
                      </button>
                      {productStatuses.map(s => {
                        const active = filterStatusId === s.id
                        return (
                          <button key={s.id} onClick={() => setFilter(active ? null : s.id)}
                            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all"
                            style={active ? { background: s.color + '12', color: s.color, fontWeight: 500 } : { color: '#64748b' }}>
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                            {s.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {/* Reset */}
                {hasActiveFilters && (
                  <button onClick={() => { setFilter(defaultStatusId); setSortBy('createdAt'); setSortDir('desc'); lsSet(LS_SORT_BY, 'createdAt'); lsSet(LS_SORT_DIR, 'desc') }}
                    className="w-full rounded-xl py-2 text-xs text-slate-400 hover:text-red-400 transition-colors text-center">
                    Скинути фільтри
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <button onClick={() => setEditId('new')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white active:scale-[0.98] transition-all">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
          </svg>
          Додати продукт
        </button>
      </div>

      {/* Cards */}
      <div className="px-4 space-y-3 pb-8">
        {productsQ.isLoading ? (
          <div className="py-10 text-center text-sm text-slate-400">Завантаження…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white py-14 text-center" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            <p className="text-2xl mb-2">📦</p>
            <p className="text-sm text-slate-400">Продуктів ще немає</p>
          </div>
        ) : (
          filtered.map(product => {
            const cat = getCat(product.categoryId)
            const statusObj = productStatuses.find(s => s.id === product.statusId)
            return (
              <div key={product.id} className="overflow-hidden rounded-2xl bg-white"
                style={{ border: '1px solid rgba(157,200,255,0.22)', boxShadow: '0 1px 10px rgba(157,200,255,0.09)' }}>
                {/* Main row — tap opens view */}
                <div role="button" tabIndex={0} onClick={() => setViewId(product.id)} onKeyDown={e => e.key === 'Enter' && setViewId(product.id)} className="flex w-full items-center gap-3 px-4 pt-4 pb-3 cursor-pointer">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                    {product.photo
                      ? <img src={product.photo} alt={product.name} className="h-full w-full object-cover" />
                      : <div className="h-full w-full flex items-center justify-center text-slate-300">
                          <svg width="22" height="22" viewBox="0 0 20 20" fill="none"><rect x="2" y="2" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.4"/><path d="M2 13l4-4 3 3 3-3 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{product.name}</p>
                    <p className="text-xs font-mono text-slate-400 mt-0.5">{product.sku}</p>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      {statusObj && (
                        <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusObj.color }} />
                          {statusObj.name}
                        </span>
                      )}
                      {cat && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ background: '#f5f3ff', color: cat.color ?? '#7c3aed' }}>{cat.name}</span>
                      )}
                      {product.materials.length > 0 && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-600">
                          {product.materials.length} мат.
                        </span>
                      )}
                      {product.operations.length > 0 && (
                        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] text-orange-500">
                          {product.operations.length} опер.
                        </span>
                      )}
                      {product.attributes.length > 0 && (
                        <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                          {product.attributes.length} характ.
                        </span>
                      )}
                    </div>
                  </div>
                  {/* QR + Edit — stop propagation so card tap still works */}
                  <div className="flex flex-col gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setQrProductId(product.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-all">
                      <QRIcon />
                    </button>
                    <button onClick={() => setEditId(product.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800 text-white hover:bg-slate-700 transition-all">
                      <PencilIcon />
                    </button>
                  </div>
                </div>
                {/* Quick actions row */}
                <div className="flex gap-2 px-4 pb-4" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setQuickAction({ productId: product.id, type: 'materials' })}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 py-2.5 text-xs font-medium text-amber-600 active:scale-[0.97] transition-all">
                    <LayersIcon />
                    Матеріали
                  </button>
                  <button
                    onClick={() => setQuickAction({ productId: product.id, type: 'operations' })}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 py-2.5 text-xs font-medium text-orange-500 active:scale-[0.97] transition-all">
                    <GearIcon />
                    Операції
                  </button>
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

      {/* Quick-view bottom sheet */}
      {quickAction !== null && (() => {
        const product = products.find(p => p.id === quickAction.productId)
        if (!product) return null
        const isMat = quickAction.type === 'materials'
        const closeAll = () => { setQuickAction(null); setMaterialPickerOpen(false); setOperationPickerOpen(false) }
        return (
          <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
            style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
            onClick={e => e.target === e.currentTarget && closeAll()}>
            <div className="rounded-t-3xl bg-white pb-10 max-h-[75vh] overflow-y-auto sm:rounded-3xl sm:w-full sm:max-w-md">
              <div className="flex justify-center pt-3 pb-2">
                <button onClick={closeAll} className="h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
              </div>
              <div className="flex items-center justify-between gap-3 px-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`rounded-xl p-2 ${isMat ? 'bg-amber-50 text-amber-500' : 'bg-orange-50 text-orange-500'}`}>
                    {isMat ? <LayersIcon size={18} /> : <GearIcon size={18} />}
                  </div>
                  <div>
                    <p style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-slate-800">
                      {isMat ? 'Матеріали' : 'Операції'}
                    </p>
                    <p className="text-xs text-slate-400">{product.name}</p>
                  </div>
                </div>
                <button onClick={() => isMat ? setMaterialPickerOpen(true) : setOperationPickerOpen(true)}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium active:scale-95 transition-all shrink-0 ${isMat ? 'bg-amber-50 text-amber-600' : 'bg-orange-50 text-orange-600'}`}>
                  <svg width="10" height="10" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
                  Додати
                </button>
              </div>

              {isMat ? (
                product.materials.length === 0 ? (
                  <div className="px-5 py-6 text-center">
                    <p className="text-sm text-slate-400">Не додано жодного матеріалу</p>
                  </div>
                ) : (
                  <div className="px-5 space-y-2">
                    {product.materials.map(pm => {
                      const m = materials.find(x => x.id === pm.materialId)
                      const op = pm.operationId ? operations.find(x => x.id === pm.operationId) : null
                      return (
                        <div key={pm.materialId} className="flex items-center gap-3 rounded-2xl px-4 py-3"
                          style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{m?.name ?? '—'}</p>
                            <p className="text-xs text-slate-400 truncate">{op ? `Операція: ${op.name}` : (m?.categoryName || 'Без операції')}</p>
                          </div>
                          <span className="text-sm font-mono text-slate-600 shrink-0">{pm.qty} {pm.unitShortName}</span>
                          <button onClick={() => removeMaterial({ productId: product.id, materialId: pm.materialId })}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-red-500 transition-all">
                            <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
                              <path d="M2 3h9M4 3V2h5v1M5 6v4M8 6v4M3 3l.5 8h6l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )
              ) : product.operations.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <p className="text-sm text-slate-400">Не додано жодної операції</p>
                </div>
              ) : (
                <div className="px-5 space-y-2">
                  {product.operations.map(po => {
                    const o = operations.find(x => x.id === po.operationId)
                    return (
                      <div key={po.id} className="flex items-center gap-3 rounded-2xl px-4 py-3"
                        style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{o?.name ?? '—'}</p>
                          <p className="text-xs text-slate-400 truncate">{po.taskName || 'Без завдання'}</p>
                        </div>
                        <span className="text-xs font-mono text-slate-600 shrink-0 text-right">
                          {po.durationMinutes ? `${po.durationMinutes} хв` : ''}
                          {po.durationMinutes && po.cost ? ' · ' : ''}
                          {po.cost ? `${po.cost} ₴` : ''}
                        </span>
                        <button onClick={() => removeOperation({ id: po.id, productId: product.id, taskId: po.taskId })}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-red-500 transition-all">
                          <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
                            <path d="M2 3h9M4 3V2h5v1M5 6v4M8 6v4M3 3l.5 8h6l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    )
                  })}
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
            </div>
          </div>
        )
      })()}
    </div>
  )
}

/* ── QR Modal ── */
function QRModal({ productId, products, onClose }: { productId: string; products: Product[]; onClose: () => void }) {
  const product = products.find(p => p.id === productId)
  if (!product) return null
  const qrUrl = `${window.location.origin}/?product=${product.id}`

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    const qrEl = document.getElementById('qr-svg-print')?.querySelector('svg')
    printWindow.document.write(`
      <html><head><title>QR — ${product.name}</title>
      <style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;gap:16px}
      h2{font-size:18px;font-weight:600;color:#1e293b;margin:0}p{font-size:12px;color:#64748b;margin:0;font-family:monospace}</style>
      </head><body>
      ${qrEl?.outerHTML ?? ''}
      <h2>${product.name}</h2>
      <p>${product.sku}</p>
      </body></html>`)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => printWindow.print(), 300)
  }

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
          <div className="rounded-2xl bg-white p-5" id="qr-svg-print" style={{ border: '1px solid rgba(157,200,255,0.3)' }}>
            <QRCodeLib value={qrUrl} size={180} />
          </div>
          <p className="text-[10px] text-slate-400 text-center">Скануйте для перегляду картки продукту</p>
          <div className="flex gap-3 w-full pt-2">
            <button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm text-slate-600">
              Закрити
            </button>
            <button onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-slate-800 py-3 text-sm font-medium text-white">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 5V2h8v3M3 9H2a1 1 0 01-1-1V6a1 1 0 011-1h10a1 1 0 011 1v2a1 1 0 01-1 1h-1M3 9v3h8V9H3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              </svg>
              Роздрукувати
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

function GearIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.7 2.7l1.06 1.06M10.24 10.24l1.06 1.06M2.7 11.3l1.06-1.06M10.24 3.76l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
