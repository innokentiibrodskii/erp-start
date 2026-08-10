import { useState } from 'react'
import type { Material } from './hooks/useMaterials'
import type { Operation, Unit } from './hooks/useCatalog'
import { useProductMaterialMutations } from './hooks/useProductMaterials'

/* ───────────────────────────────────────────────────────────
   Пікер додавання матеріалу до продукту: матеріал → кількість →
   операція (обрати наявну / без операції / створити нову інлайн)
─────────────────────────────────────────────────────────── */

export default function MaterialPickerSheet({ productId, allMaterials, alreadyAddedIds, operations, units, onClose, onAdd }: {
  productId: string
  allMaterials: Material[]
  alreadyAddedIds: string[]
  operations: Operation[]
  units: Unit[]
  onClose: () => void
  onAdd: (args: { productId: string; materialId: string; qty: number; unitId: string; operationId: string | null }) => Promise<void>
}) {
  const { createOperation } = useProductMaterialMutations()
  const [search, setSearch] = useState('')
  const [materialId, setMaterialId] = useState<string | null>(null)
  const [qty, setQty] = useState('1')
  const [operationId, setOperationId] = useState<string | null>(null)
  const [newOpMode, setNewOpMode] = useState(false)
  const [newOpName, setNewOpName] = useState('')
  const [newOpUnitId, setNewOpUnitId] = useState<string>(units[0]?.id ?? '')
  const [saving, setSaving] = useState(false)

  const available = allMaterials.filter(m => !alreadyAddedIds.includes(m.id) && m.name.toLowerCase().includes(search.toLowerCase()))
  const selectedMaterial = materialId ? allMaterials.find(m => m.id === materialId) ?? null : null

  const handleCreateOperation = async () => {
    if (!newOpName.trim() || !newOpUnitId) return
    const id = await createOperation({ name: newOpName.trim(), unitId: newOpUnitId })
    setOperationId(id)
    setNewOpMode(false)
    setNewOpName('')
  }

  const canConfirm = materialId !== null && Number(qty) > 0

  const handleConfirm = async () => {
    if (!selectedMaterial || !canConfirm) return
    setSaving(true)
    try {
      await onAdd({ productId, materialId: selectedMaterial.id, qty: Number(qty), unitId: selectedMaterial.unitId, operationId })
    } finally {
      setSaving(false)
    }
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
          Додати матеріал
        </h2>

        {!selectedMaterial ? (
          <div className="px-5">
            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Пошук матеріалу..."
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {available.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">
                  {allMaterials.length === 0 ? 'У каталозі ще немає матеріалів' : 'Усі матеріали вже додані або не знайдено'}
                </p>
              ) : available.map(m => (
                <button key={m.id} onClick={() => setMaterialId(m.id)}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                  style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
                  <div className="h-8 w-8 shrink-0 rounded-lg overflow-hidden bg-amber-50 flex items-center justify-center text-amber-400">
                    {m.photo ? <img src={m.photo} alt="" className="h-full w-full object-cover" /> : <span className="text-xs">📦</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{m.name}</p>
                    <p className="text-xs text-slate-400">{m.unitShortName}{m.categoryName ? ` · ${m.categoryName}` : ''}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-5 space-y-5">
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

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                Кількість ({selectedMaterial.unitShortName})
              </label>
              <input type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-400">Операція</label>
              <div className="flex flex-wrap gap-2 mb-2">
                <button onClick={() => setOperationId(null)}
                  className="rounded-xl px-3 py-2 text-xs font-medium border transition-all"
                  style={operationId === null ? { background: '#1e293b', color: '#fff', borderColor: '#1e293b' } : { background: '#f8fafc', color: '#94a3b8', borderColor: '#e2e8f0' }}>
                  Без операції
                </button>
                {operations.map(o => {
                  const active = operationId === o.id
                  return (
                    <button key={o.id} onClick={() => setOperationId(o.id)}
                      className="rounded-xl px-3 py-2 text-xs font-medium border transition-all"
                      style={active ? { background: '#ea580c', color: '#fff', borderColor: '#ea580c' } : { background: '#fff7ed', color: '#ea580c', borderColor: 'transparent' }}>
                      {o.name}
                    </button>
                  )
                })}
              </div>

              {!newOpMode ? (
                <button onClick={() => setNewOpMode(true)} className="text-xs text-blue-500 font-medium hover:underline">
                  + Операції немає в списку — додати нову
                </button>
              ) : (
                <div className="rounded-2xl border border-slate-200 p-3 space-y-3 mt-2">
                  <input type="text" value={newOpName} onChange={e => setNewOpName(e.target.value)} placeholder="Назва операції"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all" />
                  <div className="flex flex-wrap gap-2">
                    {units.map(u => (
                      <button key={u.id} onClick={() => setNewOpUnitId(u.id)}
                        className="rounded-lg px-2.5 py-1.5 text-xs transition-all"
                        style={newOpUnitId === u.id ? { background: '#1e293b', color: '#fff' } : { background: '#f1f5f9', color: '#64748b' }}>
                        {u.shortName}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setNewOpMode(false)} className="flex-1 rounded-xl border border-slate-200 py-2 text-xs text-slate-600">Скасувати</button>
                    <button onClick={handleCreateOperation} disabled={!newOpName.trim() || !newOpUnitId}
                      className="flex-1 rounded-xl bg-slate-800 py-2 text-xs font-medium text-white disabled:opacity-40">
                      Створити і обрати
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6 px-5">
          <button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm text-slate-600">Скасувати</button>
          <button onClick={handleConfirm} disabled={!canConfirm || saving}
            className="flex-1 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition-all">
            {saving ? 'Додавання…' : 'Додати'}
          </button>
        </div>
      </div>
    </div>
  )
}
