import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useActiveOrgId } from '../OrgContext'
import { useLocale } from '../LocaleContext'
import type { TranslationKey } from '../i18n'
import { friendlyReferenceOrDuplicateError as friendlyError } from '../lib/errors'
import { showErrorToast } from '../lib/toast'

/* ───────────────────────────────────────────────────────────
   Друковані форми — іменовані шаблони полів для друку (Налаштування →
   "Друкована форма"): які поля сутності показувати на друкованій A4-формі.
   Наразі лише entity_type='product'; 'material'/'employee' зарезервовані.

   field_key вбудованого поля — один з PRODUCT_BUILTIN_FIELDS[].key;
   кастомне поле сутності записується як `custom:<custom_field_definitions.id>`.

   Якщо поле "photo" увімкнене, шаблон додатково може обрати конкретні
   статуси фото (Довідники → "Статуси фото"), які саме потрапляють у друк —
   `photo-status:<photo_statuses.id>`, по одному запису на кожен обраний
   статус. Якщо жодного такого запису нема (старі шаблони, або свідомо не
   обрано жодного) — printProductForm.ts фолбечиться на загальний гейтинг
   за photo_statuses.is_visible (як і в перегляді продукту).
─────────────────────────────────────────────────────────── */

export type PrintFormEntityType = 'product' | 'material' | 'employee'

export const CUSTOM_FIELD_KEY_PREFIX = 'custom:'
export const customFieldKey = (definitionId: string) => `${CUSTOM_FIELD_KEY_PREFIX}${definitionId}`
export const isCustomFieldKey = (fieldKey: string) => fieldKey.startsWith(CUSTOM_FIELD_KEY_PREFIX)
export const customFieldDefinitionId = (fieldKey: string) => fieldKey.slice(CUSTOM_FIELD_KEY_PREFIX.length)

export const PHOTO_STATUS_KEY_PREFIX = 'photo-status:'
export const photoStatusFieldKey = (statusId: string) => `${PHOTO_STATUS_KEY_PREFIX}${statusId}`
export const isPhotoStatusFieldKey = (fieldKey: string) => fieldKey.startsWith(PHOTO_STATUS_KEY_PREFIX)
export const photoStatusIdFromFieldKey = (fieldKey: string) => fieldKey.slice(PHOTO_STATUS_KEY_PREFIX.length)

/** Набір явно обраних статусів фото (Довідники → "Статуси фото") із
 *  fieldKeys шаблону — спільна логіка для printProductForm.ts (сам друк)
 *  і PrintFormsPage.tsx (прогрів кешу трансформованих фото наперед). */
export const selectedPhotoStatusIds = (fieldKeys: string[]): Set<string> =>
  new Set(fieldKeys.filter(isPhotoStatusFieldKey).map(photoStatusIdFromFieldKey))

export interface BuiltinField {
  key: string
  labelKey: TranslationKey
}

/** Вбудовані поля продукту, доступні в конструкторі шаблону — у тому ж
 *  порядку, у якому показуються чекбоксом (PrintFormsPage.tsx). */
export const PRODUCT_BUILTIN_FIELDS: BuiltinField[] = [
  { key: 'photo', labelKey: 'printForms.field.photo' },
  { key: 'name', labelKey: 'printForms.field.name' },
  { key: 'sku', labelKey: 'printForms.field.sku' },
  { key: 'description', labelKey: 'printForms.field.description' },
  { key: 'status', labelKey: 'printForms.field.status' },
  { key: 'category', labelKey: 'printForms.field.category' },
  { key: 'qr', labelKey: 'printForms.field.qr' },
]

export interface PrintFormTemplate {
  id: string
  entityType: PrintFormEntityType
  name: string
  createdAt: number
  fieldKeys: string[]
}

export function usePrintFormTemplates(entityType: PrintFormEntityType) {
  const orgId = useActiveOrgId()
  return useQuery({
    queryKey: ['print-form-templates', entityType, orgId],
    queryFn: async (): Promise<PrintFormTemplate[]> => {
      const { data, error } = await supabase
        .from('print_form_templates')
        .select('id, entity_type, name, created_at, print_form_template_fields(field_key, position)')
        .eq('entity_type', entityType)
        .eq('organization_id', orgId)
        .order('created_at')
      if (error) throw error
      return data.map(row => ({
        id: row.id,
        entityType: row.entity_type as PrintFormEntityType,
        name: row.name,
        createdAt: new Date(row.created_at).getTime(),
        fieldKeys: (row.print_form_template_fields ?? [])
          .slice()
          .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
          .map((f: { field_key: string }) => f.field_key),
      }))
    },
  })
}

export function usePrintFormTemplateMutations(entityType: PrintFormEntityType) {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const { t } = useLocale()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['print-form-templates', entityType, orgId] })
  const onErr = (error: { message: string; code?: string }) => showErrorToast(friendlyError(error, t))

  const writeFields = async (templateId: string, fieldKeys: string[]) => {
    const { error: delError } = await supabase.from('print_form_template_fields').delete().eq('template_id', templateId)
    if (delError) throw delError
    if (fieldKeys.length === 0) return
    const { error: insError } = await supabase.from('print_form_template_fields').insert(
      fieldKeys.map((field_key, position) => ({ template_id: templateId, field_key, position }))
    )
    if (insError) throw insError
  }

  const add = useMutation({
    mutationFn: async ({ name, fieldKeys }: { name: string; fieldKeys: string[] }) => {
      const { data, error } = await supabase.from('print_form_templates')
        .insert({ organization_id: orgId, entity_type: entityType, name })
        .select('id').single()
      if (error) throw error
      await writeFields(data.id, fieldKeys)
      return data.id as string
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const update = useMutation({
    mutationFn: async ({ id, name, fieldKeys }: { id: string; name: string; fieldKeys: string[] }) => {
      const { error } = await supabase.from('print_form_templates').update({ name }).eq('id', id)
      if (error) throw error
      await writeFields(id, fieldKeys)
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('print_form_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  return {
    addTemplate: (args: { name: string; fieldKeys: string[] }) => add.mutateAsync(args),
    updateTemplate: (args: { id: string; name: string; fieldKeys: string[] }) => update.mutateAsync(args),
    removeTemplate: (id: string) => remove.mutate(id),
    isSaving: add.isPending || update.isPending,
  }
}
