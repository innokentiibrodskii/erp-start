import { useEffect, useRef, useState } from 'react'
import { useCatalog, type MaterialCategory, type Unit, type Supplier, type Warehouse } from './hooks/useCatalog'
import { CategoryTreeNode } from './CategoryTreeNode'
import { CustomFieldsSection, Field, emptyCustomInput, type CustomFieldInput } from './CustomFieldsEditor'
import type { Material } from './hooks/useMaterials'
import { useCustomFieldValues, type CustomFieldDefinition } from './hooks/useCustomFields'
import type { StockMovement } from './hooks/useMaterialStock'
import { fmt, dateStr, buildCatPath, genBatchCode, genSeries, genMaterialArticle } from './lib/materialFormat'
import { PRESET_COLORS } from './lib/colors'

export type { CustomFieldInput }

export interface PendingDelivery {
  id: string
  batchCode: string
  qty: number
  warehouseId: string | null
  cost: number | null
  note: string | null
  series: { code: string; qty: number }[]
}

interface Props {
  editing: Material | null
  categories: MaterialCategory[]
  units: Unit[]
  suppliers: Supplier[]
  fields: CustomFieldDefinition[]
  warehouses: Warehouse[]
  materials: Material[]
  deliveries: StockMovement[]
  nextBatchSeq: number
  isSaving: boolean
  onBack: () => void
  onSave: (args: {
    name: string
    code: string
    categoryId: string | null
    unitId: string
    photoFile: File | null
    photoUrl: string | null
    primarySupplierId: string | null
    supplierIds: string[]
    customInputs: Record<string, CustomFieldInput>
    pendingDeliveries: PendingDelivery[]
  }) => void | Promise<void>
}

export default function MaterialEditorPage({
  editing, categories, units, suppliers, fields, warehouses, materials, deliveries, nextBatchSeq, isSaving, onBack, onSave,
}: Props) {
  const isNew = editing === null
  const [tab, setTab] = useState<'main' | 'deliveries'>('main')

  const [photoUrl, setPhotoUrl] = useState<string | null>(editing?.photo ?? null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(editing?.name ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(editing?.categoryId ?? null)
  const [unitId, setUnitId] = useState<string | null>(editing?.unitId ?? units[0]?.id ?? null)
  const [primarySupplierId, setPrimarySupplierId] = useState<string | null>(editing?.primarySupplierId ?? null)
  const [supplierIds, setSupplierIds] = useState<string[]>(editing?.supplierIds ?? [])
  const [supSearch, setSupSearch] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { addMaterialCategory, addSupplier } = useCatalog()
  const [showCatPicker, setShowCatPicker] = useState(false)
  const [expandedCats, setExpandedCats] = useState<string[]>([])
  const [showAddCat, setShowAddCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [addCatParentId, setAddCatParentId] = useState<string | null>(null)
  const [showSupplierPicker, setShowSupplierPicker] = useState(false)
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [newSupName, setNewSupName] = useState('')
  const [newSupContact, setNewSupContact] = useState('')
  const [newSupPhone, setNewSupPhone] = useState('')

  const valuesQ = useCustomFieldValues('material', editing?.id ?? null)
  const [customInputs, setCustomInputs] = useState<Record<string, CustomFieldInput>>({})

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

  const handleFile = (files: FileList | null) => {
    const file = files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setPhotoFile(file)
    setPhotoUrl(URL.createObjectURL(file))
  }

  const toggleSupplier = (id: string) =>
    setSupplierIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const additionalSuppliers = suppliers.filter(s => s.id !== primarySupplierId)
  const filteredSuppliers = additionalSuppliers.filter(s => s.name.toLowerCase().includes(supSearch.toLowerCase()))
  const primarySupplier = primarySupplierId ? suppliers.find(s => s.id === primarySupplierId) ?? null : null
  const catLabel = buildCatPath(categoryId, categories)
  const selectedUnit = units.find(u => u.id === unitId)
  const categorySeq = categoryId ? materials.filter(m => m.categoryId === categoryId).length + 1 : 1
  const code = editing?.code ?? genMaterialArticle(categoryId, categories, categorySeq)

  /* ── Поставки (лише для нового матеріалу) ── */
  const [pendingDeliveries, setPendingDeliveries] = useState<PendingDelivery[]>([])
  const [showDeliveryForm, setShowDeliveryForm] = useState(false)
  const [dQty, setDQty] = useState(1)
  const [dWarehouseId, setDWarehouseId] = useState<string | null>(warehouses[0]?.id ?? null)
  const [dCost, setDCost] = useState('')
  const [dNote, setDNote] = useState('')
  const [dSeriesCount, setDSeriesCount] = useState(0)
  const [dSeriesItems, setDSeriesItems] = useState<{ code: string; qty: number }[]>([])

  const dBatchCode = genBatchCode(nextBatchSeq + pendingDeliveries.length)
  const applyDSeriesCount = (count: number, qty: number) => setDSeriesItems(genSeries(dBatchCode, count, qty))
  const updateDSeriesQty = (i: number, qty: number) => setDSeriesItems(p => p.map((s, j) => j === i ? { ...s, qty } : s))

  const addPendingDelivery = () => {
    if (dQty <= 0) return
    setPendingDeliveries(p => [...p, {
      id: `${Date.now()}-${p.length}`, batchCode: dBatchCode, qty: dQty, warehouseId: dWarehouseId,
      cost: dCost.trim() === '' ? null : Number(dCost), note: dNote.trim() || null, series: dSeriesItems,
    }])
    setDQty(1); setDCost(''); setDNote(''); setDSeriesCount(0); setDSeriesItems([])
    setShowDeliveryForm(false)
  }

  const canSave = name.trim().length > 0 && unitId !== null && categoryId !== null

  const handleSave = () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Введіть назву'
    if (!unitId) errs.unit = 'Оберіть одиницю виміру'
    if (!categoryId) errs.category = 'Оберіть категорію'
    for (const def of fields) {
      if (!def.isRequired || def.fieldType === 'file' || def.fieldType === 'boolean') continue
      const v = customInputs[def.id]
      const empty = def.fieldType === 'select' ? !v?.optionId : def.fieldType === 'number' ? !v?.number : !v?.text.trim()
      if (empty) errs[`field_${def.id}`] = "Обов'язкове поле"
    }
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    onSave({
      name: name.trim(), code, categoryId, unitId: unitId!, photoFile, photoUrl,
      primarySupplierId, supplierIds, customInputs, pendingDeliveries,
    })
  }

  const topLevelCats = categories.filter(c => c.parentId === null)
  const toggleExpand = (id: string) =>
    setExpandedCats(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const handleAddCategory = () => {
    if (!newCatName.trim()) return
    addMaterialCategory(newCatName.trim(), PRESET_COLORS[categories.length % PRESET_COLORS.length].text, addCatParentId)
    setNewCatName(''); setAddCatParentId(null); setShowAddCat(false)
  }

  const handleAddSupplier = () => {
    if (!newSupName.trim()) return
    addSupplier(newSupName.trim(), newSupContact.trim(), newSupPhone.trim(), '', '')
    setNewSupName(''); setNewSupContact(''); setNewSupPhone(''); setShowAddSupplier(false)
  }

  const deliveriesTabCount = isNew ? pendingDeliveries.length : deliveries.filter(d => d.type === 'in').length

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
        <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="flex-1 text-lg text-slate-800 truncate">
          {editing ? editing.name : 'Новий матеріал'}
        </h1>
      </div>

      <div className="px-4 pt-3">
        <div className="flex rounded-2xl bg-slate-100 p-1 gap-1">
          {([['main', 'Основне'], ['deliveries', 'Поставки']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all"
              style={tab === key ? { background: 'white', color: '#1e293b', boxShadow: '0 1px 6px rgba(0,0,60,0.08)' } : { color: '#94a3b8' }}>
              {label}
              {deliveriesTabCount > 0 && key === 'deliveries' && (
                <span className="ml-1.5 rounded-full bg-amber-100 text-amber-600 text-[10px] font-bold px-1.5 py-0.5">{deliveriesTabCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'main' && (
        <div className="px-4 pt-5 pb-36 space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Фото</label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e.target.files)} />
            <div onClick={() => fileRef.current?.click()}
              className="relative flex items-center gap-4 rounded-2xl cursor-pointer active:scale-[0.98] transition-all overflow-hidden"
              style={{ border: '1px solid rgba(157,200,255,0.3)', background: '#fafbff' }}>
              {photoUrl ? (
                <img src={photoUrl} alt="" className="h-20 w-20 shrink-0 object-cover" />
              ) : (
                <div className="h-20 w-20 shrink-0 flex items-center justify-center bg-amber-50">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-amber-300">
                    <path d="M12 2L20 6.5V17.5L12 22L4 17.5V6.5L12 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                    <path d="M4 6.5L12 11L20 6.5M12 22V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
              <div className="px-4">
                <p className="text-sm font-medium text-slate-600">{photoUrl ? 'Змінити фото' : 'Додати фото'}</p>
                <p className="text-xs text-slate-400">JPG, PNG, HEIC</p>
              </div>
              {photoUrl && (
                <button onClick={e => { e.stopPropagation(); setPhotoUrl(null); setPhotoFile(null) }}
                  className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white text-[10px] shadow active:scale-90">✕</button>
              )}
            </div>
          </div>

          <Field label="Назва матеріалу *" error={errors.name}>
            <input autoFocus={!editing} type="text" value={name}
              onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })) }}
              placeholder="Введіть назву"
              className={`w-full rounded-2xl border px-4 py-3.5 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-100 ${errors.name ? 'border-red-300 bg-red-50 focus:border-red-400' : 'border-slate-200 bg-white focus:border-blue-400'}`} />
          </Field>

          <Field label="Код матеріалу">
            <div className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3.5 text-sm font-mono text-slate-600 select-all">
              {code || <span className="text-slate-400 font-sans">Формується після вибору категорії</span>}
            </div>
          </Field>

          <Field label="Категорія *" error={errors.category}>
            <button onClick={() => setShowCatPicker(true)}
              className={`w-full flex items-center justify-between rounded-2xl border px-4 py-3.5 text-sm text-left transition-all focus:outline-none ${errors.category ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
              <span className={catLabel ? 'text-slate-800 font-medium' : 'text-slate-400'}>{catLabel || 'Оберіть категорію...'}</span>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-slate-400 shrink-0">
                <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </Field>

          <Field label="Одиниця виміру *" error={errors.unit}>
            <div className="relative">
              <select value={unitId ?? ''} onChange={e => { setUnitId(e.target.value || null); setErrors(p => ({ ...p, unit: '' })) }}
                className={`w-full appearance-none rounded-2xl border px-4 pr-10 py-3.5 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-100 ${errors.unit ? 'border-red-300 bg-red-50 focus:border-red-400' : 'border-slate-200 bg-white focus:border-blue-400'}`}>
                <option value="">— Оберіть одиницю —</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.shortName} — {u.name}</option>)}
              </select>
              <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </Field>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Постачальник</label>
            <button onClick={() => setShowSupplierPicker(true)}
              className="w-full flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-left hover:border-blue-300 transition-all">
              <span className={primarySupplier ? 'text-slate-800 font-medium' : 'text-slate-400'}>{primarySupplier?.name ?? 'Не обрано...'}</span>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-slate-400 shrink-0">
                <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Додаткові постачальники
              {supplierIds.length > 0 && <span className="ml-2 text-blue-500 normal-case">{supplierIds.length} обрано</span>}
            </label>
            {additionalSuppliers.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Немає інших постачальників</p>
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

          <CustomFieldsSection fields={fields} customInputs={customInputs} setCustomInput={setCustomInput}
            errors={errors} filesByField={valuesQ.files} isNew={isNew} />
        </div>
      )}

      {tab === 'deliveries' && (
        <div className="px-4 pt-5 pb-36 space-y-3">
          {isNew ? (
            <>
              <div className="rounded-2xl px-4 py-3 text-xs text-amber-700" style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}>
                Поставки буде збережено після створення матеріалу
              </div>

              {!showDeliveryForm ? (
                <button onClick={() => setShowDeliveryForm(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-blue-600 transition-all active:scale-[0.98]"
                  style={{ border: '1.5px dashed rgba(59,130,246,0.35)', background: 'rgba(59,130,246,0.03)' }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                  Додати поставку
                </button>
              ) : (
                <div className="rounded-2xl bg-white p-4 space-y-4" style={{ border: '1px solid rgba(157,200,255,0.3)', boxShadow: '0 2px 12px rgba(157,200,255,0.12)' }}>
                  <p className="text-sm font-semibold text-slate-800">Нова партія</p>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Код партії</label>
                    <div className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-mono text-slate-600 select-all">{dBatchCode}</div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Кількість</label>
                    <Stepper value={dQty} min={0.01} onChange={v => { setDQty(v); if (dSeriesCount > 0) applyDSeriesCount(dSeriesCount, v) }} />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Склад</label>
                    {warehouses.length === 0 ? (
                      <p className="text-xs text-red-500">Додайте склади у Довідниках</p>
                    ) : (
                      <div className="relative">
                        <select value={dWarehouseId ?? ''} onChange={e => setDWarehouseId(e.target.value || null)}
                          className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 pr-10 py-3 text-sm outline-none focus:border-blue-400 transition-all">
                          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                        <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Ціна за одиницю (₴)</label>
                    <input type="number" min="0" step="any" value={dCost} onChange={e => setDCost(e.target.value)} placeholder="0.00"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Кількість серій <span className="normal-case font-normal text-slate-300">(необов'язково)</span>
                    </label>
                    <Stepper value={dSeriesCount} onChange={v => { const c = Math.round(v); setDSeriesCount(c); applyDSeriesCount(c, dQty) }} />
                    {dSeriesItems.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {dSeriesItems.map((s, i) => (
                          <div key={i} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#f0f6ff', border: '1px solid rgba(157,200,255,0.25)' }}>
                            <span className="flex-1 text-xs font-mono text-blue-700 truncate">{s.code}</span>
                            <input type="number" value={s.qty} min="0.01" step="0.01"
                              onChange={e => updateDSeriesQty(i, parseFloat(e.target.value) || 0)}
                              className="w-20 rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs font-bold text-blue-700 text-right outline-none focus:border-blue-400 transition-all" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Примітка</label>
                    <input value={dNote} onChange={e => setDNote(e.target.value)} placeholder="Необов'язково..."
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 transition-all" />
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => { setShowDeliveryForm(false); setDSeriesCount(0) }}
                      className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm text-slate-500 active:scale-[0.98]">Скасувати</button>
                    <button onClick={addPendingDelivery} disabled={dQty <= 0}
                      className="flex-1 rounded-2xl bg-green-600 py-3 text-sm font-semibold text-white disabled:opacity-40 active:scale-[0.98]">Додати</button>
                  </div>
                </div>
              )}

              {pendingDeliveries.map((d, i) => {
                const wh = d.warehouseId ? warehouses.find(w => w.id === d.warehouseId) : null
                return (
                  <div key={d.id} className="rounded-2xl bg-white px-4 py-3.5 flex items-start gap-3" style={{ border: '1px solid rgba(22,163,74,0.2)' }}>
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-green-50 text-green-600 text-sm font-bold shrink-0">+</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-slate-500 mb-0.5">{d.batchCode}</p>
                      <p className="text-sm font-semibold text-slate-800">{fmt(d.qty)} {selectedUnit?.shortName ?? ''}</p>
                      <p className="text-xs text-slate-400">{[wh?.name, d.cost ? `${d.cost} ₴/од` : ''].filter(Boolean).join(' · ')}</p>
                      {d.series.length > 0 && <p className="text-xs text-blue-500 mt-0.5">{d.series.length} серій</p>}
                    </div>
                    <button onClick={() => setPendingDeliveries(p => p.filter((_, j) => j !== i))}
                      className="text-slate-300 hover:text-red-400 transition-colors text-sm shrink-0">✕</button>
                  </div>
                )
              })}
            </>
          ) : (
            <>
              {deliveries.filter(d => d.type === 'in').length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl py-12 text-center" style={{ border: '1.5px dashed rgba(157,200,255,0.4)' }}>
                  <p className="text-sm text-slate-400">Поставок ще немає</p>
                </div>
              ) : deliveries.filter(d => d.type === 'in').sort((a, b) => b.createdAt - a.createdAt).map(d => {
                const wh = warehouses.find(w => w.id === d.warehouseId)
                return (
                  <div key={d.id} className="rounded-2xl bg-white px-4 py-4" style={{ border: '1px solid rgba(22,163,74,0.2)' }}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-xl text-xs font-bold" style={{ background: '#f0fdf4', color: '#16a34a' }}>+</span>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">Надходження</p>
                          <p className="text-xs text-slate-400">{dateStr(d.createdAt)}</p>
                        </div>
                      </div>
                      <p className="text-base font-bold text-green-600">+{fmt(d.qty)} {editing?.unitShortName}</p>
                    </div>
                    <div className="space-y-1 text-xs text-slate-500">
                      {d.batchCode && <p className="font-mono">{d.batchCode}</p>}
                      {wh && <p>{wh.name}</p>}
                      {d.cost !== null && <p>{d.cost} ₴/од</p>}
                      {d.note && <p>{d.note}</p>}
                      {d.series.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {d.series.map(s => (
                            <div key={s.id} className="flex items-center justify-between rounded-lg px-2.5 py-2 bg-blue-50">
                              <span className="text-blue-700 font-mono text-[11px]">{s.code}</span>
                              <span className="text-blue-500 font-bold shrink-0">{fmt(s.qty)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 pt-3 z-40"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)', background: 'linear-gradient(to top, rgba(248,251,255,1) 80%, transparent)' }}>
        <button onClick={handleSave} disabled={!canSave || isSaving}
          className="flex w-full items-center justify-center rounded-2xl bg-slate-800 py-4 text-sm font-semibold text-white disabled:opacity-40 active:scale-[0.98] transition-all">
          {isSaving ? 'Збереження…' : editing ? 'Зберегти зміни' : 'Додати матеріал'}
        </button>
      </div>

      {showCatPicker && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowCatPicker(false)} />
          <div className="relative z-10 rounded-t-3xl bg-white pb-8 flex flex-col" style={{ maxHeight: '85vh', boxShadow: '0 -8px 40px rgba(0,0,0,0.14)' }}>
            <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="h-1 w-10 rounded-full bg-slate-200" /></div>
            <div className="flex items-center justify-between px-5 py-3 shrink-0">
              <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-lg text-slate-800">Категорія</h2>
              <button onClick={() => setShowCatPicker(false)} className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-90">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 space-y-2 pb-2">
              <button onClick={() => { setCategoryId(null); setErrors(p => ({ ...p, category: '' })); setShowCatPicker(false) }}
                className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all"
                style={!categoryId ? { background: '#eff6ff', border: '1.5px solid #93c5fd' } : { background: 'white', border: '1px solid rgba(157,200,255,0.25)' }}>
                <div className="h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: !categoryId ? '#3b82f6' : '#cbd5e1' }}>
                  {!categoryId && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                </div>
                <span className="text-sm font-medium text-slate-700">Без категорії</span>
              </button>
              {categories.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-400">Категорій ще немає — додайте першу нижче</p>
              )}
              {topLevelCats.map(cat => (
                <CategoryTreeNode key={cat.id} cat={cat} depth={0} allCats={categories} selectedId={categoryId}
                  expandedIds={expandedCats}
                  onSelect={id => { setCategoryId(id); setErrors(p => ({ ...p, category: '' })); setShowCatPicker(false) }}
                  onToggleExpand={toggleExpand} />
              ))}

              {showAddCat ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 space-y-2.5">
                  <p className="text-xs font-semibold text-blue-700">Нова категорія</p>
                  <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                    placeholder="Назва категорії" autoFocus
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 transition-all" />
                  <div className="relative">
                    <select value={addCatParentId ?? ''} onChange={e => setAddCatParentId(e.target.value || null)}
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 py-2 text-sm outline-none focus:border-blue-400 transition-all">
                      <option value="">— Верхнього рівня —</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{buildCatPath(c.id, categories)}</option>)}
                    </select>
                    <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M2 3.5l3.5 4 3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setShowAddCat(false); setNewCatName('') }}
                      className="flex-1 rounded-xl border border-slate-200 py-2 text-xs text-slate-500 active:scale-[0.98]">Скасувати</button>
                    <button onClick={handleAddCategory} disabled={!newCatName.trim()}
                      className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white disabled:opacity-40 active:scale-[0.98]">Додати</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowAddCat(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs font-semibold text-blue-600 transition-all active:scale-[0.98]"
                  style={{ border: '1.5px dashed rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.02)' }}>
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                  Додати категорію
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showSupplierPicker && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowSupplierPicker(false)} />
          <div className="relative z-10 rounded-t-3xl bg-white pb-8" style={{ boxShadow: '0 -8px 40px rgba(0,0,0,0.14)' }}>
            <div className="flex justify-center pt-3 pb-1"><div className="h-1 w-10 rounded-full bg-slate-200" /></div>
            <div className="flex items-center justify-between px-5 py-3">
              <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-lg text-slate-800">Постачальник</h2>
              <button onClick={() => setShowSupplierPicker(false)} className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-90">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="px-5 space-y-2 max-h-72 overflow-y-auto">
              <button onClick={() => { setPrimarySupplierId(null); setShowSupplierPicker(false) }}
                className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all"
                style={!primarySupplierId ? { background: '#f0f6ff', border: '1.5px solid #93c5fd' } : { background: 'white', border: '1px solid rgba(157,200,255,0.25)' }}>
                <div className="h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: !primarySupplierId ? '#3b82f6' : '#cbd5e1' }}>
                  {!primarySupplierId && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                </div>
                <span className="text-sm font-medium text-slate-500">Не обрано</span>
              </button>
              {suppliers.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Постачальників ще немає — додайте нижче</p>}
              {suppliers.map(s => {
                const sel = primarySupplierId === s.id
                return (
                  <button key={s.id} onClick={() => { setPrimarySupplierId(s.id); setSupplierIds(p => p.filter(id => id !== s.id)); setShowSupplierPicker(false) }}
                    className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all"
                    style={sel ? { background: '#f0f6ff', border: '1.5px solid #93c5fd' } : { background: 'white', border: '1px solid rgba(157,200,255,0.25)' }}>
                    <div className="h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: sel ? '#3b82f6' : '#cbd5e1' }}>
                      {sel && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{s.name}</p>
                      {s.contactPerson && <p className="text-xs text-slate-400 truncate">{s.contactPerson}</p>}
                    </div>
                  </button>
                )
              })}

              {showAddSupplier ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 space-y-2.5">
                  <p className="text-xs font-semibold text-blue-700">Новий постачальник</p>
                  <input value={newSupName} onChange={e => setNewSupName(e.target.value)}
                    placeholder="Назва компанії *" autoFocus
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 transition-all" />
                  <input value={newSupContact} onChange={e => setNewSupContact(e.target.value)}
                    placeholder="Контактна особа"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 transition-all" />
                  <input value={newSupPhone} onChange={e => setNewSupPhone(e.target.value)}
                    placeholder="Телефон"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 transition-all" />
                  <div className="flex gap-2">
                    <button onClick={() => { setShowAddSupplier(false); setNewSupName(''); setNewSupContact(''); setNewSupPhone('') }}
                      className="flex-1 rounded-xl border border-slate-200 py-2 text-xs text-slate-500 active:scale-[0.98]">Скасувати</button>
                    <button onClick={handleAddSupplier} disabled={!newSupName.trim()}
                      className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white disabled:opacity-40 active:scale-[0.98]">Додати</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowAddSupplier(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs font-semibold text-blue-600 transition-all active:scale-[0.98]"
                  style={{ border: '1.5px dashed rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.02)' }}>
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                  Додати постачальника
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="flex items-center rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button type="button" onClick={() => onChange(Math.max(min, +(value - 1).toFixed(2)))}
        className="px-4 py-3 text-slate-500 hover:bg-slate-50 text-xl leading-none active:scale-90 transition-all">−</button>
      <input type="number" value={value} min={min} step="any"
        onChange={e => onChange(Math.max(min, parseFloat(e.target.value) || 0))}
        className="flex-1 bg-transparent text-center text-lg font-bold text-slate-800 outline-none" />
      <button type="button" onClick={() => onChange(+(value + 1).toFixed(2))}
        className="px-4 py-3 text-slate-500 hover:bg-slate-50 text-xl leading-none active:scale-90 transition-all">+</button>
    </div>
  )
}

