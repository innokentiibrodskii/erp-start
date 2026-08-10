import { useState, useRef, useEffect } from 'react'
import { useCatalog } from './hooks/useCatalog'
import { useProducts, useProductPhotos, useProductMutations, useProductStatuses, type PhotoItem } from './hooks/useProducts'

interface Props {
  productId: string | null
  onBack: () => void
}

export default function ProductEditor({ productId, onBack }: Props) {
  const { categories } = useCatalog()
  const productsQ = useProducts()
  const photosQ = useProductPhotos(productId)
  const statusesQ = useProductStatuses()
  const { createProduct, updateProduct, isSaving } = useProductMutations()

  const products = productsQ.data ?? []
  const statuses = statusesQ.data ?? []
  const existing = productId !== null ? products.find(p => p.id === productId) : null
  const isNew = !existing

  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null)
  const [statusId, setStatusId] = useState<string | null>(existing?.statusId ?? null)
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [saved, setSaved] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Підвантажити існуючі фото продукту в редактор
  useEffect(() => {
    if (photosQ.data) setPhotos(photosQ.data)
  }, [photosQ.data])

  // Підтягнути актуальні поля, якщо продукт довантажився вже після монтування
  useEffect(() => {
    if (existing) {
      setStatusId(existing.statusId)
    }
  }, [existing?.statusId])

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return
      setPhotos(prev => [...prev, { key: crypto.randomUUID(), url: URL.createObjectURL(file), file }])
    })
  }

  const removePhoto = (key: string) =>
    setPhotos(prev => prev.filter(p => p.key !== key))

  const makeMainPhoto = (key: string) =>
    setPhotos(prev => {
      const idx = prev.findIndex(p => p.key === key)
      if (idx <= 0) return prev
      const copy = [...prev]
      const [item] = copy.splice(idx, 1)
      copy.unshift(item)
      return copy
    })

  const handleSave = async () => {
    if (!name.trim()) return
    if (existing) {
      await updateProduct({ id: existing.id, name: name.trim(), description, categoryId, statusId, photos })
    } else {
      await createProduct({ name: name.trim(), description, categoryId, photos })
    }
    setSaved(true)
    setToast(isNew ? 'Доданий продукт' : 'Дані збережено')
    setTimeout(() => { setSaved(false); setToast(null); onBack() }, 1100)
  }

  const canSave = name.trim().length > 0 && !isSaving
  const rootCats = categories.filter(c => c.parentId === null)
  const childCats = (id: string) => categories.filter(c => c.parentId === id)

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Toast */}
      <div className="pointer-events-none fixed top-5 left-1/2 z-50 -translate-x-1/2 transition-all duration-300"
        style={{ opacity: toast ? 1 : 0, transform: `translateX(-50%) translateY(${toast ? 0 : -12}px)` }}>
        <div className="flex items-center gap-2 rounded-2xl bg-slate-800 px-5 py-3 text-sm font-medium text-white shadow-xl"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M2.5 7.5l3.5 3.5 6.5-7" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {toast}
        </div>
      </div>

      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{ background: 'rgba(248,251,255,0.96)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(157,200,255,0.2)' }}>
        <button onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95 transition-all">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="flex-1 text-lg text-slate-800 leading-tight">
          {isNew ? 'Новий продукт' : 'Редагувати продукт'}
        </h1>
      </div>

      <div className="px-4 pt-5 pb-12 space-y-6">
        {/* ── Photos ── */}
        <div>
          <label className="mb-3 block text-xs font-semibold uppercase tracking-widest text-slate-400">Фото</label>
          {/* Photo grid */}
          {photos.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-3">
              {photos.map((p, idx) => {
                const isMain = idx === 0
                return (
                  <div key={p.key} className="relative h-24 w-24 shrink-0 cursor-pointer"
                    onClick={() => makeMainPhoto(p.key)}
                    style={isMain ? { outline: '2.5px solid #3b82f6', borderRadius: '1rem' } : {}}>
                    <img src={p.url} alt="" className="h-full w-full rounded-2xl object-cover bg-slate-100" />
                    {isMain ? (
                      <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-lg bg-blue-500 px-1.5 py-0.5 text-[9px] text-white font-medium">
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1 4l1.8 1.8L7 2" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Головне
                      </span>
                    ) : (
                      <span className="absolute bottom-1.5 left-1.5 rounded-lg bg-black/40 px-1.5 py-0.5 text-[9px] text-white/80">
                        Обрати
                      </span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); removePhoto(p.key) }}
                      className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-[10px] shadow-md active:scale-90 transition-all">
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          {/* Drop zone / add more */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl py-7 cursor-pointer transition-all active:scale-[0.98]"
            style={{
              border: `2px dashed ${dragOver ? '#3b82f6' : 'rgba(157,200,255,0.5)'}`,
              background: dragOver ? '#eff6ff' : 'rgba(157,200,255,0.04)',
            }}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-400"
              style={{ boxShadow: '0 1px 8px rgba(0,0,60,0.06)' }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M13 8l-3-3-3 3M10 5v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4 14v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-600">
                {photos.length === 0 ? 'Додати фото' : 'Ще фото'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Камера або файл · JPG, PNG, HEIC</p>
            </div>
          </div>
        </div>

        {/* ── Name ── */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">
            Назва продукту
          </label>
          <input
            autoFocus={isNew}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Введіть назву"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>

        {/* ── Description ── */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">
            Опис
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Короткий опис продукту..."
            rows={3}
            className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>

        {/* ── SKU ── */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-slate-400">Артикул</label>
            <span className="text-[10px] text-slate-400 bg-slate-100 rounded-lg px-2 py-0.5">Авто</span>
          </div>
          <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5">
            <svg className="mr-2 text-slate-400 shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M4 7h6M4 9.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <span className="font-mono text-sm text-slate-600">
              {existing?.sku ?? 'буде згенеровано автоматично'}
            </span>
          </div>
        </div>

        {/* ── Status (edit only) ── */}
        {!isNew && statuses.length > 0 && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">Статус</label>
            <div className="relative">
              {statusId !== null && (
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full"
                  style={{ background: statuses.find(s => s.id === statusId)?.color ?? '#cbd5e1' }} />
              )}
              <select
                value={statusId ?? ''}
                onChange={e => setStatusId(e.target.value ? e.target.value : null)}
                className="w-full appearance-none rounded-2xl border border-slate-200 bg-white py-3.5 pr-10 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                style={{ paddingLeft: statusId !== null ? '2.25rem' : '1rem' }}>
                <option value="">— Без статусу —</option>
                {statuses.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        )}

        {/* ── Category ── */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-400">Категорія</label>
          {categories.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Категорій ще немає — додайте у Довідниках</p>
          ) : (
            <div className="space-y-2">
              {/* No category */}
              <button
                onClick={() => setCategoryId(null)}
                className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all"
                style={categoryId === null
                  ? { background: '#1e293b', border: '1px solid #1e293b' }
                  : { background: 'white', border: '1px solid rgba(157,200,255,0.25)' }
                }>
                <div className="h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0"
                  style={{ borderColor: categoryId === null ? 'white' : '#cbd5e1' }}>
                  {categoryId === null && <div className="h-2.5 w-2.5 rounded-full bg-white" />}
                </div>
                <span className={`text-sm ${categoryId === null ? 'text-white font-medium' : 'text-slate-500'}`}>
                  Без категорії
                </span>
              </button>
              {/* Root categories + children */}
              {rootCats.map(root => {
                const children = childCats(root.id)
                const isActive = categoryId === root.id
                return (
                  <div key={root.id}>
                    <button
                      onClick={() => setCategoryId(root.id)}
                      className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all"
                      style={isActive
                        ? { background: root.color, border: `1px solid ${root.color}` }
                        : { background: 'white', border: '1px solid rgba(157,200,255,0.25)' }
                      }>
                      <div className="h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0"
                        style={{ borderColor: isActive ? 'rgba(255,255,255,0.7)' : '#cbd5e1' }}>
                        {isActive && <div className="h-2.5 w-2.5 rounded-full bg-white" />}
                      </div>
                      <span className={`text-sm font-medium ${isActive ? 'text-white' : 'text-slate-700'}`}>
                        {root.name}
                      </span>
                    </button>
                    {children.length > 0 && (
                      <div className="ml-4 mt-1.5 space-y-1.5">
                        {children.map(child => {
                          const isChildActive = categoryId === child.id
                          return (
                            <button key={child.id}
                              onClick={() => setCategoryId(child.id)}
                              className="w-full flex items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-all"
                              style={isChildActive
                                ? { background: child.color, border: `1px solid ${child.color}` }
                                : { background: '#fafbff', border: '1px solid rgba(157,200,255,0.2)' }
                              }>
                              <div className="h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0"
                                style={{ borderColor: isChildActive ? 'rgba(255,255,255,0.7)' : '#cbd5e1' }}>
                                {isChildActive && <div className="h-2 w-2 rounded-full bg-white" />}
                              </div>
                              <span className={`text-xs font-medium ${isChildActive ? 'text-white' : 'text-slate-600'}`}>
                                {child.name}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Save */}
        <button onClick={handleSave} disabled={!canSave}
          className="flex w-full items-center justify-center rounded-2xl bg-slate-800 py-4 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition-all">
          {isSaving ? 'Збереження…' : isNew ? 'Додати продукт' : 'Зберегти зміни'}
        </button>
      </div>
    </div>
  )
}
