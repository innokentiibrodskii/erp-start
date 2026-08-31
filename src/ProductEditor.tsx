import { useState, useRef, useEffect } from 'react'
import { useCatalog } from './hooks/useCatalog'
import { useProducts, useProductPhotos, useProductVideos, useProductMutations, useProductStatuses, usePhotoStatuses, genProductArticle, MAX_PHOTO_SIZE, MAX_VIDEO_SIZE, type PhotoItem, type VideoItem } from './hooks/useProducts'
import { compressImageToLimit } from './lib/imageCompress'
import { useProductAttributeMutations } from './hooks/useProductAttributes'
import { useCustomFieldDefinitions, useCustomFieldValues, useCustomFieldValueMutations } from './hooks/useCustomFields'
import { CategoryTreeNode } from './CategoryTreeNode'
import { CustomFieldsSection, emptyCustomInput, type CustomFieldInput } from './CustomFieldsEditor'
import { useLocale } from './LocaleContext'

interface Props {
  productId: string | null
  onBack: () => void
}

export default function ProductEditor({ productId, onBack }: Props) {
  const { t, tn } = useLocale()
  const { categories, attributes } = useCatalog()
  const productsQ = useProducts()
  const photosQ = useProductPhotos(productId)
  const videosQ = useProductVideos(productId)
  const statusesQ = useProductStatuses()
  const photoStatusesQ = usePhotoStatuses()
  const { createProduct, updateProduct, isSaving } = useProductMutations()
  const { addAttributeValue, removeAttributeValue } = useProductAttributeMutations()
  const customFieldsQ = useCustomFieldDefinitions('product')
  const customFields = customFieldsQ.data ?? []
  const customValuesQ = useCustomFieldValues('product', productId)
  const { setValue: setCustomFieldValue } = useCustomFieldValueMutations('product')

  const products = productsQ.data ?? []
  const statuses = statusesQ.data ?? []
  const photoStatuses = photoStatusesQ.data ?? []
  const defaultPhotoStatusId = photoStatuses.find(s => s.isDefault)?.id ?? null
  const existing = productId !== null ? products.find(p => p.id === productId) : null
  const isNew = !existing
  const sku = existing?.sku ?? genProductArticle(products)

  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null)
  const [statusId, setStatusId] = useState<string | null>(existing?.statusId ?? null)
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [saved, setSaved] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [videoDragOver, setVideoDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  // Уся секція "Категорія" згорнута в один рядок (як звичайний select) за замовчуванням —
  // дерево розгортається лише по кліку на шеврон (той самий патерн, що й у фільтрах).
  const [catSectionOpen, setCatSectionOpen] = useState(false)
  const [expandedCats, setExpandedCats] = useState<string[]>([])
  const toggleExpandCat = (id: string) =>
    setExpandedCats(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])

  // Додаткові (кастомні) поля продукту
  const [customInputs, setCustomInputs] = useState<Record<string, CustomFieldInput>>({})
  useEffect(() => {
    if (!existing || customValuesQ.values.length === 0) return
    setCustomInputs(prev => {
      const next = { ...prev }
      for (const v of customValuesQ.values) {
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
  }, [existing?.id, customValuesQ.values.length])
  const setCustomInput = (fieldId: string, patch: Partial<CustomFieldInput>) =>
    setCustomInputs(prev => ({ ...prev, [fieldId]: { ...emptyCustomInput(), ...prev[fieldId], ...patch } }))

  // Підвантажити існуючі фото продукту в редактор
  useEffect(() => {
    if (photosQ.data) setPhotos(photosQ.data)
  }, [photosQ.data])

  // Підвантажити існуючі відео продукту в редактор
  useEffect(() => {
    if (videosQ.data) setVideos(videosQ.data)
  }, [videosQ.data])

  // Підтягнути актуальні поля, якщо продукт довантажився вже після монтування
  useEffect(() => {
    if (existing) {
      setStatusId(existing.statusId)
    }
  }, [existing?.statusId])

  const handleFiles = async (files: FileList | null) => {
    if (!files) return
    const tooLarge: string[] = []
    const compressed: string[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      let toAdd = file
      if (file.size > MAX_PHOTO_SIZE) {
        const result = await compressImageToLimit(file, MAX_PHOTO_SIZE)
        if (!result) { tooLarge.push(file.name); continue }
        compressed.push(file.name)
        toAdd = result
      }
      setPhotos(prev => [...prev, {
        key: crypto.randomUUID(), url: URL.createObjectURL(toAdd), file: toAdd,
        dbId: null, statusId: defaultPhotoStatusId, originalUrl: null, createdAt: null,
        // Сирий файл тримаємо завжди (нічого не коштує в пам'яті) — реально
        // вивантажується лише якщо користувач увімкне перемикач саме на
        // цьому фото (keepOriginal за замовчуванням false, per-фото рішення).
        originalFile: file, keepOriginal: false,
      }])
    }
    if (compressed.length > 0) {
      setToast(t('productEditor.photoCompressed', { names: compressed.join(', '), limit: MAX_PHOTO_SIZE / (1024 * 1024) }))
      setTimeout(() => setToast(null), 3000)
    }
    if (tooLarge.length > 0) {
      setToast(t('productEditor.photoTooLarge', { names: tooLarge.join(', '), limit: MAX_PHOTO_SIZE / (1024 * 1024) }))
      setTimeout(() => setToast(null), 3000)
    }
  }

  const removePhoto = (key: string) =>
    setPhotos(prev => prev.filter(p => p.key !== key))

  const setPhotoStatus = (key: string, statusId: string) =>
    setPhotos(prev => prev.map(p => p.key === key ? { ...p, statusId } : p))

  const togglePhotoOriginal = (key: string) =>
    setPhotos(prev => prev.map(p => p.key === key ? { ...p, keepOriginal: !p.keepOriginal } : p))

  const makeMainPhoto = (key: string) =>
    setPhotos(prev => {
      const idx = prev.findIndex(p => p.key === key)
      if (idx <= 0) return prev
      const copy = [...prev]
      const [item] = copy.splice(idx, 1)
      copy.unshift(item)
      return copy
    })

  const handleVideoFiles = (files: FileList | null) => {
    if (!files) return
    const tooLarge: string[] = []
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('video/')) return
      if (file.size > MAX_VIDEO_SIZE) { tooLarge.push(file.name); return }
      setVideos(prev => [...prev, { key: crypto.randomUUID(), url: URL.createObjectURL(file), file, dbId: null, createdAt: null }])
    })
    if (tooLarge.length > 0) {
      setToast(t('productEditor.videoTooLarge', { names: tooLarge.join(', '), limit: MAX_VIDEO_SIZE / (1024 * 1024) }))
      setTimeout(() => setToast(null), 3000)
    }
  }

  const removeVideo = (key: string) =>
    setVideos(prev => prev.filter(v => v.key !== key))

  const saveCustomFieldValues = async (id: string, inputs: Record<string, CustomFieldInput>) => {
    for (const def of customFields) {
      if (def.fieldType === 'file') continue
      const v = inputs[def.id]
      if (!v) continue
      await setCustomFieldValue({
        entityId: id,
        fieldDefinitionId: def.id,
        valueText: def.fieldType === 'text' ? (v.text.trim() || null) : null,
        valueNumber: def.fieldType === 'number' ? (v.number ? parseFloat(v.number) : null) : null,
        valueBoolean: def.fieldType === 'boolean' ? v.boolean : null,
        valueOptionId: def.fieldType === 'select' ? v.optionId : null,
      })
    }
  }

  const handleSave = async () => {
    if (!name.trim()) return
    // Прогрес рахуємо лише по нововибраних файлах — уже завантажені фото/відео
    // (без .file) при збереженні повторно не вантажаться.
    const newFiles = [...photos, ...videos].filter((f): f is (PhotoItem | VideoItem) & { file: File } => !!f.file)
    const totalBytes = newFiles.reduce((sum, f) => sum + f.file.size, 0)
    const loadedByKey = new Map<string, number>()
    const onProgress = totalBytes > 0 ? (key: string, loadedBytes: number) => {
      loadedByKey.set(key, loadedBytes)
      const loaded = [...loadedByKey.values()].reduce((a, b) => a + b, 0)
      setUploadPct(Math.min(99, Math.round((loaded / totalBytes) * 100)))
    } : undefined
    if (totalBytes > 0) setUploadPct(0)

    let id: string
    try {
      if (existing) {
        await updateProduct({ id: existing.id, name: name.trim(), description, categoryId, statusId, photos, videos, onProgress })
        id = existing.id
      } else {
        id = await createProduct({ name: name.trim(), description, categoryId, sku, photos, videos, onProgress })
      }
    } finally {
      setUploadPct(null)
    }
    await saveCustomFieldValues(id, customInputs)
    setSaved(true)
    setToast(isNew ? t('productEditor.toastAdded') : t('productEditor.toastSaved'))
    setTimeout(() => { setSaved(false); setToast(null); onBack() }, 1100)
  }

  // Сортування грідів фото/відео: найновіші зверху, найстаріші знизу. "Головне"
  // фото (photos[0] — саме воно стає обкладинкою при збереженні) лишається
  // закріпленим першим незалежно від дати — щоб ручний вибір користувача не
  // "зісковзував" вниз при повторному відкритті редактора після нового фото.
  // Щойно додані (ще не збережені, createdAt === null) вважаються найновішими.
  const byNewestFirst = (a: { createdAt: number | null }, b: { createdAt: number | null }) =>
    (b.createdAt ?? Infinity) - (a.createdAt ?? Infinity)
  const sortedPhotos = photos.length > 1
    ? [photos[0], ...photos.slice(1).slice().sort(byNewestFirst)]
    : photos
  const sortedVideos = videos.slice().sort(byNewestFirst)

  const canSave = name.trim().length > 0 && !isSaving
  const rootCats = categories.filter(c => c.parentId === null)
  // Характеристики — яка саме розгорнута в спадний список (одночасно лише одна)
  const [openAttrId, setOpenAttrId] = useState<string | null>(null)
  const toggleAttrOpen = (id: string) => setOpenAttrId(cur => cur === id ? null : id)
  const selectedCat = categoryId === null ? null : categories.find(c => c.id === categoryId) ?? null
  const selectedCatLabel = selectedCat ? tn(selectedCat.name, selectedCat.nameEn) : t('productEditor.noCategory')

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
          {isNew ? t('productEditor.new') : t('productEditor.edit')}
        </h1>
      </div>

      <div className="px-4 pt-5 pb-36 space-y-6">
        {/* ── Photos ── */}
        <div>
          <label className="mb-3 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('productEditor.photo')}</label>
          {/* Photo grid */}
          {photos.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-3">
              {sortedPhotos.map(p => {
                const isMain = p.key === photos[0]?.key
                const status = photoStatuses.find(s => s.id === p.statusId)
                return (
                  <div key={p.key} className="w-24 shrink-0">
                    <div className="relative h-24 w-24 cursor-pointer"
                      onClick={() => makeMainPhoto(p.key)}
                      style={isMain ? { outline: '2.5px solid #3b82f6', borderRadius: '1rem' } : {}}>
                      <img src={p.url} alt="" loading="lazy" className="h-full w-full rounded-2xl object-cover bg-slate-100" />
                      {isMain ? (
                        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-lg bg-blue-500 px-1.5 py-0.5 text-[9px] text-white font-medium">
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1 4l1.8 1.8L7 2" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          {t('productEditor.main')}
                        </span>
                      ) : (
                        <span className="absolute bottom-1.5 left-1.5 rounded-lg bg-black/40 px-1.5 py-0.5 text-[9px] text-white/80">
                          {t('productEditor.choose')}
                        </span>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); removePhoto(p.key) }}
                        className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-[10px] shadow-md active:scale-90 transition-all">
                        ✕
                      </button>
                    </div>
                    {photoStatuses.length > 0 && (
                      <select value={p.statusId ?? ''} onClick={e => e.stopPropagation()}
                        onChange={e => setPhotoStatus(p.key, e.target.value)}
                        className="mt-1 w-full rounded-lg border-none px-1 py-0.5 text-[9px] font-medium outline-none appearance-none text-center truncate"
                        style={{ background: status ? `${status.color}22` : '#f1f5f9', color: status?.color ?? '#94a3b8' }}>
                        {photoStatuses.map(s => <option key={s.id} value={s.id}>{tn(s.name, s.nameEn)}</option>)}
                      </select>
                    )}
                    <p className="mt-1 truncate text-center text-[9px] text-slate-300">
                      {p.createdAt ? new Date(p.createdAt).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : t('productEditor.justAdded')}
                    </p>
                    {p.originalUrl && (
                      <a href={p.originalUrl} download onClick={e => e.stopPropagation()}
                        className="mt-1 block truncate rounded-lg bg-slate-50 px-1 py-0.5 text-center text-[9px] text-slate-400 hover:text-slate-600">
                        {t('common.downloadOriginal')}
                      </a>
                    )}
                    {/* Рішення "зберігати оригінал" — per конкретне (щойно
                       додане, ще не збережене) фото, не глобально на всі нові. */}
                    {p.file && (
                      <button onClick={e => { e.stopPropagation(); togglePhotoOriginal(p.key) }}
                        className="mt-1 block w-full truncate rounded-lg px-1 py-0.5 text-center text-[9px] font-medium transition-all"
                        style={p.keepOriginal ? { background: '#1e293b22', color: '#1e293b' } : { background: '#f1f5f9', color: '#94a3b8' }}>
                        {t('productEditor.keepOriginal')}
                      </button>
                    )}
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
                {photos.length === 0 ? t('productEditor.addPhoto') : t('productEditor.morePhotos')}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{t('productEditor.photoHint')}</p>
            </div>
          </div>
        </div>

        {/* ── Videos ── */}
        <div>
          <label className="mb-3 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('productEditor.video')}</label>
          {/* Video grid */}
          {videos.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-3">
              {sortedVideos.map(v => (
                <div key={v.key} className="w-24 shrink-0">
                  <div className="relative h-24 w-24">
                    <video src={v.url} className="h-full w-full rounded-2xl object-cover bg-slate-100" muted playsInline />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M3 2l7 4-7 4V2z" fill="white"/>
                        </svg>
                      </div>
                    </div>
                    <button
                      onClick={() => removeVideo(v.key)}
                      className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-[10px] shadow-md active:scale-90 transition-all">
                      ✕
                    </button>
                  </div>
                  <p className="mt-1 truncate text-center text-[9px] text-slate-300">
                    {v.createdAt ? new Date(v.createdAt).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : t('productEditor.justAdded')}
                  </p>
                </div>
              ))}
            </div>
          )}
          {/* Drop zone / add more */}
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={e => handleVideoFiles(e.target.files)}
          />
          <div
            onClick={() => videoInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setVideoDragOver(true) }}
            onDragLeave={() => setVideoDragOver(false)}
            onDrop={e => { e.preventDefault(); setVideoDragOver(false); handleVideoFiles(e.dataTransfer.files) }}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl py-7 cursor-pointer transition-all active:scale-[0.98]"
            style={{
              border: `2px dashed ${videoDragOver ? '#3b82f6' : 'rgba(157,200,255,0.5)'}`,
              background: videoDragOver ? '#eff6ff' : 'rgba(157,200,255,0.04)',
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
                {videos.length === 0 ? t('productEditor.addVideo') : t('productEditor.moreVideos')}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{t('productEditor.videoHint')}</p>
            </div>
          </div>
        </div>

        {/* ── Name ── */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">
            {t('productEditor.name')}
          </label>
          <input
            autoFocus={isNew}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('productEditor.namePlaceholder')}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>

        {/* ── Description ── */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">
            {t('productEditor.description')}
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('productEditor.descriptionPlaceholder')}
            rows={3}
            className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>

        {/* ── SKU ── */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t('productEditor.sku')}</label>
            <span className="text-[10px] text-slate-400 bg-slate-100 rounded-lg px-2 py-0.5">{t('productEditor.auto')}</span>
          </div>
          <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5">
            <svg className="mr-2 text-slate-400 shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M4 7h6M4 9.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <span className="font-mono text-sm text-slate-600">{sku}</span>
          </div>
        </div>

        {/* ── Status (edit only) ── */}
        {!isNew && statuses.length > 0 && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('productEditor.status')}</label>
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
                <option value="">{t('productEditor.noStatus')}</option>
                {statuses.map(s => (
                  <option key={s.id} value={s.id}>{tn(s.name, s.nameEn)}</option>
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
          <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('productEditor.category')}</label>
          {categories.length === 0 ? (
            <p className="text-xs text-slate-400 italic">{t('productEditor.noCategoriesYet')}</p>
          ) : !catSectionOpen ? (
            // Згорнутий вигляд — звичайний select
            <button onClick={() => setCatSectionOpen(true)}
              className="w-full flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-left transition-all active:scale-[0.99]">
              <span className="text-slate-800">{selectedCatLabel}</span>
              <svg className="text-slate-400 shrink-0" width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : (
            <div className="space-y-2">
              {/* No category — та ж кнопка й закриває всю секцію назад у компактний select */}
              <div className="flex items-center gap-1 rounded-2xl overflow-hidden"
                style={categoryId === null
                  ? { background: '#1e293b', border: '1px solid #1e293b' }
                  : { background: 'white', border: '1px solid rgba(157,200,255,0.25)' }
                }>
                <button onClick={() => setCategoryId(null)} className="flex-1 flex items-center gap-3 px-4 py-3 text-left">
                  <div className="h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0"
                    style={{ borderColor: categoryId === null ? 'white' : '#cbd5e1' }}>
                    {categoryId === null && <div className="h-2.5 w-2.5 rounded-full bg-white" />}
                  </div>
                  <span className={`text-sm ${categoryId === null ? 'text-white font-medium' : 'text-slate-500'}`}>
                    {t('productEditor.noCategory')}
                  </span>
                </button>
                <button onClick={() => setCatSectionOpen(false)} className="flex h-10 w-10 items-center justify-center shrink-0"
                  style={{ color: categoryId === null ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ transform: 'rotate(180deg)' }}>
                    <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
              {/* Root categories — дерево розгортається/згортається по кліку на шеврон */}
              {rootCats.map(cat => (
                <CategoryTreeNode key={cat.id} cat={cat} depth={0} allCats={categories} selectedId={categoryId}
                  expandedIds={expandedCats} onSelect={setCategoryId} onToggleExpand={toggleExpandCat} />
              ))}
            </div>
          )}
        </div>

        {/* ── Custom fields ── */}
        <CustomFieldsSection fields={customFields} customInputs={customInputs} setCustomInput={setCustomInput}
          errors={{}} filesByField={customValuesQ.files} isNew={isNew} entityType="product" />

        {/* ── Characteristics (edit only) ── */}
        {!isNew && existing && (
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-400">{t('productEditor.attributes')}</label>
            {attributes.length === 0 ? (
              <p className="text-xs text-slate-400 italic">{t('productEditor.noAttributesYet')}</p>
            ) : (
              <div className="space-y-4">
                {attributes.map(attr => {
                  const selectedIds = new Set(existing.attributes.map(a => a.valueId))
                  const selectedValues = attr.values.filter(v => selectedIds.has(v.id))
                  const isOpen = openAttrId === attr.id
                  return (
                    <div key={attr.id}>
                      <p className="mb-1.5 text-xs font-medium text-slate-500">{tn(attr.name, attr.nameEn)}</p>
                      {attr.values.length === 0 ? (
                        <div className="w-full flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm cursor-not-allowed">
                          <span className="text-slate-400">{t('productEditor.noValuesInAttribute')}</span>
                          <svg className="text-slate-300 shrink-0" width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      ) : (
                        <>
                          {/* Спадний список — той самий вигляд, що й у "Додаткові поля" */}
                          <button type="button" onClick={() => toggleAttrOpen(attr.id)}
                            className="w-full flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-left transition-all active:scale-[0.99]">
                            <span className={selectedValues.length > 0 ? 'text-slate-800' : 'text-slate-400'}>
                              {selectedValues.length > 0 ? selectedValues.map(v => tn(v.value, v.valueEn)).join(', ') : t('productEditor.selectPlaceholder')}
                            </span>
                            <svg className="text-slate-400 shrink-0" width="13" height="13" viewBox="0 0 13 13" fill="none"
                              style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                              <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          {isOpen && (
                            <div className="mt-1.5 space-y-1.5">
                              {attr.values.map(v => {
                                const active = selectedIds.has(v.id)
                                return (
                                  <button key={v.id} type="button"
                                    onClick={() => active
                                      ? removeAttributeValue({ productId: existing.id, attributeValueId: v.id })
                                      : addAttributeValue({ productId: existing.id, attributeValueId: v.id })}
                                    className="w-full flex items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-all"
                                    style={active ? { background: '#7c3aed', border: '1px solid #7c3aed' } : { background: '#f5f3ff', border: '1px solid transparent' }}>
                                    <div className="h-4 w-4 rounded-md border-2 flex items-center justify-center shrink-0"
                                      style={{ borderColor: active ? 'white' : '#c4b5fd', background: active ? 'white' : 'transparent' }}>
                                      {active && (
                                        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                                          <path d="M1.5 4.5l2 2 4-4" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                      )}
                                    </div>
                                    <span className="text-xs font-medium" style={{ color: active ? '#fff' : '#7c3aed' }}>{tn(v.value, v.valueEn)}</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Save — фіксована панель, z-40 вище за нижнє меню (z-30), щоб не ховалась під ним */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 pt-3 z-40"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)', background: 'linear-gradient(to top, rgba(248,251,255,1) 80%, transparent)' }}>
        <button onClick={handleSave} disabled={!canSave}
          className="relative flex w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-800 py-4 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition-all">
          {uploadPct !== null && (
            <span className="absolute inset-y-0 left-0 bg-blue-500/40 transition-all" style={{ width: `${uploadPct}%` }} />
          )}
          <span className="relative">
            {uploadPct !== null ? t('productEditor.uploadingPct', { pct: uploadPct })
              : isSaving ? t('productEditor.saving')
              : isNew ? t('productEditor.addProduct') : t('productEditor.saveChanges')}
          </span>
        </button>
      </div>
    </div>
  )
}
