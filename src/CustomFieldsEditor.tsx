import type { ReactNode } from 'react'
import type { CustomFieldDefinition, CustomFieldFile, FieldType } from './hooks/useCustomFields'

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

const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: 'Текст', number: 'Число', boolean: 'Булеве значення', file: 'Файл(и)', select: 'Список значень',
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

/** Секція "Додаткові поля" — рендерить редаговані інпути під кастомні поля
 *  сутності (визначення налаштовуються в Довідниках). Спільна для всіх
 *  редакторів, щоб не дублювати логіку рендеру по типу поля. */
export function CustomFieldsSection({ fields, customInputs, setCustomInput, errors, filesByField, isNew }: {
  fields: CustomFieldDefinition[]
  customInputs: Record<string, CustomFieldInput>
  setCustomInput: (fieldId: string, patch: Partial<CustomFieldInput>) => void
  errors: Record<string, string>
  filesByField: Record<string, CustomFieldFile[]>
  isNew: boolean
}) {
  if (fields.length === 0) return null
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Додаткові поля</label>
      <div className="space-y-3">
        {fields.map(def => {
          const v = customInputs[def.id] ?? emptyCustomInput()
          const error = errors[`field_${def.id}`]
          const filesForField = !isNew ? (filesByField[def.id] ?? []) : []
          return (
            <Field key={def.id} label={def.name + (def.isRequired ? ' *' : '')} error={error}>
              {def.fieldType === 'select' ? (
                <div className="relative">
                  <select value={v.optionId ?? ''} onChange={e => setCustomInput(def.id, { optionId: e.target.value || null })}
                    className="w-full appearance-none rounded-2xl border border-slate-200 bg-white pl-4 pr-10 py-3.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
                    <option value="">— Оберіть —</option>
                    {def.options.map(o => <option key={o.id} value={o.id}>{o.value}</option>)}
                  </select>
                  <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              ) : def.fieldType === 'boolean' ? (
                <button type="button" onClick={() => setCustomInput(def.id, { boolean: !v.boolean })}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 w-full">
                  <span className="text-sm text-slate-600">{v.boolean ? 'Так' : 'Ні'}</span>
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
                    <p className="text-xs text-slate-400 italic">Файли редагуються після збереження</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Доступно після збереження</p>
                )
              ) : (
                <input type={def.fieldType === 'number' ? 'number' : 'text'}
                  value={def.fieldType === 'number' ? v.number : v.text}
                  onChange={e => setCustomInput(def.id, def.fieldType === 'number' ? { number: e.target.value } : { text: e.target.value })}
                  placeholder={def.fieldType === 'number' ? '0' : ''}
                  className={`w-full rounded-2xl border px-4 py-3.5 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-100 ${error ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white focus:border-blue-400'}`} />
              )}
              {!error && def.fieldType !== 'file' && (
                <p className="mt-1 text-[10px] text-slate-300">{FIELD_TYPE_LABEL[def.fieldType]}</p>
              )}
            </Field>
          )
        })}
      </div>
    </div>
  )
}
