import { useState, type ReactNode } from 'react'
import { useCustomFieldDefinitionMutations, type CustomFieldDefinition, type CustomFieldFile, type EntityType, type FieldType } from './hooks/useCustomFields'
import { useLocale } from './LocaleContext'
import type { TranslationKey } from './i18n'

/** Значення полів форми, які редагуються локально до збереження —
 *  окремо на кожен тип, щоб можна було тримати "чернетку" незалежно
 *  від того, який тип поля зрештою активний. */
export interface CustomFieldInput {
  text: string
  number: string
  boolean: boolean
  optionId: string | null
}

export function emptyCustomInput(): CustomFieldInput {
  return { text: '', number: '', boolean: false, optionId: null }
}

const FIELD_TYPE_LABEL_KEY: Record<FieldType, TranslationKey> = {
  text: 'customField.typeText', number: 'customField.typeNumber', boolean: 'customField.typeBoolean',
  file: 'customField.typeFile', select: 'customField.typeSelect',
}

/** Обгортка "лейбл + інпут + помилка" — спільний стиль полів форми
 *  для всіх редакторів (матеріал, продукт, постачальник). */
export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
      {children}
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  )
}

/** Поле типу "Список значень" — розгортний спадний список (той самий патерн,
 *  що й категорія/характеристики продукту): клік по шеврону показує наявні
 *  значення радіо-рядками, а внизу — пунктирна кнопка додати нове значення
 *  прямо тут, без переходу в Довідники → Кастомні поля. */
function SelectCustomField({ def, value, onChange, onAddOption }: {
  def: CustomFieldDefinition
  value: string | null
  onChange: (optionId: string | null) => void
  onAddOption: (def: CustomFieldDefinition, value: string, valueEn: string | null) => Promise<string>
}) {
  const { t, tn } = useLocale()
  const [isOpen, setIsOpen] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [newValue, setNewValue] = useState('')
  const [newValueEn, setNewValueEn] = useState('')
  const selected = def.options.find(o => o.id === value) ?? null

  const submit = async () => {
    const v = newValue.trim()
    if (!v) return
    const id = await onAddOption(def, v, newValueEn.trim() || null)
    onChange(id)
    setNewValue('')
    setNewValueEn('')
    setIsAdding(false)
  }

  return (
    <div className="space-y-1.5">
      <button type="button" onClick={() => setIsOpen(o => !o)}
        className="w-full flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-left transition-all active:scale-[0.99]">
        <span className={selected ? 'text-slate-800' : 'text-slate-400'}>
          {selected ? tn(selected.value, selected.valueEn) : t('productEditor.selectPlaceholder')}
        </span>
        <svg className="text-slate-400 shrink-0" width="13" height="13" viewBox="0 0 13 13" fill="none"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {isOpen && (
        <div className="space-y-1.5">
          {def.options.map(o => {
            const active = o.id === value
            return (
              <button key={o.id} type="button" onClick={() => onChange(active ? null : o.id)}
                className="w-full flex items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-all"
                style={active ? { background: '#eff6ff', border: '1px solid #bfdbfe' } : { background: '#f8fafc', border: '1px solid transparent' }}>
                <div className="h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0"
                  style={{ borderColor: active ? '#3b82f6' : '#cbd5e1' }}>
                  {active && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                </div>
                <span className="text-xs font-medium" style={{ color: active ? '#1d4ed8' : '#475569' }}>{tn(o.value, o.valueEn)}</span>
              </button>
            )
          })}
          {def.options.length === 0 && <p className="px-1 text-xs text-slate-300">{t('directory.noValues')}</p>}

          {isAdding ? (
            <div className="flex gap-2 pt-1">
              <input type="text" autoFocus value={newValue} onChange={e => setNewValue(e.target.value)}
                placeholder={t('directory.newValuePlaceholder')}
                onKeyDown={e => e.key === 'Enter' && submit()}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all" />
              <input type="text" value={newValueEn} onChange={e => setNewValueEn(e.target.value)}
                placeholder="English…"
                onKeyDown={e => e.key === 'Enter' && submit()}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all" />
              <button type="button" onClick={submit}
                className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-medium text-white active:scale-95 transition-all">+</button>
            </div>
          ) : (
            <button type="button" onClick={() => setIsAdding(true)}
              className="w-full rounded-xl px-4 py-2.5 text-xs font-medium text-blue-600 transition-all active:scale-[0.99]"
              style={{ border: '1.5px dashed #93c5fd', background: 'rgba(59,130,246,0.04)' }}>
              + {t('customField.addValue')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Секція "Додаткові поля" — рендерить редаговані інпути під кастомні поля
 *  сутності (визначення налаштовуються в Довідниках). Спільна для всіх
 *  редакторів, щоб не дублювати логіку рендеру по типу поля. */
export function CustomFieldsSection({ fields, customInputs, setCustomInput, errors, filesByField, isNew, entityType }: {
  fields: CustomFieldDefinition[]
  customInputs: Record<string, CustomFieldInput>
  setCustomInput: (fieldId: string, patch: Partial<CustomFieldInput>) => void
  errors: Record<string, string>
  filesByField: Record<string, CustomFieldFile[]>
  isNew: boolean
  entityType: EntityType
}) {
  const { t, tn } = useLocale()
  const { addOption } = useCustomFieldDefinitionMutations(entityType)
  const handleAddOption = (def: CustomFieldDefinition, value: string, valueEn: string | null) =>
    addOption({ fieldDefinitionId: def.id, value, valueEn, position: def.options.length })
  if (fields.length === 0) return null
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">{t('materials.customFields')}</label>
      <div className="space-y-3">
        {fields.map(def => {
          const v = customInputs[def.id] ?? emptyCustomInput()
          const error = errors[`field_${def.id}`]
          const filesForField = !isNew ? (filesByField[def.id] ?? []) : []
          return (
            <Field key={def.id} label={tn(def.name, def.nameEn) + (def.isRequired ? ' *' : '')} error={error}>
              {def.fieldType === 'select' ? (
                <SelectCustomField def={def} value={v.optionId}
                  onChange={optionId => setCustomInput(def.id, { optionId })}
                  onAddOption={handleAddOption} />
              ) : def.fieldType === 'boolean' ? (
                <button type="button" onClick={() => setCustomInput(def.id, { boolean: !v.boolean })}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 w-full">
                  <span className="text-sm text-slate-600">{v.boolean ? t('common.yes') : t('common.no')}</span>
                  <span className="relative h-6 w-11 rounded-full transition-all shrink-0" style={{ background: v.boolean ? '#3b82f6' : '#e2e8f0' }}>
                    <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: v.boolean ? '1.375rem' : '0.125rem' }} />
                  </span>
                </button>
              ) : def.fieldType === 'file' ? (
                !isNew ? (
                  <div className="space-y-2">
                    {filesForField.map(f => (
                      <a key={f.id} href={f.url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-blue-600 truncate">
                        <span className="truncate">{f.filename}</span>
                      </a>
                    ))}
                    <p className="text-xs text-slate-400 italic">{t('customField.filesEditAfterSave')}</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">{t('customField.availableAfterSave')}</p>
                )
              ) : (
                <input type={def.fieldType === 'number' ? 'number' : 'text'}
                  value={def.fieldType === 'number' ? v.number : v.text}
                  onChange={e => setCustomInput(def.id, def.fieldType === 'number' ? { number: e.target.value } : { text: e.target.value })}
                  placeholder={def.fieldType === 'number' ? '0' : ''}
                  className={`w-full rounded-2xl border px-4 py-3.5 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-100 ${error ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white focus:border-blue-400'}`} />
              )}
              {!error && def.fieldType !== 'file' && (
                <p className="mt-1 text-[10px] text-slate-300">{t(FIELD_TYPE_LABEL_KEY[def.fieldType])}</p>
              )}
            </Field>
          )
        })}
      </div>
    </div>
  )
}
