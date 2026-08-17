import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useActiveOrgId } from '../OrgContext'

/* ───────────────────────────────────────────────────────────
   Кастомні поля — конструктор додаткових полів для трьох сутностей
   (матеріали / постачальники / продукти), які адміністратор
   налаштовує сам під конкретний бізнес (Довідники → Кастомні поля).

   Типи полів: text / number / boolean / file (кілька файлів на поле) /
   select (список значень на вибір, свій для кожного визначення поля).

   Значення й файли зберігаються в окремих таблицях на кожну сутність
   (не поліморфно) — узгоджено зі стилем решти бази (product_materials,
   product_attribute_values тощо): нормальні FK з ON DELETE CASCADE.

   organization_id закладений у custom_field_definitions наперед —
   реальної мультитенантності (RLS по організаціях) ще немає, це лише
   підготовка схеми; зараз в базі рівно одна організація.
─────────────────────────────────────────────────────────── */

export type EntityType = 'material' | 'supplier' | 'product'
export type FieldType = 'text' | 'number' | 'boolean' | 'file' | 'select'

const VALUE_TABLE: Record<EntityType, string> = {
  material: 'material_custom_field_values',
  supplier: 'supplier_custom_field_values',
  product: 'product_custom_field_values',
}
const FILE_TABLE: Record<EntityType, string> = {
  material: 'material_custom_field_files',
  supplier: 'supplier_custom_field_files',
  product: 'product_custom_field_files',
}
const ID_COLUMN: Record<EntityType, string> = {
  material: 'material_id',
  supplier: 'supplier_id',
  product: 'product_id',
}

export interface CustomFieldOption {
  id: string
  value: string
  position: number
}

export interface CustomFieldDefinition {
  id: string
  entityType: EntityType
  name: string
  fieldType: FieldType
  isRequired: boolean
  position: number
  options: CustomFieldOption[]
}

export interface CustomFieldFile {
  id: string
  url: string
  filename: string
  position: number
}

export interface CustomFieldValue {
  fieldDefinitionId: string
  valueText: string | null
  valueNumber: number | null
  valueBoolean: boolean | null
  valueOptionId: string | null
}

function friendlyError(error: { message: string; code?: string }): string {
  if (error.code === '23503') return 'Помилка зв\'язку з довідником'
  if (error.code === '23505') return 'Такий запис уже існує'
  return error.message
}

/* ───────────────────────────────────────────────────────────
   Визначення полів (конструктор у Довідниках)
─────────────────────────────────────────────────────────── */

export function useCustomFieldDefinitions(entityType: EntityType) {
  const orgId = useActiveOrgId()
  return useQuery({
    queryKey: ['custom-field-definitions', entityType, orgId],
    queryFn: async (): Promise<CustomFieldDefinition[]> => {
      const { data, error } = await supabase
        .from('custom_field_definitions')
        .select('id, entity_type, name, field_type, is_required, position, custom_field_options(id, value, position)')
        .eq('entity_type', entityType)
        .eq('organization_id', orgId)
        .order('position')
      if (error) throw error
      return data.map(d => ({
        id: d.id,
        entityType: d.entity_type as EntityType,
        name: d.name,
        fieldType: d.field_type as FieldType,
        isRequired: d.is_required,
        position: d.position,
        options: (d.custom_field_options ?? [])
          .slice()
          .sort((a: CustomFieldOption, b: CustomFieldOption) => a.position - b.position)
          .map((o: { id: string; value: string; position: number }) => ({ id: o.id, value: o.value, position: o.position })),
      }))
    },
  })
}

export function useCustomFieldDefinitionMutations(entityType: EntityType) {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['custom-field-definitions', entityType, orgId] })
  const onErr = (error: { message: string; code?: string }) => alert(friendlyError(error))

  const add = useMutation({
    mutationFn: async ({ name, fieldType, isRequired, position }: { name: string; fieldType: FieldType; isRequired: boolean; position: number }) => {
      const { error } = await supabase.from('custom_field_definitions').insert({
        organization_id: orgId, entity_type: entityType, name, field_type: fieldType, is_required: isRequired, position,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const update = useMutation({
    mutationFn: async ({ id, name, isRequired }: { id: string; name: string; isRequired: boolean }) => {
      // Тип поля свідомо не редагується після створення — зміна типу зробила б наявні значення несумісними.
      const { error } = await supabase.from('custom_field_definitions').update({ name, is_required: isRequired }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('custom_field_definitions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const addOption = useMutation({
    mutationFn: async ({ fieldDefinitionId, value, position }: { fieldDefinitionId: string; value: string; position: number }) => {
      const { error } = await supabase.from('custom_field_options').insert({ field_definition_id: fieldDefinitionId, value, position, organization_id: orgId })
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const removeOption = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('custom_field_options').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  return {
    addDefinition: (args: { name: string; fieldType: FieldType; isRequired: boolean; position: number }) => add.mutateAsync(args),
    updateDefinition: (args: { id: string; name: string; isRequired: boolean }) => update.mutateAsync(args),
    removeDefinition: (id: string) => remove.mutate(id),
    addOption: (args: { fieldDefinitionId: string; value: string; position: number }) => addOption.mutateAsync(args),
    removeOption: (id: string) => removeOption.mutate(id),
    isSaving: add.isPending || update.isPending,
  }
}

/* ───────────────────────────────────────────────────────────
   Значення й файли для конкретного екземпляра сутності
─────────────────────────────────────────────────────────── */

export function useCustomFieldValues(entityType: EntityType, entityId: string | null) {
  const idCol = ID_COLUMN[entityType]

  const valuesQ = useQuery({
    queryKey: ['custom-field-values', entityType, entityId],
    enabled: entityId !== null,
    queryFn: async (): Promise<CustomFieldValue[]> => {
      const { data, error } = await supabase
        .from(VALUE_TABLE[entityType])
        .select('field_definition_id, value_text, value_number, value_boolean, value_option_id')
        .eq(idCol, entityId as string)
      if (error) throw error
      return data.map((v: { field_definition_id: string; value_text: string | null; value_number: number | null; value_boolean: boolean | null; value_option_id: string | null }) => ({
        fieldDefinitionId: v.field_definition_id,
        valueText: v.value_text,
        valueNumber: v.value_number !== null ? Number(v.value_number) : null,
        valueBoolean: v.value_boolean,
        valueOptionId: v.value_option_id,
      }))
    },
  })

  const filesQ = useQuery({
    queryKey: ['custom-field-files', entityType, entityId],
    enabled: entityId !== null,
    queryFn: async (): Promise<Record<string, CustomFieldFile[]>> => {
      const { data, error } = await supabase
        .from(FILE_TABLE[entityType])
        .select('id, field_definition_id, url, filename, position')
        .eq(idCol, entityId as string)
        .order('position')
      if (error) throw error
      const grouped: Record<string, CustomFieldFile[]> = {}
      for (const f of data as { id: string; field_definition_id: string; url: string; filename: string | null; position: number }[]) {
        const list = grouped[f.field_definition_id] ?? (grouped[f.field_definition_id] = [])
        list.push({ id: f.id, url: f.url, filename: f.filename ?? '', position: f.position })
      }
      return grouped
    },
  })

  return {
    values: valuesQ.data ?? [],
    files: filesQ.data ?? {},
    isLoading: valuesQ.isLoading || filesQ.isLoading,
  }
}

export function useCustomFieldValueMutations(entityType: EntityType) {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const idCol = ID_COLUMN[entityType]
  const invalidate = (entityId: string) => {
    qc.invalidateQueries({ queryKey: ['custom-field-values', entityType, entityId] })
    qc.invalidateQueries({ queryKey: ['custom-field-files', entityType, entityId] })
  }
  const onErr = (error: { message: string; code?: string }) => alert(friendlyError(error))

  const setValue = useMutation({
    mutationFn: async (args: { entityId: string; fieldDefinitionId: string; valueText?: string | null; valueNumber?: number | null; valueBoolean?: boolean | null; valueOptionId?: string | null }) => {
      const { error } = await supabase.from(VALUE_TABLE[entityType]).upsert({
        [idCol]: args.entityId,
        field_definition_id: args.fieldDefinitionId,
        value_text: args.valueText ?? null,
        value_number: args.valueNumber ?? null,
        value_boolean: args.valueBoolean ?? null,
        value_option_id: args.valueOptionId ?? null,
        updated_at: new Date().toISOString(),
        organization_id: orgId,
      }, { onConflict: `${idCol},field_definition_id` })
      if (error) throw error
    },
    onSuccess: (_d, args) => invalidate(args.entityId),
    onError: onErr,
  })

  const uploadFile = useMutation({
    mutationFn: async ({ entityId, fieldDefinitionId, file }: { entityId: string; fieldDefinitionId: string; file: File }) => {
      const path = `${entityType}/${entityId}/${fieldDefinitionId}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('custom-field-files').upload(path, file)
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('custom-field-files').getPublicUrl(path)
      const { error } = await supabase.from(FILE_TABLE[entityType]).insert({
        [idCol]: entityId, field_definition_id: fieldDefinitionId, url: data.publicUrl, filename: file.name, position: 0, organization_id: orgId,
      })
      if (error) throw error
    },
    onSuccess: (_d, args) => invalidate(args.entityId),
    onError: onErr,
  })

  const removeFile = useMutation({
    mutationFn: async ({ id }: { id: string; entityId: string }) => {
      const { error } = await supabase.from(FILE_TABLE[entityType]).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, args) => invalidate(args.entityId),
    onError: onErr,
  })

  return {
    setValue: (args: { entityId: string; fieldDefinitionId: string; valueText?: string | null; valueNumber?: number | null; valueBoolean?: boolean | null; valueOptionId?: string | null }) => setValue.mutateAsync(args),
    uploadFile: (args: { entityId: string; fieldDefinitionId: string; file: File }) => uploadFile.mutateAsync(args),
    removeFile: (args: { id: string; entityId: string }) => removeFile.mutateAsync(args),
    isSaving: setValue.isPending || uploadFile.isPending,
  }
}
