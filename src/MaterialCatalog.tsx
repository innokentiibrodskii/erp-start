import { useState, useRef } from 'react'
import { useCatalog } from './hooks/useCatalog'
import { useMaterials, useMaterialMutations, type Material } from './hooks/useMaterials'

interface Props { onNavigate?: (page: string) => void; onBack?: () => void }

export default function MaterialCatalog({ onNavigate: _onNavigate, onBack }: Props) {
  const { materialCategories, units, suppliers } = useCatalog()
  const materialsQ = useMaterials()
  const { createMaterial, updateMaterial, removeMaterial, isSaving } = useMaterialMutations()
  const materials = materialsQ.data ?? []

  const [search, setSearch] = useState('')
  const [sheet, setSheet]   = useState<{ open: boolean; editing: Material | null }>({ open: false, editing: null })
  const [toast, setToast]   = useState(false)
  const showToast = () => { setToast(true); setTimeout(() => setToast(false), 2200) }

  const filtered = materials.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))

  const openAdd  = () => setSheet({ open: true, editing: null })
  const openEdit = (m: Material) => setSheet({ open: true, editing: m })
  const close    = () => setSheet(s => ({ ...s, open: false }))

  const getCat = (id: string | null) => materialCategories.find(c => c.id === id)

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Toast */}
      <div className="pointer-events-none fixed top-5 left-1/2 z-50 -translate-x-1/2 transition-all duration-300"
        style={{ opacity: toast ? 1 : 0, transform: `translateX(-50%) translateY(${toast ? 0 : -12}px)` }}>
        <div className="flex items-center gap-2 rounded-2xl bg-slate-800 px-5 py-3 text-sm font-medium text-white shadow-xl">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M2.5 7.5l3.5 3.5 6.5-7" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Додано
        </div>
      </div>

      <div className="px-4 pt-5 pb-3">
        {onBack ? (
          <div className="flex items-center gap-3 mb-1">
            <button onClick={onBack}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95 transition-all">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl text-slate-800">Каталог матеріалів</h1>
          </div>
        ) : (
          <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl text-slate-800 mb-1">Матеріали</h1>
        )}
        <p className="text-xs text-slate-400 mb-3">{materials.length} позицій</p>

        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input type="search" placeholder="Пошук матеріалу..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
        </div>

        <button onClick={openAdd}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white active:scale-[0.98] transition-all">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
          </svg>
          Додати матеріал
        </button>
      </div>

      <div className="px-4 space-y-2 pb-8">
        {materialsQ.isLoading ? (
          <div className="py-10 text-center text-sm text-slate-400">Завантаження…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white py-12 text-center text-sm text-slate-400"
            style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            Нічого не знайдено
          </div>
        ) : filtered.map(m => {
          const matSuppliers = suppliers.filter(s => m.supplierIds.includes(s.id))
          const cat = getCat(m.categoryId)
          return (
            <div key={m.id} className="rounded-2xl bg-white overflow-hidden"
              style={{ border: '1px solid rgba(157,200,255,0.22)', boxShadow: '0 1px 6px rgba(157,200,255,0.07)' }}>
              <div className="flex items-center gap-3 px-4 py-3.5">
                {/* Photo */}
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
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-xs text-slate-400">{m.unitShortName}</span>
                    {cat && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: cat.color + '1a', color: cat.color }}>
                        {cat.name}
                      </span>
                    )}
                  </div>
                  {matSuppliers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {matSuppliers.map(s => (
                        <span key={s.id} className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700 font-medium">
                          {s.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => openEdit(m)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800 text-white active:scale-95 transition-all">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M9 2l2 2-7 7H2v-2L9 2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  <button onClick={() => removeMaterial(m.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-300 hover:border-red-200 hover:text-red-400 active:scale-95 transition-all">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M2 3h9M4 3V2h5v1M5 6v4M8 6v4M3 3l.5 8h6l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {sheet.open && (
        <MaterialForm
          editing={sheet.editing}
          categories={materialCategories}
          units={units}
          suppliers={suppliers}
          isSaving={isSaving}
          onClose={close}
          onSave={async (name, categoryId, unitId, photoFile, photoUrl, supplierIds) => {
            if (sheet.editing) await updateMaterial({ id: sheet.editing.id, name, categoryId, unitId, photoFile, photoUrl, supplierIds })
            else await createMaterial({ name, categoryId, unitId, photoFile, supplierIds })
            close()
            showToast()
          }}
        />
      )}
    </div>
  )
}

function MaterialForm({ editing, categories, units, suppliers, isSaving, onClose, onSave }: {
  editing: Material | null
  categories: ReturnType<typeof useCatalog>['materialCategories']
  units: ReturnType<typeof useCatalog>['units']
  suppliers: ReturnType<typeof useCatalog>['suppliers']
  isSaving: boolean
  onClose: () => void
  onSave: (name: string, categoryId: string | null, unitId: string, photoFile: File | null, photoUrl: string | null, supplierIds: string[]) => void | Promise<void>
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
  const canSave = name.trim().length > 0 && unitId.length > 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-3xl bg-white pt-2 pb-10 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-center py-3">
          <button onClick={onClose} className="h-1 w-10 rounded-full bg-slate-200" />
        </div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="px-5 text-2xl text-slate-800 mb-5">
          {editing ? 'Редагувати матеріал' : 'Новий матеріал'}
        </h2>
        <div className="px-5 space-y-5">
          {/* Photo */}
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

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">Назва матеріалу</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Напр. Картон"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
          </div>

          {/* Category */}
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

          {/* Unit */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">Одиниця виміру</label>
            {units.length === 0 ? (
              <p className="text-xs text-red-500">Додайте одиниці виміру у Довідниках</p>
            ) : (
              <div className="relative">
                <select
                  value={unitId}
                  onChange={e => setUnitId(e.target.value)}
                  className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
                  {units.map(u => (
                    <option key={u.id} value={u.id}>{u.shortName} — {u.name}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
          </div>

          {/* Suppliers */}
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
        </div>
        <div className="flex gap-3 mt-6 px-5">
          <button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm text-slate-600">Скасувати</button>
          <button onClick={() => onSave(name.trim(), categoryId, unitId, photoFile, photoUrl, supplierIds)} disabled={!canSave || isSaving}
            className="flex-1 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition-all">
            {isSaving ? 'Збереження…' : editing ? 'Зберегти' : 'Додати'}
          </button>
        </div>
      </div>
    </div>
  )
}
