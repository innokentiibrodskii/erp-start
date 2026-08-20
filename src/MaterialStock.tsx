import { useState } from 'react'
import QRCodeLib from 'react-qr-code'
import { useCatalog } from './hooks/useCatalog'
import type { Warehouse } from './hooks/useCatalog'
import { useMaterials, useMaterialMutations, type Material } from './hooks/useMaterials'
import { useProducts, useProductStatuses } from './hooks/useProducts'
import {
  useStockMovements, computeBalances, balanceFor, totalFor, useStockMutations,
  type MovementType, type StockMovement,
} from './hooks/useMaterialStock'
import {
  useCustomFieldDefinitions, useCustomFieldValues, useCustomFieldValueMutations,
  type CustomFieldDefinition,
} from './hooks/useCustomFields'
import { fmt, dateStr, buildCatPath, genBatchCode, genSeries } from './lib/materialFormat'
import MaterialEditorPage, { type PendingDelivery, type CustomFieldInput } from './MaterialEditorPage'
import { CategoryTreeNode } from './CategoryTreeNode'
import { useLocale } from './LocaleContext'

interface Props { onNavigate: (page: string) => void; initialMaterialId?: string | null }

type View =
  | { type: 'list' }
  | { type: 'detail'; materialId: string }
  | { type: 'stock'; materialId: string; mode: MovementType }
  | { type: 'qr'; materialId: string }
  | { type: 'edit'; materialId: string | null }

export default function MaterialStock({ onNavigate: _onNavigate, initialMaterialId }: Props) {
  const [view, setView] = useState<View>(initialMaterialId ? { type: 'detail', materialId: initialMaterialId } : { type: 'list' })
  const { t, tn } = useLocale()

  const { materialCategories, units, suppliers, warehouses } = useCatalog()
  const materialsQ = useMaterials()
  const { createMaterial, updateMaterial, removeMaterial, archiveMaterial, isSaving } = useMaterialMutations()
  const { addStock } = useStockMutations()
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
  // Уся секція "Категорія" згорнута в один рядок (як звичайний select) за замовчуванням —
  // дерево розгортається лише по кліку на шеврон, щоб не займати місце над іншими полями.
  const [catSectionOpen, setCatSectionOpen] = useState(false)
  const [expandedFilterCats, setExpandedFilterCats] = useState<string[]>([])
  const toggleExpandFilterCat = (id: string) =>
    setExpandedFilterCats(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  const filterCat = filterCatId === null ? null : materialCategories.find(c => c.id === filterCatId) ?? null
  const selectedCatLabel = filterCat ? tn(filterCat.name, filterCat.nameEn) : t('common.allCategories')
  const [filterMinStock, setFilterMinStock] = useState('')
  const [filterMaxStock, setFilterMaxStock] = useState('')
  const [sortKey, setSortKey] = useState<'name' | 'stock' | 'date'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Material | null>(null)
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

  const openAdd  = () => setView({ type: 'edit', materialId: null })
  const openEdit = (m: Material) => setView({ type: 'edit', materialId: m.id })

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

  if (view.type === 'edit') {
    const editing = view.materialId ? materials.find(m => m.id === view.materialId) ?? null : null
    const nextBatchSeq = movements.filter(m => m.type === 'in').length + 1
    const materialDeliveries = editing ? movements.filter(mv => mv.materialId === editing.id) : []

    const handleSaveMaterial = async (args: {
      name: string; nameEn: string | null; code: string; categoryId: string | null; unitId: string; cost: number | null
      photoFile: File | null; photoUrl: string | null
      primarySupplierId: string | null; supplierIds: string[]
      customInputs: Record<string, CustomFieldInput>
      pendingDeliveries: PendingDelivery[]
    }) => {
      let materialId: string
      if (editing) {
        await updateMaterial({
          id: editing.id, name: args.name, nameEn: args.nameEn, categoryId: args.categoryId, unitId: args.unitId, cost: args.cost,
          photoFile: args.photoFile, photoUrl: args.photoUrl,
          primarySupplierId: args.primarySupplierId, supplierIds: args.supplierIds,
        })
        materialId = editing.id
      } else {
        materialId = await createMaterial({
          name: args.name, nameEn: args.nameEn, code: args.code, categoryId: args.categoryId, unitId: args.unitId, cost: args.cost, photoFile: args.photoFile,
          primarySupplierId: args.primarySupplierId, supplierIds: args.supplierIds,
        })
        for (const d of args.pendingDeliveries) {
          if (!d.warehouseId) continue
          await addStock({ materialId, warehouseId: d.warehouseId, qty: d.qty, cost: d.cost, batchCode: d.batchCode, note: d.note, series: d.series })
        }
      }
      await saveCustomFieldValues(materialId, args.customInputs)
      setView({ type: 'list' })
      showToast(editing ? t('materials.toastSaved') : t('materials.toastAdded'))
    }

    return (
      <>
        {toastNode}
        <MaterialEditorPage
          editing={editing}
          categories={materialCategories}
          units={units}
          suppliers={suppliers}
          fields={materialFields}
          warehouses={warehouses}
          materials={materials}
          deliveries={materialDeliveries}
          nextBatchSeq={nextBatchSeq}
          isSaving={isSaving}
          onBack={() => setView({ type: 'list' })}
          onSave={handleSaveMaterial}
        />
      </>
    )
  }

  if (view.type === 'stock') {
    const mat = materials.find(m => m.id === view.materialId)
    if (!mat) { setView({ type: 'list' }); return null }
    const nextBatchSeq = movements.filter(m => m.type === 'in').length + 1
    return (
      <>
        {toastNode}
        <StockActionPage
          material={mat}
          initialMode={view.mode}
          warehouses={warehouses}
          balances={balances}
          nextBatchSeq={nextBatchSeq}
          onBack={() => setView({ type: 'list' })}
          onDone={mode => { setView({ type: 'list' }); showToast(mode === 'in' ? t('materials.toastAdded') : t('materials.toastWrittenOff')) }}
        />
      </>
    )
  }

  if (view.type === 'qr') {
    const mat = materials.find(m => m.id === view.materialId)
    if (!mat) { setView({ type: 'list' }); return null }
    return (
      <MaterialQRPage
        material={mat}
        categoryPath={buildCatPath(mat.categoryId, materialCategories, tn)}
        stock={totalFor(balances, mat.id)}
        onBack={() => setView({ type: 'list' })}
      />
    )
  }

  if (view.type === 'detail') {
    const mat = materials.find(m => m.id === view.materialId)
    if (!mat) {
      if (!materialsQ.isLoading) setView({ type: 'list' })
      return null
    }
    return (
      <>
        {toastNode}
        <MaterialDetail
          material={mat}
          categoryPath={buildCatPath(mat.categoryId, materialCategories, tn)}
          suppliers={suppliers.filter(s => mat.supplierIds.includes(s.id))}
          warehouses={warehouses}
          movements={movements.filter(mv => mv.materialId === mat.id)}
          stock={totalFor(balances, mat.id)}
          fields={materialFields}
          onBack={() => setView({ type: 'list' })}
        />
      </>
    )
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {toastNode}

      <div className="px-4 pt-5 pb-3">
        <div className="flex items-start justify-between mb-1">
          <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl text-slate-800">{t('nav.materials')}</h1>
          {!showArchived && (
            <button onClick={openAdd}
              className="flex items-center gap-1.5 rounded-2xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white active:scale-95 transition-all shrink-0 mt-1">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              {t('common.new')}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs text-slate-400">{filtered.length} {t('products.items')}</p>
          {archivedCount > 0 && (
            <button onClick={() => setShowArchived(v => !v)}
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all"
              style={showArchived ? { background: '#1e293b', color: '#fff' } : { background: '#f1f5f9', color: '#64748b' }}>
              {showArchived ? t('materials.toActive') : t('materials.archiveWithCount', { count: archivedCount })}
            </button>
          )}
        </div>

        <div className="flex gap-2 items-center mb-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input type="search" placeholder={t('materials.search')} value={search} onChange={e => setSearch(e.target.value)}
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
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{t('filters.category')}</label>

              {!catSectionOpen ? (
                // Згорнутий вигляд — звичайний select, як інші фільтри нижче
                <button onClick={() => setCatSectionOpen(true)}
                  className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-2.5 py-2.5 text-sm text-left transition-all active:scale-[0.99]">
                  <span className="text-slate-800">{selectedCatLabel}</span>
                  <svg className="text-slate-400 shrink-0" width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M2 3.5l3.5 4 3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ) : (
                <div className="space-y-1.5">
                  <div className="w-full flex items-center gap-1 rounded-2xl overflow-hidden"
                    style={filterCatId === null
                      ? { background: '#1e293b', border: '1px solid #1e293b' }
                      : { background: '#f8fafc', border: '1px solid rgba(157,200,255,0.25)' }}>
                    <button onClick={() => setFilterCatId(null)} className="flex-1 flex items-center gap-3 px-4 py-2.5 text-left">
                      <div className="h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: filterCatId === null ? 'white' : '#cbd5e1' }}>
                        {filterCatId === null && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>
                      <span className="text-sm font-medium" style={{ color: filterCatId === null ? 'white' : '#1e293b' }}>{t('common.allCategories')}</span>
                    </button>
                    {/* Шеврон згортає всю секцію "Категорія" назад у компактний select */}
                    <button onClick={() => setCatSectionOpen(false)} className="flex h-9 w-9 items-center justify-center shrink-0"
                      style={{ color: filterCatId === null ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ transform: 'rotate(180deg)' }}>
                        <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                  {materialCategories.filter(c => c.parentId === null).map(cat => (
                    <CategoryTreeNode key={cat.id} cat={cat} depth={0} allCats={materialCategories} selectedId={filterCatId}
                      expandedIds={expandedFilterCats} onSelect={setFilterCatId} onToggleExpand={toggleExpandFilterCat} />
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{t('materials.filterStockLabel')}</label>
              <div className="flex items-center gap-0 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                <div className="flex-1 flex items-center gap-1.5 px-3 py-2.5 border-r border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-400 shrink-0">{t('common.from')}</span>
                  <input type="number" value={filterMinStock} onChange={e => setFilterMinStock(e.target.value)}
                    placeholder="0" min="0" className="flex-1 bg-transparent text-sm text-slate-800 outline-none min-w-0 w-0" />
                </div>
                <div className="flex-1 flex items-center gap-1.5 px-3 py-2.5">
                  <span className="text-[10px] font-semibold text-slate-400 shrink-0">{t('common.to')}</span>
                  <input type="number" value={filterMaxStock} onChange={e => setFilterMaxStock(e.target.value)}
                    placeholder="∞" min="0" className="flex-1 bg-transparent text-sm text-slate-800 outline-none min-w-0 w-0" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{t('filters.sort')}</label>
              <div className="flex gap-1.5 flex-wrap">
                {([['name', t('materials.sortByName')], ['stock', t('materials.sortByStock')], ['date', t('materials.sortByDelivery')]] as [typeof sortKey, string][]).map(([key, label]) => (
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
                {t('filters.reset')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="px-4 space-y-2 pb-8">
        {materialsQ.isLoading || movementsQ.isLoading ? (
          <div className="py-10 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white py-12 text-center text-sm text-slate-400"
            style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            {showArchived ? t('materials.archiveEmpty') : t('common.notFound')}
          </div>
        ) : filtered.map(m => {
          const cat = buildCatPath(m.categoryId, materialCategories, tn)
          const stock = totalFor(balances, m.id)
          return (
            <div key={m.id} className="rounded-2xl bg-white"
              style={{ border: '1px solid rgba(157,200,255,0.22)', boxShadow: '0 1px 6px rgba(157,200,255,0.07)' }}>
              <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-slate-50 transition-colors rounded-t-2xl"
                onClick={() => setView({ type: 'detail', materialId: m.id })}>
                <div className="h-12 w-12 shrink-0 rounded-xl overflow-hidden bg-amber-50 flex items-center justify-center text-amber-400">
                  {m.photo
                    ? <img src={m.photo} alt={tn(m.name, m.nameEn)} className="h-full w-full object-cover" />
                    : <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                        <path d="M2 4.5L8 8L14 4.5M8 15V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{tn(m.name, m.nameEn)}</p>
                  {m.code && <p className="text-xs text-slate-400 font-mono mt-0.5">{m.code}</p>}
                  {cat && <p className="text-xs text-blue-400 mt-0.5 truncate">{cat}</p>}
                </div>
                <div className="text-right shrink-0 mr-1">
                  <p className="text-lg font-bold leading-tight" style={{ color: stock > 0 ? '#16a34a' : '#94a3b8' }}>{fmt(stock)}</p>
                  <p className="text-xs text-slate-400">{tn(m.unitShortName, m.unitShortNameEn)}</p>
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
                          <MenuBtn icon={<ArchiveIcon />} label={t('materials.returnFromArchive')} onClick={() => { archiveMaterial(m.id, false); setOpenMenu(null) }} />
                        ) : (
                          <>
                            <MenuBtn icon={<PencilIcon />} label={t('common.edit')} onClick={() => { openEdit(m); setOpenMenu(null) }} />
                            <MenuBtn icon={<QRIcon />} label={t('products.printQr')} onClick={() => { setView({ type: 'qr', materialId: m.id }); setOpenMenu(null) }} />
                            <MenuBtn icon={<ArchiveIcon />} label={t('materials.archive')} onClick={() => { archiveMaterial(m.id, true); setOpenMenu(null) }} />
                            <div className="my-1 mx-3 border-t border-slate-100" />
                            <MenuBtn icon={<TrashIcon />} label={t('common.delete')} danger onClick={() => { setConfirmDelete(m); setOpenMenu(null) }} />
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {!showArchived && (
                <div className="flex border-t rounded-b-2xl overflow-hidden" style={{ borderColor: 'rgba(157,200,255,0.2)' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => setView({ type: 'stock', materialId: m.id, mode: 'in' })}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-green-600 hover:bg-green-50 transition-all active:scale-[0.97]"
                    style={{ borderRight: '1px solid rgba(157,200,255,0.2)' }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                    {t('common.add')}
                  </button>
                  <button onClick={() => setView({ type: 'stock', materialId: m.id, mode: 'out' })}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50 transition-all active:scale-[0.97]">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                    {t('materials.writeOff')}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-3xl bg-white px-6 py-6"
            style={{ boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <p className="text-base font-semibold text-slate-800 mb-2">{t('materials.deleteConfirm', { name: tn(confirmDelete.name, confirmDelete.nameEn) })}</p>
            <p className="text-sm text-slate-500 mb-6">{t('common.actionIrreversible')}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-medium text-slate-500 active:scale-[0.98]">
                {t('common.cancel')}
              </button>
              <button onClick={() => { removeMaterial(confirmDelete.id); setConfirmDelete(null) }}
                className="flex-1 rounded-2xl bg-red-500 py-3 text-sm font-semibold text-white active:scale-[0.98]">
                {t('common.delete')}
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

/** Прокладає шлях заокругленого прямокутника вручну (замість `ctx.roundRect`),
 *  щоб коректно працювати і в старіших вбудованих браузерах застосунків
 *  Bluetooth-термопринтерів. */
function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/* ═══════════════════════════════════════════════════════════
   Material QR — сторінка друку етикетки
═══════════════════════════════════════════════════════════ */
function MaterialQRPage({ material, categoryPath, stock, onBack }: {
  material: Material
  categoryPath: string
  stock: number
  onBack: () => void
}) {
  const { t, tn } = useLocale()
  // QR веде на сторінку перегляду матеріалу в застосунку — сканування відкриває картку.
  const qrValue = `${window.location.origin}/?material=${material.id}`

  const DPI = 203
  const mm = (v: number) => Math.round((v * DPI) / 25.4)
  const LABEL_W = mm(40)
  const LABEL_H = mm(58)

  /** Малює етикетку (40×58мм при 203 dpi) на canvas — за макетом з Figma
   *  (назва → код → QR у білій картці із заокругленими кутами й тонкою рамкою).
   *  Використовується і для збереження PNG, і для друку, щоб обидва виходи
   *  мали однаковий розмір і вигляд. */
  const buildLabelCanvas = async (): Promise<HTMLCanvasElement> => {
    const svgEl = document.getElementById('mat-qr-svg')
    if (!svgEl) throw new Error('QR не знайдено')

    // Дочекатись завантаження шрифтів застосунку (DM Serif Display / DM Sans),
    // інакше canvas може намалювати текст системним шрифтом за замовчуванням.
    await document.fonts.ready

    const svgData = new XMLSerializer().serializeToString(svgEl)
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Не вдалося завантажити QR'))
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`
    })

    const canvas = document.createElement('canvas')
    canvas.width = LABEL_W
    canvas.height = LABEL_H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas недоступний')

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, LABEL_W, LABEL_H)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    const maxWidth = LABEL_W - mm(6)
    let y = mm(8.5)

    // Назва — DM Serif Display, той самий стиль заголовків, що й у застосунку
    ctx.font = `${mm(3.4)}px 'DM Serif Display', serif`
    ctx.fillStyle = '#1d293d'
    const words = tn(material.name, material.nameEn).split(' ')
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w
      if (cur && ctx.measureText(test).width > maxWidth) { lines.push(cur); cur = w } else cur = test
    }
    if (cur) lines.push(cur)
    for (const line of lines.slice(0, 2)) { ctx.fillText(line, LABEL_W / 2, y); y += mm(4.2) }

    // Код — DM Sans
    if (material.code) {
      y += mm(0.8)
      ctx.font = `${mm(2.3)}px 'DM Sans', sans-serif`
      ctx.fillStyle = '#1d293d'
      ctx.fillText(material.code, LABEL_W / 2, y)
      y += mm(5)
    } else {
      y += mm(2)
    }

    // QR — у білій картці із заокругленими кутами й тонкою рамкою (як у Figma-шаблоні)
    const boxSize = Math.min(LABEL_W - mm(6), LABEL_H - y - mm(3))
    const boxX = (LABEL_W - boxSize) / 2
    const boxY = y
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = 'rgba(157,200,255,0.6)'
    ctx.lineWidth = Math.max(1, mm(0.08))
    drawRoundedRect(ctx, boxX, boxY, boxSize, boxSize, mm(2))
    ctx.fill()
    ctx.stroke()

    const qrPadding = mm(2.5)
    const qrSize = boxSize - qrPadding * 2
    ctx.drawImage(img, boxX + qrPadding, boxY + qrPadding, qrSize, qrSize)

    return canvas
  }

  /** Друк через діалог браузера — та ж сама картинка, що й у збереженому PNG,
   *  тож фізичний розмір етикетки завжди однаковий. */
  const handlePrint = async () => {
    const canvas = await buildLabelCanvas().catch(() => null)
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    const win = window.open('', '_blank', 'width=400,height=320')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>QR — ${tn(material.name, material.nameEn)}</title>
    <style>
      @page{size:40mm 58mm;margin:0}
      *{margin:0;padding:0}
      html,body{width:40mm;height:58mm}
      img{width:40mm;height:58mm;display:block}
    </style></head><body>
    <img src="${dataUrl}" alt="QR label" />
    <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}<\/script>
    </body></html>`)
    win.document.close()
  }

  /** Готовий PNG-файл точного розміру етикетки (40×58мм при 203 dpi — стандарт
   *  мобільних Bluetooth-принтерів) — для друку через застосунки типу Mobi Print,
   *  куди файл передається напряму (не через діалог друку браузера). */
  const handleDownloadImage = async () => {
    const canvas = await buildLabelCanvas().catch(() => null)
    if (!canvas) return
    canvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `qr-${material.code ?? material.id}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@media print { body > * { display: none !important; } }`}</style>

      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{ background: 'rgba(248,251,255,0.96)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(157,200,255,0.2)' }}>
        <button onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95 transition-all">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="flex-1 text-lg text-slate-800">{t('materials.qrLabelTitle')}</h1>
        <button onClick={handleDownloadImage}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 active:scale-95 transition-all">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1v7.5M3.5 6l3 3 3-3M2 11.5h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          PNG
        </button>
        <button onClick={handlePrint}
          className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-white active:scale-95 transition-all">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M3 5V1.5h7V5M3 9.5H1.5V5h10v4.5H10M3 7.5h7v4H3v-4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
          {t('materials.printPdf')}
        </button>
      </div>

      <div className="flex flex-col items-center px-6 pt-8 pb-12">
        {/* Прев'ю етикетки — назва / код / QR, точно як буде надруковано (40×58мм) */}
        <div className="w-full max-w-xs rounded-3xl bg-white px-6 py-7 flex flex-col items-center gap-4"
          style={{ border: '1.5px solid rgba(157,200,255,0.35)', boxShadow: '0 4px 32px rgba(157,200,255,0.15)' }}>
          <div className="text-center">
            <p style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-slate-800 leading-snug">{tn(material.name, material.nameEn)}</p>
            {material.code && (
              <p className="mt-1 text-xs text-slate-500">{material.code}</p>
            )}
          </div>

          <div className="rounded-2xl bg-white p-4"
            style={{ border: '1px solid rgba(157,200,255,0.25)', boxShadow: '0 2px 12px rgba(157,200,255,0.1)' }}>
            <QRCodeLib id="mat-qr-svg" value={qrValue} size={180} />
          </div>
        </div>

        {/* Додаткова інформація — довідково в застосунку, на етикетку не друкується */}
        <div className="w-full max-w-xs mt-4 rounded-2xl bg-white px-5 py-4 space-y-2.5"
          style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('materials.inStock')}</span>
            <span className="text-2xl font-bold" style={{ color: stock > 0 ? '#16a34a' : '#94a3b8' }}>
              {fmt(stock)} <span className="text-sm font-semibold text-slate-400">{tn(material.unitShortName, material.unitShortNameEn)}</span>
            </span>
          </div>
          {categoryPath && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('filters.category')}</span>
              <span className="text-xs font-medium text-slate-700 text-right max-w-[55%] truncate">{categoryPath}</span>
            </div>
          )}
        </div>

        <p className="mt-5 text-xs text-slate-400 text-center">{t('materials.qrPrintHint')}</p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Material Detail — read-only view
═══════════════════════════════════════════════════════════ */
function MaterialDetail({ material, categoryPath, suppliers, warehouses, movements, stock, fields, onBack }: {
  material: Material
  categoryPath: string
  suppliers: ReturnType<typeof useCatalog>['suppliers']
  warehouses: ReturnType<typeof useCatalog>['warehouses']
  movements: StockMovement[]
  stock: number
  fields: CustomFieldDefinition[]
  onBack: () => void
}) {
  const { t, tn } = useLocale()
  const productsQ = useProducts()
  const products = productsQ.data ?? []
  const usedIn = products.filter(p => p.materials.some(pm => pm.materialId === material.id))

  const lastDelivery = movements.filter(m => m.type === 'in').sort((a, b) => b.createdAt - a.createdAt)[0]

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
        <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="flex-1 text-lg text-slate-800 truncate">{tn(material.name, material.nameEn)}</h1>
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
            <p style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-slate-800 leading-tight truncate">{tn(material.name, material.nameEn)}</p>
            {material.code && <p className="font-mono text-sm text-slate-400 mt-0.5">{material.code}</p>}
            {material.archived && (
              <span className="mt-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-600">{t('materials.archived')}</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white px-4 py-4 flex flex-col gap-1"
            style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('materials.inStock')}</p>
            <p className="text-2xl font-bold leading-tight" style={{ color: stock > 0 ? '#16a34a' : '#94a3b8' }}>
              {fmt(stock)}
            </p>
            <p className="text-xs text-slate-400">{tn(material.unitShortName, material.unitShortNameEn)}</p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-4 flex flex-col gap-1"
            style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('materials.lastDelivery')}</p>
            {lastDelivery ? (
              <>
                <p className="text-base font-bold text-slate-800 leading-tight">+{fmt(lastDelivery.qty)}</p>
                <p className="text-xs text-slate-400">{dateStr(lastDelivery.createdAt)}</p>
              </>
            ) : (
              <p className="text-sm text-slate-300 mt-1">—</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
          {[
            [t('filters.category'), categoryPath || '—'],
            [t('materials.unit'), tn(material.unitShortName, material.unitShortNameEn) || '—'],
            [t('materials.suppliers'), suppliers.length > 0 ? suppliers.map(s => tn(s.name, s.nameEn)).join(', ') : '—'],
            ...(lastDelivery?.cost ? [[t('materials.pricePerUnit'), `${lastDelivery.cost} ₴`]] : []),
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
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('materials.customFields')}</p>
            <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
              {filledFields.map((def, i) => {
                const v = valuesQ.values.find(x => x.fieldDefinitionId === def.id)
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
                    style={{ borderBottom: i < filledFields.length - 1 ? '1px solid rgba(157,200,255,0.15)' : 'none' }}>
                    <span className="text-xs text-slate-400">{tn(def.name, def.nameEn)}</span>
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
              <span className="text-sm font-semibold text-slate-700">{t('materials.usedInProducts')}</span>
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
                <p className="px-4 py-5 text-sm text-slate-400 text-center">{t('materials.notUsedInProducts')}</p>
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
                <span className="text-sm font-semibold text-slate-700">{t('materials.recentMovements')}</span>
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
                        <p className="text-xs text-slate-600">{dateStr(mv.createdAt)}{wh ? ` · ${tn(wh.name, wh.nameEn)}` : ''}</p>
                        {mv.batchCode && <p className="text-[10px] font-mono text-slate-400">{mv.batchCode}</p>}
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

/* ───────────────────────────────────────────────────────────
   Прихід (з партією/серіями) / списання (з прив'язкою до продукту)
─────────────────────────────────────────────────────────── */

function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="flex items-center rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button type="button" onClick={() => onChange(Math.max(min, +(value - 1).toFixed(2)))}
        className="px-4 py-3.5 text-slate-500 hover:bg-slate-50 text-xl leading-none active:scale-90 transition-all">−</button>
      <input type="number" value={value} min={min} step="any"
        onChange={e => onChange(Math.max(min, parseFloat(e.target.value) || 0))}
        className="flex-1 bg-transparent text-center text-lg font-bold text-slate-800 outline-none" />
      <button type="button" onClick={() => onChange(+(value + 1).toFixed(2))}
        className="px-4 py-3.5 text-slate-500 hover:bg-slate-50 text-xl leading-none active:scale-90 transition-all">+</button>
    </div>
  )
}

function StockActionPage({ material, initialMode, warehouses, balances, nextBatchSeq, onBack, onDone }: {
  material: Material
  initialMode: MovementType
  warehouses: Warehouse[]
  balances: ReturnType<typeof computeBalances>
  nextBatchSeq: number
  onBack: () => void
  onDone: (mode: MovementType) => void
}) {
  const { t, tn } = useLocale()
  const productsQ = useProducts()
  const statusesQ = useProductStatuses()
  const activeStatusId = statusesQ.data?.find(s => s.code === 'active')?.id ?? null
  const products = (productsQ.data ?? []).filter(p => activeStatusId === null || p.statusId === activeStatusId)
  const { addStock, writeOffStock, isSaving } = useStockMutations()

  const [mode, setMode] = useState<MovementType>(initialMode)
  const stock = totalFor(balances, material.id)
  const [warehouseId, setWarehouseId] = useState<string | null>(warehouses[0]?.id ?? null)
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')

  // Прихід
  const batchCode = genBatchCode(nextBatchSeq)
  const [cost, setCost] = useState('')
  const [seriesCount, setSeriesCount] = useState(0)
  const [seriesItems, setSeriesItems] = useState<{ code: string; qty: number }[]>([])

  const applySeriesCount = (count: number, totalQty: number) => setSeriesItems(genSeries(batchCode, count, totalQty))
  const updateSeriesQty = (i: number, v: number) => setSeriesItems(p => p.map((s, j) => j === i ? { ...s, qty: v } : s))

  // Списання
  const [productId, setProductId] = useState<string | null>(null)

  const currentBalance = warehouseId ? balanceFor(balances, material.id, warehouseId) : 0
  const canConfirm = warehouseId !== null && qty > 0 &&
    (mode === 'in' || (qty <= currentBalance && productId !== null))

  const handleConfirm = async () => {
    if (!canConfirm || !warehouseId) return
    if (mode === 'in') {
      await addStock({
        materialId: material.id, warehouseId, qty, cost: cost.trim() === '' ? null : Number(cost),
        batchCode, note: note.trim() || null, series: seriesItems,
      })
    } else if (productId) {
      await writeOffStock({ materialId: material.id, warehouseId, qty, productId, note: note.trim() || null })
    }
    onDone(mode)
  }

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
        <div className="flex-1 min-w-0">
          <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-lg text-slate-800 truncate">{tn(material.name, material.nameEn)}</h1>
          {material.code && <p className="text-xs text-slate-400 font-mono">{material.code}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold" style={{ color: stock > 0 ? '#16a34a' : '#94a3b8' }}>{fmt(stock)} {tn(material.unitShortName, material.unitShortNameEn)}</p>
          <p className="text-[10px] text-slate-400">{t('materials.inStock').toLowerCase()}</p>
        </div>
      </div>

      <div className="px-4 pt-5 pb-12 space-y-5">
        <div className="flex rounded-2xl bg-slate-100 p-1 gap-1">
          <button onClick={() => setMode('in')}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all"
            style={mode === 'in' ? { background: 'white', color: '#16a34a', boxShadow: '0 1px 6px rgba(0,0,60,0.08)' } : { color: '#94a3b8' }}>
            {t('materials.addShort')}
          </button>
          <button onClick={() => setMode('out')}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all"
            style={mode === 'out' ? { background: 'white', color: '#ef4444', boxShadow: '0 1px 6px rgba(0,0,60,0.08)' } : { color: '#94a3b8' }}>
            {t('materials.writeOffShort')}
          </button>
        </div>

        {mode === 'in' ? (
          <div className="rounded-2xl bg-white p-4 space-y-4" style={{ border: '1px solid rgba(157,200,255,0.3)' }}>
            <p className="text-sm font-semibold text-slate-800">{t('materials.newBatch')}</p>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">{t('materials.batchCode')}</label>
              <div className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-mono text-slate-600 select-all">
                {batchCode}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">{t('materials.quantityWithUnit', { unit: tn(material.unitShortName, material.unitShortNameEn) })}</label>
              <Stepper value={qty} min={0.01}
                onChange={v => { setQty(v); if (seriesCount > 0) applySeriesCount(seriesCount, v) }} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">{t('materials.warehouse')}</label>
              {warehouses.length === 0 ? (
                <p className="text-xs text-red-500">{t('materials.addWarehousesHint')}</p>
              ) : (
                <div className="relative">
                  <select value={warehouseId ?? ''} onChange={e => setWarehouseId(e.target.value || null)}
                    className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 pr-10 py-3 text-sm text-slate-700 outline-none focus:border-blue-400 transition-all">
                    {warehouses.map(w => <option key={w.id} value={w.id}>{tn(w.name, w.nameEn)}</option>)}
                  </select>
                  <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">{t('materials.pricePerUnitCurrency')}</label>
              <input type="number" min="0" step="any" value={cost} onChange={e => setCost(e.target.value)} placeholder="0.00"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                {t('materials.seriesCount')} <span className="normal-case font-normal text-slate-300">{t('common.optional')}</span>
              </label>
              <Stepper value={seriesCount}
                onChange={v => { const c = Math.round(v); setSeriesCount(c); applySeriesCount(c, qty) }} />
              {seriesItems.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {seriesItems.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#f0f6ff', border: '1px solid rgba(157,200,255,0.25)' }}>
                      <span className="flex-1 text-xs font-mono text-blue-700 truncate">{s.code}</span>
                      <input type="number" value={s.qty} min="0.01" step="0.01"
                        onChange={e => updateSeriesQty(i, parseFloat(e.target.value) || 0)}
                        className="w-20 rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs font-bold text-blue-700 text-right outline-none focus:border-blue-400 transition-all" />
                      <span className="text-xs text-blue-500 shrink-0">{tn(material.unitShortName, material.unitShortNameEn)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">{t('materials.note')}</label>
              <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder={t('common.optionalPlaceholder')}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">{t('materials.quantityWithUnit', { unit: tn(material.unitShortName, material.unitShortNameEn) })}</label>
              <Stepper value={qty} min={0.01} onChange={setQty} />
              {qty > currentBalance && (
                <p className="mt-1.5 text-xs text-red-500">{t('materials.qtyExceedsBalance', { balance: currentBalance })}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">{t('materials.warehouse')}</label>
              {warehouses.length === 0 ? (
                <p className="text-xs text-red-500">{t('materials.addWarehousesHint')}</p>
              ) : (
                <div className="relative">
                  <select value={warehouseId ?? ''} onChange={e => setWarehouseId(e.target.value || null)}
                    className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 pr-10 py-3 text-sm text-slate-700 outline-none focus:border-blue-400 transition-all">
                    {warehouses.map(w => <option key={w.id} value={w.id}>{tn(w.name, w.nameEn)}</option>)}
                  </select>
                  <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">{t('materials.forProduct')}</label>
              <div className="relative">
                <select value={productId ?? ''} onChange={e => setProductId(e.target.value || null)}
                  className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 pr-10 py-3 text-sm text-slate-700 outline-none focus:border-blue-400 transition-all">
                  <option value="">{products.length === 0 ? t('materials.noActiveProducts') : t('materials.selectProduct')}</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">{t('materials.note')}</label>
              <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder={t('common.optionalPlaceholder')}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
            </div>
          </>
        )}

        <button onClick={handleConfirm} disabled={!canConfirm || isSaving}
          className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-white disabled:opacity-40 active:scale-[0.98] transition-all"
          style={{ background: mode === 'in' ? '#16a34a' : '#ef4444' }}>
          {isSaving ? t('common.saving') : mode === 'in' ? t('materials.addToStock') : t('materials.writeOffFromStock')}
        </button>
      </div>
    </div>
  )
}
