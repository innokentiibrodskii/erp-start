import { useState, useEffect } from 'react'
import QRCodeLib from 'react-qr-code'
import { useLocale } from './LocaleContext'
import { useOrg } from './OrgContext'
import { SubPageHeader, BottomSheet, SheetTitle, Field, Input, SheetActions, EditButton, DeleteButton } from './DirectoryCatalog'
import ConfirmDeleteModal from './ConfirmDeleteModal'
import {
  usePrintFormTemplates, usePrintFormTemplateMutations, PRODUCT_BUILTIN_FIELDS,
  customFieldKey, isCustomFieldKey, customFieldDefinitionId,
  photoStatusFieldKey, isPhotoStatusFieldKey, selectedPhotoStatusIds, type PrintFormTemplate,
} from './hooks/usePrintFormTemplates'
import { useCustomFieldDefinitions, useAllCustomFieldValues, type CustomFieldDefinition } from './hooks/useCustomFields'
import { useProducts, useProductStatuses, usePhotoStatuses } from './hooks/useProducts'
import { useCatalog } from './hooks/useCatalog'
import { printProductForm, toPrintImageUrl, HERO_PHOTO_WIDTH, EXTRA_PHOTO_WIDTH } from './lib/printProductForm'

/* ───────────────────────────────────────────────────────────
   Налаштування → "Друкована форма": іменовані шаблони полів для друку.
   Наразі лише категорія "Продукти" (Матеріали/Працівники — заглушки "скоро").
   Референс верстки друкованого виводу — Figma-макет, див. lib/printProductForm.ts.
─────────────────────────────────────────────────────────── */

/** Псевдо-значення фільтра за кастомним полем: продукт, для якого це поле
 *  взагалі не заповнене (не плутати з boolean=false — це відсутність рядка
 *  в custom_field_values). */
const FILTER_UNSET = '__unset__'

export default function PrintFormsPage({ onBack }: { onBack: () => void }) {
  const { t, tn } = useLocale()
  const { activeOrgName } = useOrg()
  const [view, setView] = useState<'categories' | 'templates' | 'print'>('categories')

  const templatesQ = usePrintFormTemplates('product')
  const templates = templatesQ.data ?? []
  const { addTemplate, updateTemplate, removeTemplate } = usePrintFormTemplateMutations('product')

  const customDefsQ = useCustomFieldDefinitions('product')
  const customDefs = customDefsQ.data ?? []
  const photoStatusesQ = usePhotoStatuses()
  const photoStatuses = photoStatusesQ.data ?? []

  const [form, setForm] = useState<{ open: boolean; editing: PrintFormTemplate | null; name: string; fieldKeys: string[] }>(
    { open: false, editing: null, name: '', fieldKeys: [] })
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [printTemplate, setPrintTemplate] = useState<PrintFormTemplate | null>(null)

  const openAdd = () => setForm({ open: true, editing: null, name: '', fieldKeys: PRODUCT_BUILTIN_FIELDS.map(f => f.key) })
  const openEdit = (tmpl: PrintFormTemplate) => setForm({ open: true, editing: tmpl, name: tmpl.name, fieldKeys: tmpl.fieldKeys })
  const closeForm = () => setForm(f => ({ ...f, open: false }))
  const toggleField = (key: string) => setForm(f => ({
    ...f,
    fieldKeys: f.fieldKeys.includes(key) ? f.fieldKeys.filter(k => k !== key) : [...f.fieldKeys, key],
  }))

  const saveTemplate = async () => {
    if (!form.name.trim()) return
    if (form.editing) await updateTemplate({ id: form.editing.id, name: form.name.trim(), fieldKeys: form.fieldKeys })
    else await addTemplate({ name: form.name.trim(), fieldKeys: form.fieldKeys })
    closeForm()
  }

  const fieldLabel = (key: string): string => {
    if (isCustomFieldKey(key)) {
      const def = customDefs.find(d => d.id === customFieldDefinitionId(key))
      return def ? tn(def.name, def.nameEn) : ''
    }
    const builtin = PRODUCT_BUILTIN_FIELDS.find(f => f.key === key)
    return builtin ? t(builtin.labelKey) : key
  }

  if (view === 'categories') {
    return (
      <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <SubPageHeader title={t('printForms.title')} subtitle={t('printForms.categoriesSubtitle')} onBack={onBack} />
        <div className="px-4 py-4 space-y-3">
          <button onClick={() => setView('templates')}
            className="flex w-full items-center justify-between rounded-2xl bg-white p-4 text-left active:scale-[0.99] transition-all"
            style={{ border: '1px solid rgba(157,200,255,0.22)' }}>
            <span className="text-sm font-semibold text-slate-800">{t('printForms.categoryProducts')}</span>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-slate-300 -rotate-90">
              <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {[t('printForms.categoryMaterials'), t('printForms.categoryEmployees')].map(label => (
            <div key={label} className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 opacity-60">
              <span className="text-sm font-medium text-slate-400">{label}</span>
              <span className="text-[10px] text-slate-300">{t('printForms.comingSoon')}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (view === 'print' && printTemplate) {
    return (
      <PrintFilterView template={printTemplate} customDefs={customDefs} fieldLabel={fieldLabel}
        orgName={activeOrgName} onBack={() => setView('templates')} />
    )
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title={t('printForms.categoryProducts')} subtitle={t('printForms.templatesSubtitle', { count: templates.length })}
        onBack={() => setView('categories')} onAdd={openAdd} />
      <div className="px-4 py-4 space-y-3 pb-8">
        {templates.length === 0 && <p className="py-10 text-center text-sm text-slate-400">{t('printForms.noTemplatesYet')}</p>}
        {templates.map(tmpl => (
          <div key={tmpl.id} className="rounded-2xl bg-white p-4" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{tmpl.name}</p>
                <p className="text-xs text-slate-400">{t('printForms.fieldCount', { count: tmpl.fieldKeys.filter(k => !isPhotoStatusFieldKey(k)).length })}</p>
              </div>
              <EditButton onEdit={() => openEdit(tmpl)} />
              <DeleteButton onDelete={() => setConfirmDeleteId(tmpl.id)} />
            </div>
            <button onClick={() => { setPrintTemplate(tmpl); setView('print') }}
              className="mt-3 w-full rounded-xl bg-slate-800 py-2.5 text-xs font-medium text-white active:scale-95 transition-all">
              {t('printForms.printButton')}
            </button>
          </div>
        ))}
      </div>

      {form.open && (
        <BottomSheet onClose={closeForm}>
          <SheetTitle>{form.editing ? t('printForms.editTemplate') : t('printForms.newTemplate')}</SheetTitle>
          <div className="px-5 space-y-4 pb-2">
            <Field label={t('printForms.templateNameLabel')}>
              <Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder={t('printForms.templateNamePlaceholder')} />
            </Field>
            <Field label={t('printForms.fieldsLabel')}>
              <div className="space-y-2">
                {PRODUCT_BUILTIN_FIELDS.map(f => (
                  <div key={f.key}>
                    <label className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 cursor-pointer">
                      <span className="text-sm text-slate-600">{t(f.labelKey)}</span>
                      <input type="checkbox" checked={form.fieldKeys.includes(f.key)} onChange={() => toggleField(f.key)}
                        className="h-4 w-4 rounded accent-slate-800" />
                    </label>
                    {/* Якщо увімкнено "Фото" — опційно обрати конкретні статуси
                       (Довідники → "Статуси фото"), які саме фото друкувати.
                       Нічого не обрано → фолбек на загальний is_visible
                       (printProductForm.ts), як і в перегляді продукту. */}
                    {f.key === 'photo' && form.fieldKeys.includes('photo') && photoStatuses.length > 0 && (
                      <div className="ml-3 mt-2 space-y-1.5 border-l-2 border-slate-100 pl-3">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{t('printForms.photoStatusFilterLabel')}</p>
                        {photoStatuses.map(s => {
                          const key = photoStatusFieldKey(s.id)
                          return (
                            <label key={key} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 cursor-pointer"
                              style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
                              <span className="flex items-center gap-2 text-xs text-slate-600">
                                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                                {tn(s.name, s.nameEn)}
                              </span>
                              <input type="checkbox" checked={form.fieldKeys.includes(key)} onChange={() => toggleField(key)}
                                className="h-3.5 w-3.5 rounded accent-slate-800" />
                            </label>
                          )
                        })}
                        <p className="text-[10px] text-slate-300">{t('printForms.photoStatusFilterHint')}</p>
                      </div>
                    )}
                  </div>
                ))}
                {customDefs.map(d => {
                  const key = customFieldKey(d.id)
                  return (
                    <label key={key} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 cursor-pointer">
                      <span className="text-sm text-slate-600">{tn(d.name, d.nameEn)}</span>
                      <input type="checkbox" checked={form.fieldKeys.includes(key)} onChange={() => toggleField(key)}
                        className="h-4 w-4 rounded accent-slate-800" />
                    </label>
                  )
                })}
              </div>
            </Field>
          </div>
          <SheetActions onCancel={closeForm} onSave={saveTemplate} saveLabel={form.editing ? t('common.save') : t('common.add')} disabled={!form.name.trim()} />
        </BottomSheet>
      )}

      {confirmDeleteId && (
        <ConfirmDeleteModal message={t('printForms.deleteConfirm')} onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => { removeTemplate(confirmDeleteId); setConfirmDeleteId(null) }} />
      )}
    </div>
  )
}

/** Крок після "Друкувати" на шаблоні — легкий фільтр (пошук/категорія/статус),
 *  далі "Сформувати" відкриває вікно друку (lib/printProductForm.ts). */
function PrintFilterView({ template, customDefs, fieldLabel, orgName, onBack }: {
  template: PrintFormTemplate
  customDefs: CustomFieldDefinition[]
  fieldLabel: (key: string) => string
  orgName: string
  onBack: () => void
}) {
  const { t, tn } = useLocale()
  const productsQ = useProducts()
  const products = (productsQ.data ?? []).filter(p => !p.archived)
  const statusesQ = useProductStatuses()
  const statuses = statusesQ.data ?? []
  const { categories } = useCatalog()
  const customValuesQ = useAllCustomFieldValues('product')
  const customValues = customValuesQ.data ?? []

  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [statusId, setStatusId] = useState('')
  // Фільтр за кастомним полем продукту — той самий двокроковий патерн
  // (спершу яке поле, тоді значення), що вже є в ProductCatalog.tsx, але тут
  // друге значення — множинний вибір (fieldValueIds): можна позначити
  // декілька варіантів одразу (об'єднання, OR), а FILTER_UNSET — окремий
  // "псевдо-варіант" для продуктів, у яких це поле взагалі не заповнене
  // (немає жодного рядка в custom_field_values для цього поля).
  const [fieldId, setFieldId] = useState('')
  const [fieldValueIds, setFieldValueIds] = useState<string[]>([])
  const filterableFields = customDefs.filter(f => f.fieldType === 'select' || f.fieldType === 'boolean')
  const field = customDefs.find(f => f.id === fieldId) ?? null
  const toggleFieldValue = (id: string) =>
    setFieldValueIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])

  const matchingFieldProductIds = (() => {
    if (!field || fieldValueIds.length === 0) return null
    const realIds = fieldValueIds.filter(id => id !== FILTER_UNSET)
    const matches = new Set(
      customValues
        .filter(v => v.fieldDefinitionId === field.id && (
          field.fieldType === 'boolean' ? realIds.includes(String(v.valueBoolean)) : v.valueOptionId !== null && realIds.includes(v.valueOptionId)
        ))
        .map(v => v.entityId)
    )
    if (fieldValueIds.includes(FILTER_UNSET)) {
      const withValueIds = new Set(customValues.filter(v => v.fieldDefinitionId === field.id).map(v => v.entityId))
      for (const p of products) if (!withValueIds.has(p.id)) matches.add(p.id)
    }
    return matches
  })()

  const filtered = products.filter(p => {
    const q = search.trim().toLowerCase()
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    const matchCat = !categoryId || p.categoryId === categoryId
    const matchStatus = !statusId || p.statusId === statusId
    const matchField = matchingFieldProductIds === null || matchingFieldProductIds.has(p.id)
    return matchSearch && matchCat && matchStatus && matchField
  })

  // Прогрів кешу трансформованих фото (Supabase render/image) у фоні, поки
  // користувач ще на екрані фільтра. Перший запит кожного унікального
  // url (ширина+якість) сам Supabase стискає "наживо" — це помітно
  // повільніше за оригінал; лише ПОВТОРНИЙ запит того самого url швидкий
  // (кеш). Без цього прогріву вся ця затримка припадала б на клік
  // "Сформувати". Обмежено 40 продуктами (щоб не влаштовувати штурм мережі,
  // якщо фільтр іще майже нічого не звузив) і дебаунсом 400 мс (щоб не
  // палити запити на кожне натискання клавіші під час пошуку) —
  // filteredIds замість самого filtered, бо новий масив-референс
  // створюється щорендеру, навіть якщо список продуктів не змінився.
  const filteredIds = filtered.map(p => p.id).join(',')
  useEffect(() => {
    if (!template.fieldKeys.includes('photo')) return
    const timer = setTimeout(() => {
      const statusIds = selectedPhotoStatusIds(template.fieldKeys)
      for (const p of filtered.slice(0, 40)) {
        const photos = (p.photos ?? [])
          .filter(ph => statusIds.size > 0 ? (ph.statusId !== null && statusIds.has(ph.statusId)) : ph.isVisible)
          .map(ph => ph.url)
        if (photos[0]) new Image().src = toPrintImageUrl(photos[0], HERO_PHOTO_WIDTH)
        for (const url of photos.slice(1, 4)) new Image().src = toPrintImageUrl(url, EXTRA_PHOTO_WIDTH)
      }
    }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredIds, template.fieldKeys])

  // "qr" друкується як інлайн-SVG-рядок, зчитаний з реально змонтованих
  // (прихованих) <QRCodeLib> нижче — той самий прийом, що вже є в
  // lib/qrLabel.ts, без react-dom/server (див. коментар у printProductForm.ts).
  const includesQr = template.fieldKeys.includes('qr')
  const generate = () => {
    const qrSvgByProductId: Record<string, string> = {}
    if (includesQr) {
      for (const p of filtered) {
        const el = document.getElementById(`print-qr-${p.id}`)
        if (el) qrSvgByProductId[p.id] = el.outerHTML
      }
    }
    printProductForm(filtered, template.fieldKeys, categories, statuses, customDefs, customValues, qrSvgByProductId, orgName, template.name, fieldLabel, tn)
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title={template.name} subtitle={t('printForms.filterTitle')} onBack={onBack} />
      {includesQr && (
        <div className="hidden">
          {filtered.map(p => (
            <QRCodeLib key={p.id} id={`print-qr-${p.id}`} value={`${window.location.origin}/?product=${p.id}`} size={120} />
          ))}
        </div>
      )}
      <div className="px-4 pt-3 space-y-3">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('printForms.filterSearchPlaceholder')}
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
        <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-all">
          <option value="">{t('printForms.filterAllCategories')}</option>
          {categories.map(c => <option key={c.id} value={c.id}>{tn(c.name, c.nameEn)}</option>)}
        </select>
        <select value={statusId} onChange={e => setStatusId(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-all">
          <option value="">{t('printForms.filterAllStatuses')}</option>
          {statuses.map(s => <option key={s.id} value={s.id}>{tn(s.name, s.nameEn)}</option>)}
        </select>
        {filterableFields.length > 0 && (
          <>
            <select value={fieldId} onChange={e => { setFieldId(e.target.value); setFieldValueIds([]) }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-all">
              <option value="">{t('filters.allFields')}</option>
              {filterableFields.map(f => <option key={f.id} value={f.id}>{tn(f.name, f.nameEn)}</option>)}
            </select>
            {/* Множинний вибір значень (чекбокси, а не select) + окремий
               псевдо-варіант "Не заповнено" для продуктів без цього поля.
               Нічого не позначено → фолбек на "будь-яке значення" (без
               фільтра), той самий патерн, що й photoStatusFilter вище. */}
            {field && (
              <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2">
                <label className="flex items-center justify-between rounded-lg bg-white px-3 py-2 cursor-pointer"
                  style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
                  <span className="text-sm text-slate-600">{t('printForms.filterNotSet')}</span>
                  <input type="checkbox" checked={fieldValueIds.includes(FILTER_UNSET)} onChange={() => toggleFieldValue(FILTER_UNSET)}
                    className="h-4 w-4 rounded accent-slate-800" />
                </label>
                {(field.fieldType === 'boolean'
                  ? [['true', t('common.yes')], ['false', t('common.no')]]
                  : field.options.map(o => [o.id, tn(o.value, o.valueEn)] as [string, string])
                ).map(([val, label]) => (
                  <label key={val} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 cursor-pointer"
                    style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
                    <span className="text-sm text-slate-600">{label}</span>
                    <input type="checkbox" checked={fieldValueIds.includes(val)} onChange={() => toggleFieldValue(val)}
                      className="h-4 w-4 rounded accent-slate-800" />
                  </label>
                ))}
                <p className="text-[10px] text-slate-400 px-1">{t('printForms.filterValueHint')}</p>
              </div>
            )}
          </>
        )}
      </div>
      <div className="px-4 py-6">
        <p className="text-center text-xs text-slate-400 mb-4">{t('printForms.matchingCount', { count: filtered.length })}</p>
        <button onClick={generate} disabled={filtered.length === 0}
          className="w-full rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition-all">
          {t('printForms.generateButton')}
        </button>
      </div>
    </div>
  )
}
