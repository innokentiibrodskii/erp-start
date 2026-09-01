import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/* ───────────────────────────────────────────────────────────
   "Information about raw materials" — перегляд чернетки імпорту сировини
   (Supabase-схема draft.*, завантажена окремо CSV-експортом, ще не звірена
   й не перенесена у робочі таблиці проєкту). Дані НЕ прив'язані до
   organization_id — це один спільний імпорт, не мультитенантні дані, тому
   тут немає useActiveOrgId на відміну від решти хуків.

   draft.* саму по собі API не віддає (RLS enabled, жодної policy, схема не
   в переліку "exposed" для PostgREST) — читаємо через view у public
   (public.draft_raw_materials / public.draft_raw_material_characteristics,
   sql/draft_raw_materials.sql), яка належить власнику таблиць draft.* й тому
   обходить їхній RLS, а GRANT SELECT видано лише на сам view.

   35 814 рядків — надто багато, щоб вантажити все одразу (як решта
   довідників у проєкті): пошук і пагінація виконуються на боці бази
   (.range()), а не на клієнті.
─────────────────────────────────────────────────────────── */

const PAGE_SIZE = 40

export interface DraftRawMaterial {
  idMaterial: number
  externalUuidMaterial: string
  name: string
  article: string | null
  code: string | null
  percentageOfDefects: number | null
  colorFamily: string | null
  color: string | null
  size: string | null
  category: string | null
  country: string | null
  supplierPrice: number | null
  controlPrice: number | null
  minimumOrderQuantity: number | null
  productionTime: number | null
  productionTimeDetails: number | null
  deliveryTime: number | null
  supplierNomenclature: string | null
  statusForDeletion: boolean
  designNameForPatterns: string | null
  createdAt: number | null
  createdBy: string | null
  updatedAt: number | null
  updatedBy: string | null
  /** Немає довідникової таблиці в самому імпорті, що їх розшифровує —
   *  лишаються "сирими" uuid, як і в базі. */
  externalUuidType: string | null
  externalUuidTypeDecor: string | null
  materialTypeName: string | null
  nomenclatureGroupName: string | null
  materialsGroupName: string | null
  hierarchyGroupName: string | null
  hierarchyParentGroupName: string | null
  appointmentName: string | null
  providerName: string | null
}

export interface DraftMaterialCharacteristic {
  id: number
  value: string | null
  createdAt: number | null
  createdBy: string | null
}

type RawRow = {
  id_material: number
  external_uuid_material: string
  name_material: string
  article_bas_erp: string | null
  code_bas_erp: string | null
  percentage_of_defects: string | null
  color_family: string | null
  color: string | null
  size: string | null
  category: string | null
  country: string | null
  supplier_price: string | null
  control_price: string | null
  minimum_order_quantity: string | null
  production_time: string | null
  production_time_details: string | null
  delivery_time: string | null
  supplier_nomenclature: string | null
  status_for_deletion: boolean
  design_name_for_patterns: string | null
  created_at: string | null
  created_by: string | null
  updated_at: string | null
  updated_by: string | null
  external_uuid_type: string | null
  external_uuid_type_decor: string | null
  name_material_type: string | null
  name_nomenclature_group: string | null
  name_materials_group: string | null
  hierarchy_group_name: string | null
  hierarchy_parent_group_name: string | null
  name_appointment: string | null
  name_provider: string | null
}

const num = (v: string | null): number | null => (v === null ? null : parseFloat(v))
const time = (v: string | null): number | null => (v === null ? null : new Date(v).getTime())

function mapRow(r: RawRow): DraftRawMaterial {
  return {
    idMaterial: r.id_material,
    externalUuidMaterial: r.external_uuid_material,
    name: r.name_material,
    article: r.article_bas_erp,
    code: r.code_bas_erp,
    percentageOfDefects: num(r.percentage_of_defects),
    colorFamily: r.color_family,
    color: r.color,
    size: r.size,
    category: r.category,
    country: r.country,
    supplierPrice: num(r.supplier_price),
    controlPrice: num(r.control_price),
    minimumOrderQuantity: num(r.minimum_order_quantity),
    productionTime: num(r.production_time),
    productionTimeDetails: num(r.production_time_details),
    deliveryTime: num(r.delivery_time),
    supplierNomenclature: r.supplier_nomenclature,
    statusForDeletion: r.status_for_deletion,
    designNameForPatterns: r.design_name_for_patterns,
    createdAt: time(r.created_at),
    createdBy: r.created_by,
    updatedAt: time(r.updated_at),
    updatedBy: r.updated_by,
    externalUuidType: r.external_uuid_type,
    externalUuidTypeDecor: r.external_uuid_type_decor,
    materialTypeName: r.name_material_type,
    nomenclatureGroupName: r.name_nomenclature_group,
    materialsGroupName: r.name_materials_group,
    hierarchyGroupName: r.hierarchy_group_name,
    hierarchyParentGroupName: r.hierarchy_parent_group_name,
    appointmentName: r.name_appointment,
    providerName: r.name_provider,
  }
}

/** `,`/`(`/`)` ламають синтаксис .or() у PostgREST — прибираємо їх із пошукового
 *  рядка, а `%`/`_` екрануємо, щоб вони не діяли як спецсимволи ILIKE. */
const sanitizeSearch = (s: string) => s.trim().replace(/[,()]/g, ' ').trim().replace(/[%_]/g, c => `\\${c}`)

export interface DraftMaterialsFilters {
  /** Масив — користувач може обрати кілька варіантів одразу (порожній
   *  масив = "Всі", без фільтра); у запиті йде через .in(). */
  materialTypeUuids: string[]
  nomenclatureGroupUuids: string[]
  materialsGroupUuids: string[]
  /** За замовчуванням true — приховує рядки з status_for_deletion, як
   *  showArchived у MaterialStock.tsx (не показувати "сміття" імпорту одразу). */
  hideMarkedForDeletion: boolean
}

export const DEFAULT_DRAFT_MATERIALS_FILTERS: DraftMaterialsFilters = {
  materialTypeUuids: [],
  nomenclatureGroupUuids: [],
  materialsGroupUuids: [],
  hideMarkedForDeletion: true,
}

export function useDraftMaterials(search: string, page: number, filters: DraftMaterialsFilters) {
  return useQuery({
    queryKey: ['draft-raw-materials', search, page, filters],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ items: DraftRawMaterial[]; hasMore: boolean }> => {
      let query = supabase.from('draft_raw_materials').select('*').order('id_material')
      const term = sanitizeSearch(search)
      if (term) {
        query = query.or(
          `name_material.ilike.%${term}%,article_bas_erp.ilike.%${term}%,code_bas_erp.ilike.%${term}%,supplier_nomenclature.ilike.%${term}%`
        )
      }
      if (filters.materialTypeUuids.length > 0) query = query.in('external_uuid_material_type', filters.materialTypeUuids)
      if (filters.nomenclatureGroupUuids.length > 0) query = query.in('external_uuid_nomenclature_group', filters.nomenclatureGroupUuids)
      if (filters.materialsGroupUuids.length > 0) query = query.in('external_uuid_name_materials_group', filters.materialsGroupUuids)
      if (filters.hideMarkedForDeletion) query = query.eq('status_for_deletion', false)
      const from = page * PAGE_SIZE
      const { data, error } = await query.range(from, from + PAGE_SIZE)
      if (error) throw error
      return { items: data.slice(0, PAGE_SIZE).map(mapRow), hasMore: data.length > PAGE_SIZE }
    },
  })
}

export interface DraftLookupOption {
  id: string
  name: string
  /** Скільки матеріалів справді належать цьому довідниковому запису — усього
   *  й без status_for_deletion. UI ховає записи з 0 (заведені в BAS ERP, але
   *  порожні) — а який саме рахунок дивитись, залежить від чекбоксу
   *  "показувати позначені на видалення". */
  totalCount: number
  activeCount: number
}

const LOOKUP_STALE_TIME = 5 * 60 * 1000 // статичні довідники — не варто перезапитувати щохвилини

export function useDraftMaterialTypes() {
  return useQuery({
    queryKey: ['draft-material-types'],
    staleTime: LOOKUP_STALE_TIME,
    queryFn: async (): Promise<DraftLookupOption[]> => {
      const { data, error } = await supabase.from('draft_material_types').select('external_uuid_material_type, name_material_type, total_count, active_count')
      if (error) throw error
      return data.map(r => ({ id: r.external_uuid_material_type as string, name: r.name_material_type as string, totalCount: r.total_count, activeCount: r.active_count }))
    },
  })
}

export function useDraftNomenclatureGroups() {
  return useQuery({
    queryKey: ['draft-nomenclature-groups'],
    staleTime: LOOKUP_STALE_TIME,
    queryFn: async (): Promise<DraftLookupOption[]> => {
      const { data, error } = await supabase.from('draft_nomenclature_groups').select('external_uuid_nomenclature_group, name_nomenclature_group, total_count, active_count')
      if (error) throw error
      return data.map(r => ({ id: r.external_uuid_nomenclature_group as string, name: r.name_nomenclature_group as string, totalCount: r.total_count, activeCount: r.active_count }))
    },
  })
}

export function useDraftMaterialsGroups() {
  return useQuery({
    queryKey: ['draft-materials-groups'],
    staleTime: LOOKUP_STALE_TIME,
    queryFn: async (): Promise<DraftLookupOption[]> => {
      const { data, error } = await supabase.from('draft_materials_groups').select('external_uuid_name_materials_group, name_materials_group, total_count, active_count')
      if (error) throw error
      return data.map(r => ({ id: r.external_uuid_name_materials_group as string, name: r.name_materials_group as string, totalCount: r.total_count, activeCount: r.active_count }))
    },
  })
}

export function useDraftMaterialCharacteristics(externalUuidMaterial: string | null) {
  return useQuery({
    queryKey: ['draft-material-characteristics', externalUuidMaterial],
    enabled: !!externalUuidMaterial,
    queryFn: async (): Promise<DraftMaterialCharacteristic[]> => {
      const { data, error } = await supabase
        .from('draft_raw_material_characteristics')
        .select('id_characteristics_materials, value, created_at, created_by')
        .eq('external_uuid_material', externalUuidMaterial as string)
        .order('id_characteristics_materials')
      if (error) throw error
      return data.map(r => ({
        id: r.id_characteristics_materials,
        value: r.value,
        createdAt: time(r.created_at),
        createdBy: r.created_by,
      }))
    },
  })
}
