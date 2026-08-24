import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useActiveOrgId } from '../OrgContext'
import { useCustomFieldDefinitions, VALUE_TABLE, type EntityType } from './useCustomFields'

/* ───────────────────────────────────────────────────────────
   Дашборди — агрегована статистика по кастомних select-полях
   сутності: скільки записів мають кожне значення. Без жодних
   нових таблиць чи функцій у базі — рахуємо на клієнті з уже
   наявних *_custom_field_values (той самий підхід, що й скрізь
   у застосунку для списків/фільтрів).
─────────────────────────────────────────────────────────── */

const MAIN_TABLE: Record<EntityType, string> = {
  product: 'products',
  material: 'materials',
  supplier: 'suppliers',
}

export interface DashboardFieldValueStat {
  optionId: string
  label: string
  labelEn: string | null
  count: number
  /** count / максимум у цій групі — для ширини бару (0 якщо всі значення поля не використані) */
  fraction: number
}

export interface DashboardFieldStat {
  definitionId: string
  name: string
  nameEn: string | null
  values: DashboardFieldValueStat[]
}

export interface EntityDashboardStats {
  totalCount: number
  fields: DashboardFieldStat[]
  isLoading: boolean
}

export function useDashboardStats(entityType: EntityType): EntityDashboardStats {
  const orgId = useActiveOrgId()
  const definitionsQ = useCustomFieldDefinitions(entityType)

  const countQ = useQuery({
    queryKey: ['dashboard-total-count', entityType, orgId],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase.from(MAIN_TABLE[entityType]).select('id', { count: 'exact', head: true }).eq('organization_id', orgId)
      if (error) throw error
      return count ?? 0
    },
  })

  const valuesQ = useQuery({
    queryKey: ['dashboard-field-values', entityType, orgId],
    queryFn: async (): Promise<{ fieldDefinitionId: string; optionId: string }[]> => {
      const { data, error } = await supabase
        .from(VALUE_TABLE[entityType])
        .select('field_definition_id, value_option_id')
        .eq('organization_id', orgId)
        .not('value_option_id', 'is', null)
      if (error) throw error
      return data.map((r: { field_definition_id: string; value_option_id: string }) => ({ fieldDefinitionId: r.field_definition_id, optionId: r.value_option_id }))
    },
  })

  const definitions = definitionsQ.data ?? []
  const rows = valuesQ.data ?? []

  // Групування O(rows) один раз, а не O(визначення × rows) — і перераховується
  // лише коли самі дані змінились, а не на кожен рендер (напр. кожен кейстрок
  // пошуку на сторінці "Дашборди", де ці компоненти-власники ре-рендеряться).
  const fields: DashboardFieldStat[] = useMemo(() => {
    const countsByDefinition = new Map<string, Map<string, number>>()
    for (const r of rows) {
      let counts = countsByDefinition.get(r.fieldDefinitionId)
      if (!counts) { counts = new Map(); countsByDefinition.set(r.fieldDefinitionId, counts) }
      counts.set(r.optionId, (counts.get(r.optionId) ?? 0) + 1)
    }
    return definitions
      .filter(d => d.fieldType === 'select')
      .map(d => {
        const counts = countsByDefinition.get(d.id) ?? new Map<string, number>()
        const max = Math.max(1, ...d.options.map(o => counts.get(o.id) ?? 0))
        const values = d.options
          .map(o => ({ optionId: o.id, label: o.value, labelEn: o.valueEn, count: counts.get(o.id) ?? 0 }))
          .sort((a, b) => b.count - a.count)
          .map(v => ({ ...v, fraction: v.count / max }))
        return { definitionId: d.id, name: d.name, nameEn: d.nameEn, values }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definitions, rows])

  return {
    totalCount: countQ.data ?? 0,
    fields,
    isLoading: definitionsQ.isLoading || countQ.isLoading || valuesQ.isLoading,
  }
}

/* ───────────────────────────────────────────────────────────
   Деталізація: список записів, що стоять за конкретним значенням
   поля на дашборді (клік на рядок бару відкриває цей список).
─────────────────────────────────────────────────────────── */

export interface DrilldownRecord {
  id: string
  name: string
  /** SKU для продукту, код для матеріалу — null для постачальника */
  code: string | null
  photo: string | null
}

export function useDrilldownRecords(entityType: EntityType, definitionId: string | null, optionId: string | null) {
  const orgId = useActiveOrgId()
  return useQuery({
    queryKey: ['dashboard-drilldown', entityType, definitionId, optionId, orgId],
    enabled: definitionId !== null && optionId !== null,
    queryFn: async (): Promise<DrilldownRecord[]> => {
      if (entityType === 'product') {
        const { data, error } = await supabase
          .from('product_custom_field_values')
          .select('products(id, name, sku, product_images(url, position))')
          .eq('field_definition_id', definitionId as string)
          .eq('value_option_id', optionId as string)
          .eq('organization_id', orgId)
        if (error) throw error
        return data
          .map(r => r.products as unknown as { id: string; name: string; sku: string; product_images: { url: string; position: number }[] } | null)
          .filter((p): p is { id: string; name: string; sku: string; product_images: { url: string; position: number }[] } => p !== null)
          .map(p => {
            const images = (p.product_images ?? []).slice().sort((a, b) => a.position - b.position)
            return { id: p.id, name: p.name, code: p.sku, photo: images[0]?.url ?? null }
          })
      }
      if (entityType === 'material') {
        const { data, error } = await supabase
          .from('material_custom_field_values')
          .select('materials(id, name, code, photo_url)')
          .eq('field_definition_id', definitionId as string)
          .eq('value_option_id', optionId as string)
          .eq('organization_id', orgId)
        if (error) throw error
        return data
          .map(r => r.materials as unknown as { id: string; name: string; code: string | null; photo_url: string | null } | null)
          .filter((m): m is { id: string; name: string; code: string | null; photo_url: string | null } => m !== null)
          .map(m => ({ id: m.id, name: m.name, code: m.code, photo: m.photo_url }))
      }
      const { data, error } = await supabase
        .from('supplier_custom_field_values')
        .select('suppliers(id, name)')
        .eq('field_definition_id', definitionId as string)
        .eq('value_option_id', optionId as string)
        .eq('organization_id', orgId)
      if (error) throw error
      return data
        .map(r => r.suppliers as unknown as { id: string; name: string } | null)
        .filter((s): s is { id: string; name: string } => s !== null)
        .map(s => ({ id: s.id, name: s.name, code: null, photo: null }))
    },
  })
}
