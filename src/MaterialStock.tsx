import { useState } from 'react'
import { useCatalog } from './hooks/useCatalog'
import { useMaterials, type Material } from './hooks/useMaterials'
import { useProducts, useProductStatuses } from './hooks/useProducts'
import { useStockMovements, computeBalances, balanceFor, totalFor, useStockMutations, type MovementType } from './hooks/useMaterialStock'
import type { Warehouse } from './hooks/useCatalog'

interface Props { onNavigate: (page: string) => void }

export default function MaterialStock({ onNavigate: _onNavigate }: Props) {
  const { warehouses } = useCatalog()
  const materialsQ = useMaterials()
  const movementsQ = useStockMovements()
  const materials = materialsQ.data ?? []
  const balances = computeBalances(movementsQ.data ?? [])

  const [search, setSearch] = useState('')
  const [sheetMode, setSheetMode] = useState<MovementType | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const showToast = (text: string) => { setToast(text); setTimeout(() => setToast(null), 2200) }

  const filtered = materials.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
  const getWarehouse = (id: string) => warehouses.find(w => w.id === id)

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
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

      <div className="px-4 pt-5 pb-3">
        <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl text-slate-800 mb-1">Матеріали</h1>
        <p className="text-xs text-slate-400 mb-3">{materials.length} позицій</p>

        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input type="search" placeholder="Пошук матеріалу..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
        </div>

        <div className="flex gap-2">
          <button onClick={() => setSheetMode('in')}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-green-600 py-3.5 text-sm font-medium text-white active:scale-[0.98] transition-all">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
            </svg>
            Додати
          </button>
          <button onClick={() => setSheetMode('out')}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 py-3.5 text-sm font-medium text-white active:scale-[0.98] transition-all">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M1 6.5h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
            </svg>
            Списати
          </button>
        </div>
      </div>

      <div className="px-4 space-y-2 pb-8">
        {materialsQ.isLoading || movementsQ.isLoading ? (
          <div className="py-10 text-center text-sm text-slate-400">Завантаження…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white py-12 text-center text-sm text-slate-400"
            style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            Нічого не знайдено
          </div>
        ) : filtered.map(m => {
          const total = totalFor(balances, m.id)
          const perWarehouse = balances.filter(b => b.materialId === m.id && b.qty !== 0)
          return (
            <div key={m.id} className="rounded-2xl bg-white overflow-hidden"
              style={{ border: '1px solid rgba(157,200,255,0.22)', boxShadow: '0 1px 6px rgba(157,200,255,0.07)' }}>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="h-12 w-12 shrink-0 rounded-xl overflow-hidden bg-amber-50 flex items-center justify-center text-amber-400">
                  {m.photo
                    ? <img src={m.photo} alt={m.name} className="h-full w-full object-cover" />
                    : <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                        <path d="M2 4.5L8 8L14 4.5M8 15V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{m.name}</p>
                  {perWarehouse.length === 0 ? (
                    <p className="text-xs text-slate-400 mt-0.5">Немає залишків</p>
                  ) : (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {perWarehouse.map(b => {
                        const w = getWarehouse(b.warehouseId)
                        return (
                          <span key={b.warehouseId} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 font-medium">
                            {w?.name ?? '—'}: {b.qty} {m.unitShortName}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold" style={{ color: total > 0 ? '#16a34a' : '#94a3b8' }}>{total}</p>
                  <p className="text-[10px] text-slate-400">{m.unitShortName}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {sheetMode !== null && (
        <StockMovementSheet
          mode={sheetMode}
          materials={materials}
          warehouses={warehouses}
          balances={balances}
          onClose={() => setSheetMode(null)}
          onDone={() => { setSheetMode(null); showToast(sheetMode === 'in' ? 'Додано' : 'Списано') }}
        />
      )}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────
   Прихід / списання: матеріал → склад → (продукт, якщо списання) → кількість
─────────────────────────────────────────────────────────── */

function StockMovementSheet({ mode, materials, warehouses, balances, onClose, onDone }: {
  mode: MovementType
  materials: Material[]
  warehouses: Warehouse[]
  balances: ReturnType<typeof computeBalances>
  onClose: () => void
  onDone: () => void
}) {
  const productsQ = useProducts()
  const statusesQ = useProductStatuses()
  const activeStatusId = statusesQ.data?.find(s => s.code === 'active')?.id ?? null
  const products = (productsQ.data ?? []).filter(p => activeStatusId === null || p.statusId === activeStatusId)
  const { addStock, writeOffStock, isSaving } = useStockMutations()
  const [materialSearch, setMaterialSearch] = useState('')
  const [materialId, setMaterialId] = useState<string | null>(null)
  const [warehouseId, setWarehouseId] = useState<string | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [productId, setProductId] = useState<string | null>(null)
  const [qty, setQty] = useState('')

  const selectedMaterial = materialId ? materials.find(m => m.id === materialId) ?? null : null
  const filteredMaterials = materials.filter(m => m.name.toLowerCase().includes(materialSearch.toLowerCase()))
  const currentBalance = materialId && warehouseId ? balanceFor(balances, materialId, warehouseId) : 0

  const selectedProduct = productId ? products.find(p => p.id === productId) ?? null : null
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku.toLowerCase().includes(productSearch.toLowerCase()))

  const qtyNum = Number(qty)
  const canConfirm = materialId !== null && warehouseId !== null && qty.trim() !== '' && qtyNum > 0 &&
    (mode === 'in' || (qtyNum <= currentBalance && productId !== null))

  const handleConfirm = async () => {
    if (!canConfirm || !materialId || !warehouseId) return
    if (mode === 'in') await addStock({ materialId, warehouseId, qty: qtyNum })
    else if (productId) await writeOffStock({ materialId, warehouseId, qty: qtyNum, productId })
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-3xl bg-white pt-2 pb-10 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-center py-3">
          <button onClick={onClose} className="h-1 w-10 rounded-full bg-slate-200" />
        </div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="px-5 text-2xl text-slate-800 mb-4">
          {mode === 'in' ? 'Прихід матеріалу' : 'Списання матеріалу'}
        </h2>

        <div className="px-5 space-y-5">
          {/* Material */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">Матеріал</label>
            {selectedMaterial ? (
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <div className="h-9 w-9 shrink-0 rounded-lg overflow-hidden bg-amber-50 flex items-center justify-center text-amber-400">
                  {selectedMaterial.photo ? <img src={selectedMaterial.photo} alt="" className="h-full w-full object-cover" /> : <span className="text-xs">📦</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{selectedMaterial.name}</p>
                  <p className="text-xs text-slate-400">{selectedMaterial.unitShortName}</p>
                </div>
                <button onClick={() => setMaterialId(null)} className="text-xs text-blue-500 font-medium shrink-0">Змінити</button>
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  <input type="search" value={materialSearch} onChange={e => setMaterialSearch(e.target.value)} placeholder="Пошук матеріалу..."
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {filteredMaterials.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-400">Не знайдено</p>
                  ) : filteredMaterials.map(m => (
                    <button key={m.id} onClick={() => setMaterialId(m.id)}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                      style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
                      <div className="h-8 w-8 shrink-0 rounded-lg overflow-hidden bg-amber-50 flex items-center justify-center text-amber-400">
                        {m.photo ? <img src={m.photo} alt="" className="h-full w-full object-cover" /> : <span className="text-xs">📦</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{m.name}</p>
                        <p className="text-xs text-slate-400">{m.unitShortName}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Warehouse */}
          {selectedMaterial && (
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-400">Склад</label>
              {warehouses.length === 0 ? (
                <p className="text-xs text-red-500">Додайте склади у Довідниках</p>
              ) : (
                <div className="space-y-1.5">
                  {warehouses.map(w => {
                    const active = warehouseId === w.id
                    const bal = balanceFor(balances, selectedMaterial.id, w.id)
                    return (
                      <button key={w.id} onClick={() => setWarehouseId(w.id)}
                        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all"
                        style={active ? { background: '#1e293b', border: '1px solid #1e293b' } : { background: 'white', border: '1px solid rgba(157,200,255,0.25)' }}>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${active ? 'text-white' : 'text-slate-700'}`}>{w.name}</p>
                        </div>
                        <span className={`text-xs font-mono shrink-0 ${active ? 'text-white/70' : 'text-slate-400'}`}>
                          {bal} {selectedMaterial.unitShortName}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Product (лише для списання) */}
          {mode === 'out' && selectedMaterial && warehouseId && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">На який продукт</label>
              {selectedProduct ? (
                <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="h-9 w-9 shrink-0 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center text-slate-400">
                    {selectedProduct.photo ? <img src={selectedProduct.photo} alt="" className="h-full w-full object-cover" /> : <span className="text-xs">📦</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{selectedProduct.name}</p>
                    <p className="text-xs font-mono text-slate-400">{selectedProduct.sku}</p>
                  </div>
                  <button onClick={() => setProductId(null)} className="text-xs text-blue-500 font-medium shrink-0">Змінити</button>
                </div>
              ) : (
                <>
                  <div className="relative mb-2">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                      <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                    <input type="search" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Пошук продукту..."
                      className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {filteredProducts.length === 0 ? (
                      <p className="py-4 text-center text-sm text-slate-400">{products.length === 0 ? 'Немає активних продуктів' : 'Не знайдено'}</p>
                    ) : filteredProducts.map(p => (
                      <button key={p.id} onClick={() => setProductId(p.id)}
                        className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                        style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
                        <div className="h-8 w-8 shrink-0 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center text-slate-400">
                          {p.photo ? <img src={p.photo} alt="" className="h-full w-full object-cover" /> : <span className="text-xs">📦</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                          <p className="text-xs font-mono text-slate-400">{p.sku}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Qty */}
          {selectedMaterial && warehouseId && (mode === 'in' || selectedProduct) && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                Кількість ({selectedMaterial.unitShortName})
                {mode === 'out' && <span className="ml-2 normal-case text-slate-400 font-normal">доступно: {currentBalance}</span>}
              </label>
              <input type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} placeholder="0"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
              {mode === 'out' && qtyNum > currentBalance && qty.trim() !== '' && (
                <p className="mt-1.5 text-xs text-red-500">Кількість перевищує наявний залишок</p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6 px-5">
          <button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm text-slate-600">Скасувати</button>
          <button onClick={handleConfirm} disabled={!canConfirm || isSaving}
            className="flex-1 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition-all">
            {isSaving ? 'Збереження…' : mode === 'in' ? 'Додати' : 'Списати'}
          </button>
        </div>
      </div>
    </div>
  )
}
