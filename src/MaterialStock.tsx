import { useEffect, useState, useRef } from 'react'
import QRCodeLib from 'react-qr-code'
import { useCatalog } from './hooks/useCatalog'
import type { Warehouse, MaterialCategory } from './hooks/useCatalog'
import { useMaterials, useMaterialMutations, type Material } from './hooks/useMaterials'
import { useProducts, useProductStatuses } from './hooks/useProducts'
import {
  useStockMovements, computeBalances, balanceFor, totalFor, useStockMutations,
  type MovementType, type StockMovement,
} from './hooks/useMaterialStock'
import {
  useCustomFieldDefinitions, useCustomFieldValues, useCustomFieldValueMutations,
  type CustomFieldDefinition, type FieldType,
} from './hooks/useCustomFields'

interface Props { onNavigate: (page: string) => void }

type View = { type: 'list' } | { type: 'detail'; materialId: string }

interface CustomFieldInput {
  text: string
  number: string
  boolean: boolean
  optionId: string | null
}

function emptyCustomInput(): CustomFieldInput {
  return { text: '', number: '', boolean: false, optionId: null }
}

const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: 'Текст', number: 'Число', boolean: 'Булеве значення', file: 'Файл(и)', select: 'Список значень',
}

function fmt(n: number) { return Number.isInteger(n) ? n.toString() : n.toFixed(2) }
function dateStr(ts: number) {
  return new Date(ts).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function buildCatPath(id: string | null, all: MaterialCategory[]): string {
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

export default function MaterialStock({ onNavigate: _onNavigate }: Props) {
  const [view, setView] = useState<View>({ type: 'list' })

  const { materialCategories, units, suppliers, warehouses } = useCatalog()
  const materialsQ = useMaterials()
  const { createMaterial, updateMaterial, removeMaterial, archiveMaterial, isSaving } = useMaterialMutations()
  const materials = materialsQ.data ?? []

  const movementsQ = useStockMovements()
  const movements = movementsQ.data ?? []
  const balances = computeBalances(movements)

  const materialFieldsQ = useCustomFieldDefinitions('material')
  const materialFields = materialFieldsQ.data ?? []
  const { setValue: setCustomFieldValue } = useCustomFieldValueMutations('material')

  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filterCatId, setFilterCatId] = useState<string | null>(null)
  const [filterMinStock, setFilterMinStock] = useState('')
  const [filterMaxStock, setFilterMaxStock] = useState('')
  const [sortKey, setSortKey] = useState<'name' | 'stock' | 'date'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const [sheet, setSheet] = useState<{ open: boolean; editing: Material | null }>({ open: false, editing: null })
  const [stockSheet, setStockSheet] = useState<{ mode: MovementType; materialId: string | null } | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Material | null>(null)
  const [qrMaterial, setQrMaterial] = useState<Material | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const showToast = (text: string) => { setToast(text); setTimeout(() => setToast(null), 2200) }

  const lastDelivery = (matId: string) =>
    movements.filter(m => m.materialId === matId && m.type === 'in').sort((a, b) => b.createdAt - a.createdAt)[0]

  const activeFilters = (filterCatId !== null ? 1 : 0) + (filterMinStock ? 1 : 0) + (filterMaxStock ? 1 : 0)
  const archivedCount = materials.filter(m => m.archived).length

  const filtered = materials
    .filter(m => showArchived ? m.archived : !m.archived)
    .filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || (m.code ?? '').toLowerCase().includes(search.toLowerCase()))
    .filter(m => filterCatId === null || m.categoryId === filterCatId)
    .filter(m => {
      const stock = totalFor(balances, m.id)
      if (filterMinStock && stock < parseFloat(filterMinStock)) return false
      if (filterMaxStock && stock > parseFloat(filterMaxStock)) return false
      return true
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name, 'uk')
      if (sortKey === 'stock') cmp = totalFor(balances, a.id) - totalFor(balances, b.id)
      if (sortKey === 'date') cmp = (lastDelivery(a.id)?.createdAt ?? 0) - (lastDelivery(b.id)?.createdAt ?? 0)
      return sortDir === 'asc' ? cmp : -cmp
    })

  const toggleSort = (key: 'name' | 'stock' | 'date') => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const openAdd  = () => setSheet({ open: true, editing: null })
  const openEdit = (m: Material) => setSheet({ open: true, editing: m })
  const closeSheet = () => setSheet(s => ({ ...s, open: false }))

  const saveCustomFieldValues = async (materialId: string, inputs: Record<string, CustomFieldInput>) => {
    for (const def of materialFields) {
      if (def.fieldType === 'file') continue
      const v = inputs[def.id]
      if (!v) continue
      await setCustomFieldValue({
        entityId: materialId,
        fieldDefinitionId: def.id,
        valueText: def.fieldType === 'text' ? (v.text.trim() || null) : null,
        valueNumber: def.fieldType === 'number' ? (v.number ? parseFloat(v.number) : null) : null,
        valueBoolean: def.fieldType === 'boolean' ? v.boolean : null,
        valueOptionId: def.fieldType === 'select' ? v.optionId : null,
      })
    }
  }

  const handleSaveMaterial = async (
    name: string, categoryId: string | null, unitId: string, photoFile: File | null, photoUrl: string | null,
    supplierIds: string[], customInputs: Record<string, CustomFieldInput>,
  ) => {
    let materialId: string
    if (sheet.editing) {
      await updateMaterial({ id: sheet.editing.id, name, categoryId, unitId, photoFile, photoUrl, supplierIds })
      materialId = sheet.editing.id
    } else {
      materialId = await createMaterial({ name, categoryId, unitId, photoFile, supplierIds })
    }
    await saveCustomFieldValues(materialId, customInputs)
    closeSheet()
    showToast('Додано')
  }

  const toastNode = (
    <div className="pointer-events-none fixed top-5 left-1/2 z-50 -translate-x-1/2 transition-all duration-300"
      style={{ opacity: toast ? 1 : 0, transform: `translateX(-50%) translateY(${toast ? 0 : -12}px)` }}>
      <div className="flex items-center gap-2 rounded-2xl bg-slate-800 px-5 py-3 text-sm font-medium text-white shadow-xl">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M2.5 7.5l3.5 3.5 6.5-7" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {toast}
      </div>
    </div>
  )

  const sheetNode = sheet.open && (
    <MaterialForm
      editing={sheet.editing}
      categories={materialCategories}
      units={units}
      suppliers={suppliers}
      fields={materialFields}
      isSaving={isSaving}
      onClose={closeSheet}
      onSave={handleSaveMaterial}
    />
  )

  const stockSheetNode = stockSheet && (
    <StockMovementSheet
      mode={stockSheet.mode}
      initialMaterialId={stockSheet.materialId}
      materials={materials}
      warehouses={warehouses}
      balances={balances}
      onClose={() => setStockSheet(null)}
      onDone={() => { const mode = stockSheet.mode; setStockSheet(null); showToast(mode === 'in' ? 'Додано' : 'Списано') }}
    />
  )

  if (view.type === 'detail') {
    const mat = materials.find(m => m.id === view.materialId)
    if (!mat) { setView({ type: 'list' }); return null }
    return (
      <>
        {toastNode}
        <MaterialDetail
          material={mat}
          categoryPath={buildCatPath(mat.categoryId, materialCategories)}
          suppliers={suppliers.filter(s => mat.supplierIds.includes(s.id))}
          warehouses={warehouses}
          movements={movements.filter(mv => mv.materialId === mat.id)}
          stock={totalFor(balances, mat.id)}
          fields={materialFields}
          onBack={() => setView({ type: 'list' })}
          onEdit={() => openEdit(mat)}
          onAdd={() => setStockSheet({ mode: 'in', materialId: mat.id })}
          onWriteOff={() => setStockSheet({ mode: 'out', materialId: mat.id })}
        />
        {sheetNode}
        {stockSheetNode}
      </>
    )
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {toastNode}

      <div className="px-4 pt-5 pb-3">
        <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl text-slate-800 mb-1">Матеріали</h1>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs text-slate-400">{filtered.length} позицій</p>
          {archivedCount > 0 && (
            <button onClick={() => setShowArchived(v => !v)}
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all"
              style={showArchived ? { background: '#1e293b', color: '#fff' } : { background: '#f1f5f9', color: '#64748b' }}>
              {showArchived ? 'До активних' : `Архів (${archivedCount})`}
            </button>
          )}
        </div>

        <div className="flex gap-2 items-center mb-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input type="search" placeholder="Пошук матеріалу..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
          </div>
          <button onClick={() => setShowFilters(v => !v)}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-all active:scale-90"
            style={showFilters || activeFilters > 0
              ? { background: '#1e293b', border: '1px solid #1e293b', color: 'white' }
              : { background: 'white', border: '1px solid rgba(157,200,255,0.35)', color: '#64748b' }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M1.5 3.5h12M4 7.5h7M6.5 11.5h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            {activeFilters > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-blue-500 text-[9px] font-bold text-white flex items-center justify-center">{activeFilters}</span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="mb-3 rounded-2xl bg-white p-4 space-y-3"
            style={{ border: '1px solid rgba(157,200,255,0.3)', boxShadow: '0 2px 12px rgba(157,200,255,0.1)' }}>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Категорія</label>
              <div className="relative">
                <select value={filterCatId ?? ''} onChange={e => setFilterCatId(e.target.value || null)}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-8 py-2.5 text-sm outline-none focus:border-blue-400 transition-all">
                  <option value="">Всі категорії</option>
                  {materialCategories.map(c => <option key={c.id} value={c.id}>{buildCatPath(c.id, materialCategories)}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M2 3.5l3.5 4 3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">К-сть на складі</label>
              <div className="flex items-center gap-0 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                <div className="flex-1 flex items-center gap-1.5 px-3 py-2.5 border-r border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-400 shrink-0">ВІД</span>
                  <input type="number" value={filterMinStock} onChange={e => setFilterMinStock(e.target.value)}
                    placeholder="0" min="0" className="flex-1 bg-transparent text-sm text-slate-800 outline-none min-w-0 w-0" />
                </div>
                <div className="flex-1 flex items-center gap-1.5 px-3 py-2.5">
                  <span className="text-[10px] font-semibold text-slate-400 shrink-0">ДО</span>
                  <input type="number" value={filterMaxStock} onChange={e => setFilterMaxStock(e.target.value)}
                    placeholder="∞" min="0" className="flex-1 bg-transparent text-sm text-slate-800 outline-none min-w-0 w-0" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Сортування</label>
              <div className="flex gap-1.5 flex-wrap">
                {([['name', 'Назва'], ['stock', 'К-сть'], ['date', 'Поставка']] as [typeof sortKey, string][]).map(([key, label]) => (
                  <button key={key} onClick={() => toggleSort(key)}
                    className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all active:scale-95"
                    style={sortKey === key ? { background: '#1e293b', color: 'white' } : { background: '#f1f5f9', color: '#64748b' }}>
                    {label}
                    {sortKey === key && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: sortDir === 'asc' ? 'none' : 'rotate(180deg)', transition: 'transform 0.2s' }}>
                        <path d="M2 6.5l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {activeFilters > 0 && (
              <button onClick={() => { setFilterCatId(null); setFilterMinStock(''); setFilterMaxStock('') }}
                className="text-xs text-red-400 font-medium hover:text-red-600 transition-colors">
                Скинути фільтри
              </button>
            )}
          </div>
        )}

        {!showArchived && (
          <button onClick={openAdd}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white active:scale-[0.98] transition-all">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
            </svg>
            Новий матеріал
          </button>
        )}
      </div>

      <div className="px-4 space-y-2 pb-8">
        {materialsQ.isLoading || movementsQ.isLoading ? (
          <div className="py-10 text-center text-sm text-slate-400">Завантаження…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white py-12 text-center text-sm text-slate-400"
            style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            {showArchived ? 'Архів порожній' : 'Нічого не знайдено'}
          </div>
        ) : filtered.map(m => {
          const cat = buildCatPath(m.categoryId, materialCategories)
          const stock = totalFor(balances, m.id)
          return (
            <div key={m.id} className="rounded-2xl bg-white"
              style={{ border: '1px solid rgba(157,200,255,0.22)', boxShadow: '0 1px 6px rgba(157,200,255,0.07)' }}>
              <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-slate-50 transition-colors rounded-t-2xl"
                onClick={() => setView({ type: 'detail', materialId: m.id })}>
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
                  {m.code && <p className="text-xs text-slate-400 font-mono mt-0.5">{m.code}</p>}
                  {cat && <p className="text-xs text-blue-400 mt-0.5 truncate">{cat}</p>}
                </div>
                <div className="text-right shrink-0 mr-1">
                  <p className="text-lg font-bold leading-tight" style={{ color: stock > 0 ? '#16a34a' : '#94a3b8' }}>{fmt(stock)}</p>
                  <p className="text-xs text-slate-400">{m.unitShortName}</p>
                </div>
                <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setOpenMenu(openMenu === m.id ? null : m.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 transition-all active:scale-90">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="3" r="1.2" fill="currentColor"/>
                      <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
                      <circle cx="8" cy="13" r="1.2" fill="currentColor"/>
                    </svg>
                  </button>
                  {openMenu === m.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                      <div className="absolute right-0 top-9 z-20 w-48 rounded-2xl bg-white py-1.5"
                        style={{ border: '1px solid rgba(157,200,255,0.3)', boxShadow: '0 8px 32px rgba(15,23,42,0.14)' }}>
                        {showArchived ? (
                          <MenuBtn icon={<ArchiveIcon />} label="Повернути з архіву" onClick={() => { archiveMaterial(m.id, false); setOpenMenu(null) }} />
                        ) : (
                          <>
                            <MenuBtn icon={<PencilIcon />} label="Редагувати" onClick={() => { openEdit(m); setOpenMenu(null) }} />
                            <MenuBtn icon={<QRIcon />} label="Друк QR" onClick={() => { setQrMaterial(m); setOpenMenu(null) }} />
                            <MenuBtn icon={<ArchiveIcon />} label="Архівувати" onClick={() => { archiveMaterial(m.id, true); setOpenMenu(null) }} />
                            <div className="my-1 mx-3 border-t border-slate-100" />
                            <MenuBtn icon={<TrashIcon />} label="Видалити" danger onClick={() => { setConfirmDelete(m); setOpenMenu(null) }} />
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {!showArchived && (
                <div className="flex border-t rounded-b-2xl overflow-hidden" style={{ borderColor: 'rgba(157,200,255,0.2)' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => setStockSheet({ mode: 'in', materialId: m.id })}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-green-600 hover:bg-green-50 transition-all active:scale-[0.97]"
                    style={{ borderRight: '1px solid rgba(157,200,255,0.2)' }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                    Додати
                  </button>
                  <button onClick={() => setStockSheet({ mode: 'out', materialId: m.id })}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50 transition-all active:scale-[0.97]">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                    Списати
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {sheetNode}
      {stockSheetNode}

      {qrMaterial && (
        <MaterialQRModal
          material={qrMaterial}
          categoryPath={buildCatPath(qrMaterial.categoryId, materialCategories)}
          stock={totalFor(balances, qrMaterial.id)}
          onClose={() => setQrMaterial(null)}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-3xl bg-white px-6 py-6"
            style={{ boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <p className="text-base font-semibold text-slate-800 mb-2">Видалити «{confirmDelete.name}»?</p>
            <p className="text-sm text-slate-500 mb-6">Дію неможливо скасувати.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-medium text-slate-500 active:scale-[0.98]">
                Скасувати
              </button>
              <button onClick={() => { removeMaterial(confirmDelete.id); setConfirmDelete(null) }}
                className="flex-1 rounded-2xl bg-red-500 py-3 text-sm font-semibold text-white active:scale-[0.98]">
                Видалити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuBtn({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm transition-all hover:bg-slate-50 active:scale-[0.98]"
      style={{ color: danger ? '#ef4444' : '#374151' }}>
      <span className="shrink-0" style={{ color: danger ? '#ef4444' : '#94a3b8' }}>{icon}</span>
      {label}
    </button>
  )
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
      <path d="M9 2l2 2-7 7H2v-2L9 2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function QRIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
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

function ArchiveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
      <path d="M1.5 3.5h10v2h-10v-2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M2.5 5.5v5.5a1 1 0 001 1h5a1 1 0 001-1V5.5M5.3 8h2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
      <path d="M2 3h9M4 3V2h5v1M5 6v4M8 6v4M3 3l.5 8h6l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════════
   Material QR — друк етикетки
═══════════════════════════════════════════════════════════ */
function MaterialQRModal({ material, categoryPath, stock, onClose }: {
  material: Material
  categoryPath: string
  stock: number
  onClose: () => void
}) {
  const qrValue = [
    `MAT:${material.code ?? material.id}`,
    `NAME:${material.name}`,
    `STOCK:${fmt(stock)} ${material.unitShortName}`,
    categoryPath ? `CAT:${categoryPath}` : null,
  ].filter(Boolean).join('\n')

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    const qrEl = document.getElementById('mat-qr-svg-print')?.querySelector('svg')
    printWindow.document.write(`
      <html><head><title>QR — ${material.name}</title>
      <style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;gap:16px}
      h2{font-size:18px;font-weight:600;color:#1e293b;margin:0}p{font-size:12px;color:#64748b;margin:0;font-family:monospace}</style>
      </head><body>
      ${qrEl?.outerHTML ?? ''}
      <h2>${material.name}</h2>
      ${material.code ? `<p>${material.code}</p>` : ''}
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
          <p style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-slate-800">{material.name}</p>
          {material.code && <p className="text-xs font-mono text-slate-400">{material.code}</p>}
          <div className="rounded-2xl bg-white p-5" id="mat-qr-svg-print" style={{ border: '1px solid rgba(157,200,255,0.3)' }}>
            <QRCodeLib value={qrValue} size={180} />
          </div>
          <p className="text-[10px] text-slate-400 text-center">Скануйте для перегляду картки матеріалу</p>
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

/* ═══════════════════════════════════════════════════════════
   Material Detail — read-only view
═══════════════════════════════════════════════════════════ */
function MaterialDetail({ material, categoryPath, suppliers, warehouses, movements, stock, fields, onBack, onEdit, onAdd, onWriteOff }: {
  material: Material
  categoryPath: string
  suppliers: ReturnType<typeof useCatalog>['suppliers']
  warehouses: ReturnType<typeof useCatalog>['warehouses']
  movements: StockMovement[]
  stock: number
  fields: CustomFieldDefinition[]
  onBack: () => void
  onEdit: () => void
  onAdd: () => void
  onWriteOff: () => void
}) {
  const productsQ = useProducts()
  const products = productsQ.data ?? []
  const usedIn = products.filter(p => p.materials.some(pm => pm.materialId === material.id))

  const valuesQ = useCustomFieldValues('material', material.id)
  const filledFields = fields.filter(def => {
    if (def.fieldType === 'file') return (valuesQ.files[def.id]?.length ?? 0) > 0
    const v = valuesQ.values.find(x => x.fieldDefinitionId === def.id)
    if (!v) return false
    if (def.fieldType === 'text') return !!v.valueText
    if (def.fieldType === 'number') return v.valueNumber !== null
    if (def.fieldType === 'boolean') return v.valueBoolean !== null
    if (def.fieldType === 'select') return !!v.valueOptionId
    return false
  })

  const [openUsedIn, setOpenUsedIn] = useState(false)
  const [openHistory, setOpenHistory] = useState(false)

  const recentMovements = movements.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 8)

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{ background: 'rgba(248,251,255,0.96)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(157,200,255,0.2)' }}>
        <button onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95 transition-all">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="flex-1 text-lg text-slate-800 truncate">{material.name}</h1>
        <button onClick={onEdit}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white active:scale-95 transition-all">
          <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
            <path d="M9 2l2 2-7 7H2v-2L9 2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div className="px-4 pt-5 pb-10 space-y-4">
        <div className="flex items-center gap-4 rounded-3xl bg-white px-5 py-4"
          style={{ border: '1px solid rgba(157,200,255,0.25)', boxShadow: '0 2px 16px rgba(157,200,255,0.1)' }}>
          {material.photo ? (
            <img src={material.photo} alt="" className="h-20 w-20 rounded-2xl object-cover shrink-0" />
          ) : (
            <div className="h-20 w-20 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-amber-300">
                <path d="M14 2L24 7.5V20.5L14 26L4 20.5V7.5L14 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M4 7.5L14 13L24 7.5M14 26V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-slate-800 leading-tight truncate">{material.name}</p>
            {material.code && <p className="font-mono text-sm text-slate-400 mt-0.5">{material.code}</p>}
            {material.archived && (
              <span className="mt-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-600">Архів</span>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onAdd}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-green-600 py-3 text-sm font-semibold text-white active:scale-[0.98] transition-all">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            Додати
          </button>
          <button onClick={onWriteOff}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-red-500 py-3 text-sm font-semibold text-white active:scale-[0.98] transition-all">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 6.5h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            Списати
          </button>
        </div>

        <div className="rounded-2xl bg-white px-4 py-4 flex flex-col gap-1"
          style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">На складі</p>
          <p className="text-2xl font-bold leading-tight" style={{ color: stock > 0 ? '#16a34a' : '#94a3b8' }}>
            {fmt(stock)} <span className="text-sm font-semibold text-slate-400">{material.unitShortName}</span>
          </p>
        </div>

        <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
          {[
            ['Категорія', categoryPath || '—'],
            ['Одиниця', material.unitShortName || '—'],
            ['Постачальники', suppliers.length > 0 ? suppliers.map(s => s.name).join(', ') : '—'],
          ].map((row, i, arr) => (
            <div key={row[0]} className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(157,200,255,0.15)' : 'none' }}>
              <span className="text-xs text-slate-400">{row[0]}</span>
              <span className="text-sm font-medium text-slate-700 text-right max-w-[60%] truncate">{row[1]}</span>
            </div>
          ))}
        </div>

        {filledFields.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Додаткові поля</p>
            <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
              {filledFields.map((def, i) => {
                const v = valuesQ.values.find(x => x.fieldDefinitionId === def.id)
                let display = '—'
                if (def.fieldType === 'text') display = v?.valueText ?? '—'
                if (def.fieldType === 'number') display = v?.valueNumber !== null && v?.valueNumber !== undefined ? String(v.valueNumber) : '—'
                if (def.fieldType === 'boolean') display = v?.valueBoolean ? 'Так' : 'Ні'
                if (def.fieldType === 'select') display = def.options.find(o => o.id === v?.valueOptionId)?.value ?? '—'
                return (
                  <div key={def.id} className="flex items-center justify-between px-4 py-3"
                    style={{ borderBottom: i < filledFields.length - 1 ? '1px solid rgba(157,200,255,0.15)' : 'none' }}>
                    <span className="text-xs text-slate-400">{def.name}</span>
                    {def.fieldType === 'file' ? (
                      <div className="flex flex-col items-end gap-1 max-w-[60%]">
                        {(valuesQ.files[def.id] ?? []).map(f => (
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
          </div>
        )}

        <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
          <button onClick={() => setOpenUsedIn(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">Використовується у продуктах</span>
              {usedIn.length > 0 && <span className="rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold px-1.5 py-0.5">{usedIn.length}</span>}
            </div>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-slate-400 transition-transform duration-200"
              style={{ transform: openUsedIn ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              <path d="M2.5 4.5l4.5 5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {openUsedIn && (
            <div className="border-t" style={{ borderColor: 'rgba(157,200,255,0.2)' }}>
              {usedIn.length === 0 ? (
                <p className="px-4 py-5 text-sm text-slate-400 text-center">Не використовується у жодному продукті</p>
              ) : usedIn.map((p, i) => {
                const usage = p.materials.find(pm => pm.materialId === material.id)!
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3"
                    style={{ borderBottom: i < usedIn.length - 1 ? '1px solid rgba(157,200,255,0.12)' : 'none' }}>
                    {p.photo ? (
                      <img src={p.photo} alt="" className="h-9 w-9 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-slate-400">
                          <rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M4 7h6M4 4.5h6M4 9.5h3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{p.sku}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-blue-600">{fmt(usage.qty)}</p>
                      <p className="text-[10px] text-slate-400">{usage.unitShortName}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {recentMovements.length > 0 && (
          <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
            <button onClick={() => setOpenHistory(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">Останні рухи</span>
                <span className="rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold px-1.5 py-0.5">{recentMovements.length}</span>
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-slate-400 transition-transform duration-200"
                style={{ transform: openHistory ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                <path d="M2.5 4.5l4.5 5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {openHistory && (
              <div className="border-t" style={{ borderColor: 'rgba(157,200,255,0.2)' }}>
                {recentMovements.map((mv, i) => {
                  const isIn = mv.type === 'in'
                  const wh = warehouses.find(w => w.id === mv.warehouseId)
                  return (
                    <div key={mv.id} className="flex items-center gap-3 px-4 py-3"
                      style={{ borderBottom: i < recentMovements.length - 1 ? '1px solid rgba(157,200,255,0.12)' : 'none' }}>
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold shrink-0"
                        style={{ background: isIn ? '#f0fdf4' : '#fef2f2', color: isIn ? '#16a34a' : '#ef4444' }}>
                        {isIn ? '+' : '−'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-600">{dateStr(mv.createdAt)}{wh ? ` · ${wh.name}` : ''}</p>
                        {mv.cost !== null && <p className="text-[10px] text-slate-400">Собівартість: {mv.cost} ₴</p>}
                      </div>
                      <p className="text-sm font-bold shrink-0" style={{ color: isIn ? '#16a34a' : '#ef4444' }}>
                        {isIn ? '+' : '−'}{fmt(mv.qty)}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Material Editor
═══════════════════════════════════════════════════════════ */
function MaterialForm({ editing, categories, units, suppliers, fields, isSaving, onClose, onSave }: {
  editing: Material | null
  categories: ReturnType<typeof useCatalog>['materialCategories']
  units: ReturnType<typeof useCatalog>['units']
  suppliers: ReturnType<typeof useCatalog>['suppliers']
  fields: CustomFieldDefinition[]
  isSaving: boolean
  onClose: () => void
  onSave: (
    name: string, categoryId: string | null, unitId: string, photoFile: File | null, photoUrl: string | null,
    supplierIds: string[], customInputs: Record<string, CustomFieldInput>,
  ) => void | Promise<void>
}) {
  const [name, setName]               = useState(editing?.name ?? '')
  const [categoryId, setCategoryId]   = useState<string | null>(editing?.categoryId ?? null)
  const [unitId, setUnitId]           = useState<string>(editing?.unitId ?? units[0]?.id ?? '')
  const [photoUrl, setPhotoUrl]       = useState<string | null>(editing?.photo ?? null)
  const [photoFile, setPhotoFile]     = useState<File | null>(null)
  const [supplierIds, setSupplierIds] = useState<string[]>(editing?.supplierIds ?? [])
  const [supSearch, setSupSearch]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (files: FileList | null) => {
    const file = files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setPhotoFile(file)
    setPhotoUrl(URL.createObjectURL(file))
  }

  const toggleSupplier = (id: string) =>
    setSupplierIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const filteredSuppliers = suppliers.filter(s => s.name.toLowerCase().includes(supSearch.toLowerCase()))

  const valuesQ = useCustomFieldValues('material', editing?.id ?? null)
  const fieldMutations = useCustomFieldValueMutations('material')
  const [customInputs, setCustomInputs] = useState<Record<string, CustomFieldInput>>({})
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!editing || valuesQ.values.length === 0) return
    setCustomInputs(prev => {
      const next = { ...prev }
      for (const v of valuesQ.values) {
        next[v.fieldDefinitionId] = {
          text: v.valueText ?? '',
          number: v.valueNumber !== null ? String(v.valueNumber) : '',
          boolean: v.valueBoolean ?? false,
          optionId: v.valueOptionId,
        }
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id, valuesQ.values.length])

  const setCustomInput = (fieldId: string, patch: Partial<CustomFieldInput>) =>
    setCustomInputs(prev => ({ ...prev, [fieldId]: { ...emptyCustomInput(), ...prev[fieldId], ...patch } }))

  const handleCustomFile = (def: CustomFieldDefinition, files: FileList | null) => {
    const file = files?.[0]
    if (!file || !editing) return
    fieldMutations.uploadFile({ entityId: editing.id, fieldDefinitionId: def.id, file })
  }

  const canSave = name.trim().length > 0 && unitId.length > 0

  const handleSaveClick = () => {
    const errs: Record<string, string> = {}
    for (const def of fields) {
      if (!def.isRequired || def.fieldType === 'file' || def.fieldType === 'boolean') continue
      const v = customInputs[def.id]
      const empty = def.fieldType === 'select' ? !v?.optionId : def.fieldType === 'number' ? !v?.number : !v?.text.trim()
      if (empty) errs[def.id] = "Обов'язкове поле"
    }
    setCustomErrors(errs)
    if (Object.keys(errs).length > 0) return
    onSave(name.trim(), categoryId, unitId, photoFile, photoUrl, supplierIds, customInputs)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-3xl bg-white pt-2 pb-10 max-h-[92vh] overflow-y-auto sm:rounded-3xl sm:w-full sm:max-w-md">
        <div className="flex justify-center py-3">
          <button onClick={onClose} className="h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
        </div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="px-5 text-2xl text-slate-800 mb-5">
          {editing ? 'Редагувати матеріал' : 'Новий матеріал'}
        </h2>
        <div className="px-5 space-y-5">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-400">Фото</label>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => handleFile(e.target.files)} />
            <div className="flex gap-3 items-center">
              {photoUrl ? (
                <div className="relative h-20 w-20 shrink-0">
                  <img src={photoUrl} alt="" className="h-full w-full rounded-2xl object-cover bg-slate-100" />
                  <button onClick={() => { setPhotoUrl(null); setPhotoFile(null) }}
                    className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-[10px] active:scale-90 transition-all">
                    ✕
                  </button>
                </div>
              ) : (
                <div onClick={() => fileRef.current?.click()}
                  className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl cursor-pointer transition-all active:scale-95"
                  style={{ border: '2px dashed rgba(157,200,255,0.5)', background: 'rgba(157,200,255,0.04)' }}>
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="text-slate-400">
                    <path d="M13 8l-3-3-3 3M10 5v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M4 14v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <span className="text-[10px] text-slate-400">Фото</span>
                </div>
              )}
              <div className="text-xs text-slate-400 leading-relaxed">
                Камера або файл<br/>JPG, PNG, HEIC
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">Назва матеріалу</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Напр. Картон"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-400">Категорія</label>
            {categories.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Додайте категорії у Довідниках</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setCategoryId(null)}
                  className="rounded-xl px-3 py-2 text-xs font-medium border transition-all"
                  style={categoryId === null ? { background: '#1e293b', color: '#fff', borderColor: '#1e293b' } : { background: '#f8fafc', color: '#94a3b8', borderColor: '#e2e8f0' }}>
                  Без категорії
                </button>
                {categories.map(c => {
                  const active = categoryId === c.id
                  return (
                    <button key={c.id} onClick={() => setCategoryId(c.id)}
                      className="rounded-xl px-3 py-2 text-xs font-medium border transition-all"
                      style={active ? { background: c.color, color: '#fff', borderColor: c.color } : { background: c.color + '14', color: c.color, borderColor: 'transparent' }}>
                      {c.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">Одиниця виміру</label>
            {units.length === 0 ? (
              <p className="text-xs text-red-500">Додайте одиниці виміру у Довідниках</p>
            ) : (
              <div className="relative">
                <select value={unitId} onChange={e => setUnitId(e.target.value)}
                  className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
                  {units.map(u => <option key={u.id} value={u.id}>{u.shortName} — {u.name}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-400">
              Постачальники
              {supplierIds.length > 0 && <span className="ml-2 text-blue-500">{supplierIds.length} обрано</span>}
            </label>
            {suppliers.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Додайте постачальників у Довідниках</p>
            ) : (
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
                <div className="relative border-b border-slate-100">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  <input type="text" value={supSearch} onChange={e => setSupSearch(e.target.value)}
                    placeholder="Пошук..." className="w-full py-2.5 pl-9 pr-4 text-sm outline-none bg-white placeholder:text-slate-300" />
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {filteredSuppliers.map((s, i) => {
                    const selected = supplierIds.includes(s.id)
                    return (
                      <button key={s.id} onClick={() => toggleSupplier(s.id)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                        style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(157,200,255,0.1)' }}>
                        <div className="h-4 w-4 shrink-0 rounded-md border-2 flex items-center justify-center transition-all"
                          style={{ borderColor: selected ? '#f59e0b' : '#e2e8f0', background: selected ? '#f59e0b' : 'white' }}>
                          {selected && <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${selected ? 'font-medium text-slate-800' : 'text-slate-600'}`}>{s.name}</p>
                          {s.contactPerson && <p className="text-xs text-slate-400 truncate">{s.contactPerson}</p>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {fields.length > 0 && (
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-400">Додаткові поля</label>
              <div className="space-y-4">
                {fields.map(def => {
                  const v = customInputs[def.id] ?? emptyCustomInput()
                  const error = customErrors[def.id]
                  const files = editing ? (valuesQ.files[def.id] ?? []) : []
                  return (
                    <div key={def.id}>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">
                        {def.name}{def.isRequired && <span className="text-red-400"> *</span>}
                      </label>

                      {def.fieldType === 'text' && (
                        <input type="text" value={v.text} onChange={e => setCustomInput(def.id, { text: e.target.value })}
                          className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-100 transition-all ${error ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white focus:border-blue-400'}`} />
                      )}

                      {def.fieldType === 'number' && (
                        <input type="number" value={v.number} onChange={e => setCustomInput(def.id, { number: e.target.value })}
                          className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-100 transition-all ${error ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white focus:border-blue-400'}`} />
                      )}

                      {def.fieldType === 'boolean' && (
                        <button type="button" onClick={() => setCustomInput(def.id, { boolean: !v.boolean })}
                          className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 w-full">
                          <span className="text-sm text-slate-600">{v.boolean ? 'Так' : 'Ні'}</span>
                          <span className="relative h-6 w-11 rounded-full transition-all shrink-0"
                            style={{ background: v.boolean ? '#3b82f6' : '#e2e8f0' }}>
                            <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
                              style={{ left: v.boolean ? '1.375rem' : '0.125rem' }} />
                          </span>
                        </button>
                      )}

                      {def.fieldType === 'select' && (
                        <div className="relative">
                          <select value={v.optionId ?? ''} onChange={e => setCustomInput(def.id, { optionId: e.target.value || null })}
                            className={`w-full appearance-none rounded-2xl border px-4 pr-10 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-100 transition-all ${error ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white focus:border-blue-400'}`}>
                            <option value="">— Оберіть —</option>
                            {def.options.map(o => <option key={o.id} value={o.id}>{o.value}</option>)}
                          </select>
                          <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}

                      {def.fieldType === 'file' && (
                        editing ? (
                          <div className="space-y-2">
                            {files.map(f => (
                              <a key={f.id} href={f.url} target="_blank" rel="noreferrer"
                                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-blue-600 truncate">
                                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="shrink-0 text-slate-400">
                                  <path d="M2 11V3a1 1 0 011-1h5l3 3v6a1 1 0 01-1 1H3a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.3"/>
                                </svg>
                                <span className="truncate">{f.filename}</span>
                              </a>
                            ))}
                            <label className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-xs text-slate-500 cursor-pointer hover:border-blue-300 transition-all">
                              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="text-slate-400">
                                <path d="M9 5l-3-3-3 3M6 2v8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              Завантажити файл
                              <input type="file" className="hidden" onChange={e => handleCustomFile(def, e.target.files)} />
                            </label>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Доступно після збереження матеріалу</p>
                        )
                      )}

                      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
                      {!error && def.fieldType !== 'file' && (
                        <p className="mt-1 text-[10px] text-slate-300">{FIELD_TYPE_LABEL[def.fieldType]}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6 px-5">
          <button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm text-slate-600">Скасувати</button>
          <button onClick={handleSaveClick} disabled={!canSave || isSaving}
            className="flex-1 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition-all">
            {isSaving ? 'Збереження…' : editing ? 'Зберегти' : 'Додати'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────
   Прихід / списання: матеріал → склад → (продукт, якщо списання) → кількість
─────────────────────────────────────────────────────────── */

function StockMovementSheet({ mode, initialMaterialId, materials, warehouses, balances, onClose, onDone }: {
  mode: MovementType
  initialMaterialId: string | null
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
  const [materialId, setMaterialId] = useState<string | null>(initialMaterialId)
  const [warehouseId, setWarehouseId] = useState<string | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [productId, setProductId] = useState<string | null>(null)
  const [qty, setQty] = useState('')
  const [cost, setCost] = useState('')

  const selectedMaterial = materialId ? materials.find(m => m.id === materialId) ?? null : null
  const filteredMaterials = materials.filter(m => m.name.toLowerCase().includes(materialSearch.toLowerCase()))
  const currentBalance = materialId && warehouseId ? balanceFor(balances, materialId, warehouseId) : 0

  const selectedProduct = productId ? products.find(p => p.id === productId) ?? null : null
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku.toLowerCase().includes(productSearch.toLowerCase()))

  const qtyNum = Number(qty)
  const canConfirm = materialId !== null && warehouseId !== null && qty.trim() !== '' && qtyNum > 0 &&
    (mode === 'in' || (qtyNum <= currentBalance && productId !== null))

  const costNum = cost.trim() === '' ? null : Number(cost)

  const handleConfirm = async () => {
    if (!canConfirm || !materialId || !warehouseId) return
    if (mode === 'in') await addStock({ materialId, warehouseId, qty: qtyNum, cost: costNum })
    else if (productId) await writeOffStock({ materialId, warehouseId, qty: qtyNum, productId })
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-3xl bg-white pt-2 pb-10 max-h-[92vh] overflow-y-auto sm:rounded-3xl sm:w-full sm:max-w-md">
        <div className="flex justify-center py-3">
          <button onClick={onClose} className="h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
        </div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="px-5 text-2xl text-slate-800 mb-4">
          {mode === 'in' ? 'Прихід матеріалу' : 'Списання матеріалу'}
        </h2>

        <div className="px-5 space-y-5">
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

          {mode === 'in' && selectedMaterial && warehouseId && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                Вартість, ₴ <span className="normal-case text-slate-400 font-normal">(необов'язково)</span>
              </label>
              <input type="number" min="0" step="any" value={cost} onChange={e => setCost(e.target.value)} placeholder="0"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
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
