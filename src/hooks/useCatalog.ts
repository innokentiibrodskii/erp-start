import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { PRESET_COLORS } from '../lib/colors'
import { useActiveOrgId } from '../OrgContext'
import { useLocale } from '../LocaleContext'
import type { TranslationKey } from '../i18n'

/* ───────────────────────────────────────────────────────────
   Types (id — uuid-рядок з Supabase)
─────────────────────────────────────────────────────────── */

export interface Department {
  id: string
  name: string
  /** Англійський відповідник — вноситься вручну в адмінці; для укр. мови
   *  показується поряд з українською назвою, для англ. — замінює її. */
  nameEn: string | null
  color: string
}

export interface Position {
  id: string
  title: string
  titleEn: string | null
  departmentId: string
}

export interface ProductCategory {
  id: string
  name: string
  nameEn: string | null
  color: string
  parentId: string | null
}

export interface AttributeValue {
  id: string
  value: string
  valueEn: string | null
}

export interface ProductAttribute {
  id: string
  name: string
  nameEn: string | null
  /** Чи формує ця характеристика варіанти товару (напр. Колір, Розмір) */
  isVariant: boolean
  values: AttributeValue[]
}

export interface Operation {
  id: string
  name: string
  nameEn: string | null
  description: string
}

export interface Unit {
  id: string
  name: string
  nameEn: string | null
  shortName: string
  shortNameEn: string | null
}

export interface Warehouse {
  id: string
  name: string
  nameEn: string | null
  address: string
  responsible: string
}

export interface MaterialCategory {
  id: string
  name: string
  nameEn: string | null
  color: string
  parentId: string | null
  /** Скорочення для артикула матеріалу (напр. "M", "MS") — унікальне серед категорій з тим самим батьком */
  shortCode: string | null
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'H', Ґ: 'G', Д: 'D', Е: 'E', Є: 'IE', Ж: 'ZH', З: 'Z',
  И: 'Y', І: 'I', Ї: 'I', Й: 'I', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P',
  Р: 'R', С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'KH', Ц: 'TS', Ч: 'CH', Ш: 'SH', Щ: 'SHCH',
  Ь: '', Ю: 'IU', Я: 'IA',
}

/** Транслітерує кирилицю в латиницю (щоб код категорії не містив кириличних літер,
 *  які візуально збігаються з латинськими, але не рівні їм як символи — інакше
 *  перевірка унікальності могла б пропустити справжню колізію). */
function transliterate(text: string): string {
  return text.toUpperCase().split('').map(ch => CYRILLIC_TO_LATIN[ch] ?? ch).join('')
}

/** Генерує скорочення категорії (усі літери великі, латиницею), унікальне серед переданих
 *  кодів (зазвичай — кодів сусідніх категорій з тим самим батьком): перша літера назви;
 *  якщо зайнята — додає наступні літери назви, поки не стане унікальним. */
export function genCategoryShortCode(name: string, existingCodes: (string | null)[]): string {
  const clean = transliterate(name.trim())
  if (!clean) return ''
  const used = new Set(existingCodes.filter((c): c is string => !!c))
  for (let len = 1; len <= clean.length; len++) {
    const candidate = clean.slice(0, len).toUpperCase()
    if (!used.has(candidate)) return candidate
  }
  let i = 2
  let candidate = `${clean[0].toUpperCase()}${i}`
  while (used.has(candidate)) { i++; candidate = `${clean[0].toUpperCase()}${i}` }
  return candidate
}

export interface Supplier {
  id: string
  name: string
  nameEn: string | null
  contactPerson: string
  phone: string
  email: string
  address: string
}

const DEFAULT_COLOR = PRESET_COLORS[0].text

/** Пряме створення операції (з поверненням id) — використовується інлайн-формою
 *  додавання операції прямо з інтерфейсу додавання матеріалів до продукту. */
export async function createOperationDirect(organizationId: string, name: string, description = ''): Promise<string> {
  const { data, error } = await supabase.from('operations').insert({ name, description, organization_id: organizationId }).select('id').single()
  if (error) throw error
  return data.id as string
}

function friendlyError(error: { message: string; code?: string }, t: (key: TranslationKey) => string): string {
  if (error.code === '23503') return t('errors.cannotDeleteInUse')
  if (error.code === '23505') return t('errors.alreadyExists')
  return error.message
}

/* ───────────────────────────────────────────────────────────
   Departments
─────────────────────────────────────────────────────────── */

function useDepartmentsQuery(orgId: string) {
  return useQuery({
    queryKey: ['departments', orgId],
    queryFn: async (): Promise<Department[]> => {
      const { data, error } = await supabase.from('departments').select('id, name, name_en, color').eq('organization_id', orgId).order('name')
      if (error) throw error
      return data.map(d => ({ id: d.id, name: d.name, nameEn: d.name_en, color: d.color ?? DEFAULT_COLOR }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Positions
─────────────────────────────────────────────────────────── */

function usePositionsQuery(orgId: string) {
  return useQuery({
    queryKey: ['positions', orgId],
    queryFn: async (): Promise<Position[]> => {
      const { data, error } = await supabase.from('positions').select('id, name, name_en, department_id').eq('organization_id', orgId).order('name')
      if (error) throw error
      return data.map(p => ({ id: p.id, title: p.name, titleEn: p.name_en, departmentId: p.department_id }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Categories
─────────────────────────────────────────────────────────── */

function useCategoriesQuery(orgId: string) {
  return useQuery({
    queryKey: ['categories', orgId],
    queryFn: async (): Promise<ProductCategory[]> => {
      const { data, error } = await supabase.from('categories').select('id, name, name_en, color, parent_id').eq('organization_id', orgId).order('name')
      if (error) throw error
      return data.map(c => ({ id: c.id, name: c.name, nameEn: c.name_en, color: c.color ?? DEFAULT_COLOR, parentId: c.parent_id }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Attributes (+ nested values)
─────────────────────────────────────────────────────────── */

function useAttributesQuery(orgId: string) {
  return useQuery({
    queryKey: ['attributes', orgId],
    queryFn: async (): Promise<ProductAttribute[]> => {
      const { data, error } = await supabase
        .from('attributes')
        .select('id, name, name_en, is_variant, attribute_values(id, value, value_en)')
        .eq('organization_id', orgId)
        .order('name')
      if (error) throw error
      return data.map(a => ({
        id: a.id,
        name: a.name,
        nameEn: a.name_en,
        isVariant: a.is_variant,
        values: (a.attribute_values ?? []).map((v: { id: string; value: string; value_en: string | null }) => ({ id: v.id, value: v.value, valueEn: v.value_en })),
      }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Operations
─────────────────────────────────────────────────────────── */

function useOperationsQuery(orgId: string) {
  return useQuery({
    queryKey: ['operations', orgId],
    queryFn: async (): Promise<Operation[]> => {
      const { data, error } = await supabase.from('operations').select('id, name, name_en, description').eq('organization_id', orgId).order('name')
      if (error) throw error
      return data.map(o => ({
        id: o.id,
        name: o.name,
        nameEn: o.name_en,
        description: o.description ?? '',
      }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Units
─────────────────────────────────────────────────────────── */

function useUnitsQuery(orgId: string) {
  return useQuery({
    queryKey: ['units', orgId],
    queryFn: async (): Promise<Unit[]> => {
      const { data, error } = await supabase.from('units').select('id, name, name_en, short_name, short_name_en').eq('organization_id', orgId).order('name')
      if (error) throw error
      return data.map(u => ({ id: u.id, name: u.name, nameEn: u.name_en, shortName: u.short_name, shortNameEn: u.short_name_en }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Warehouses
─────────────────────────────────────────────────────────── */

function useWarehousesQuery(orgId: string) {
  return useQuery({
    queryKey: ['warehouses', orgId],
    queryFn: async (): Promise<Warehouse[]> => {
      const { data, error } = await supabase.from('warehouses').select('id, name, name_en, address, responsible').eq('organization_id', orgId).order('name')
      if (error) throw error
      return data.map(w => ({ id: w.id, name: w.name, nameEn: w.name_en, address: w.address ?? '', responsible: w.responsible ?? '' }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Suppliers
─────────────────────────────────────────────────────────── */

function useSuppliersQuery(orgId: string) {
  return useQuery({
    queryKey: ['suppliers', orgId],
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await supabase.from('suppliers').select('id, name, name_en, contact_person, phone, email, address').eq('organization_id', orgId).order('name')
      if (error) throw error
      return data.map(s => ({
        id: s.id, name: s.name, nameEn: s.name_en,
        contactPerson: s.contact_person ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '',
      }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Material Categories (окремий каталог — НЕ пов'язаний з categories,
   який належить виключно продуктам)
─────────────────────────────────────────────────────────── */

function useMaterialCategoriesQuery(orgId: string) {
  return useQuery({
    queryKey: ['material-categories', orgId],
    queryFn: async (): Promise<MaterialCategory[]> => {
      const { data, error } = await supabase.from('material_categories').select('id, name, name_en, color, parent_id, short_code').eq('organization_id', orgId).order('name')
      if (error) throw error
      return data.map(c => ({ id: c.id, name: c.name, nameEn: c.name_en, color: c.color ?? DEFAULT_COLOR, parentId: c.parent_id, shortCode: c.short_code }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Unified hook — той самий інтерфейс, що й раніше в catalogContext,
   але дані читаються/пишуться напряму в Supabase через React Query.
─────────────────────────────────────────────────────────── */

export function useCatalog() {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const { t } = useLocale()

  const departmentsQ = useDepartmentsQuery(orgId)
  const positionsQ = usePositionsQuery(orgId)
  const categoriesQ = useCategoriesQuery(orgId)
  const attributesQ = useAttributesQuery(orgId)
  const operationsQ = useOperationsQuery(orgId)
  const warehousesQ = useWarehousesQuery(orgId)
  const materialCategoriesQ = useMaterialCategoriesQuery(orgId)
  const unitsQ = useUnitsQuery(orgId)
  const suppliersQ = useSuppliersQuery(orgId)

  const isLoading =
    departmentsQ.isLoading || positionsQ.isLoading || categoriesQ.isLoading ||
    attributesQ.isLoading || operationsQ.isLoading || warehousesQ.isLoading ||
    materialCategoriesQ.isLoading || unitsQ.isLoading || suppliersQ.isLoading

  const invalidate = (key: string) => qc.invalidateQueries({ queryKey: [key, orgId] })
  const onErr = (error: { message: string; code?: string }) => alert(friendlyError(error, t))

  /* Departments */
  const addDepartmentM = useMutation({
    mutationFn: async ({ name, nameEn, color }: { name: string; nameEn: string | null; color: string }) => {
      const { error } = await supabase.from('departments').insert({ name, name_en: nameEn, color, organization_id: orgId })
      if (error) throw error
    },
    onSuccess: () => invalidate('departments'),
    onError: onErr,
  })
  const updateDepartmentM = useMutation({
    mutationFn: async ({ id, name, nameEn, color }: { id: string; name: string; nameEn: string | null; color: string }) => {
      const { error } = await supabase.from('departments').update({ name, name_en: nameEn, color }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('departments'),
    onError: onErr,
  })
  const removeDepartmentM = useMutation({
    mutationFn: async (id: string) => {
      const { data: deptPositions, error: posErr } = await supabase.from('positions').select('id').eq('department_id', id)
      if (posErr) throw posErr
      const positionIds = (deptPositions ?? []).map(p => p.id)
      if (positionIds.length > 0) {
        const { count, error: countErr } = await supabase
          .from('user_positions').select('user_id', { count: 'exact', head: true }).in('position_id', positionIds)
        if (countErr) throw countErr
        if ((count ?? 0) > 0) throw new Error(t('errors.cannotDeleteDeptHasEmployees'))
      }
      const { error } = await supabase.from('departments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('departments'),
    onError: onErr,
  })

  /* Positions */
  const addPositionM = useMutation({
    mutationFn: async ({ title, titleEn, departmentId }: { title: string; titleEn: string | null; departmentId: string }) => {
      const { error } = await supabase.from('positions').insert({ name: title, name_en: titleEn, department_id: departmentId, organization_id: orgId })
      if (error) throw error
    },
    onSuccess: () => invalidate('positions'),
    onError: onErr,
  })
  const updatePositionM = useMutation({
    mutationFn: async ({ id, title, titleEn, departmentId }: { id: string; title: string; titleEn: string | null; departmentId: string }) => {
      const { error } = await supabase.from('positions').update({ name: title, name_en: titleEn, department_id: departmentId }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('positions'),
    onError: onErr,
  })
  const removePositionM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('positions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('positions'),
    onError: onErr,
  })

  /* Categories */
  const addCategoryM = useMutation({
    mutationFn: async ({ name, nameEn, color, parentId }: { name: string; nameEn: string | null; color: string; parentId: string | null }) => {
      const { error } = await supabase.from('categories').insert({ name, name_en: nameEn, color, parent_id: parentId, organization_id: orgId })
      if (error) throw error
    },
    onSuccess: () => invalidate('categories'),
    onError: onErr,
  })
  const updateCategoryM = useMutation({
    mutationFn: async ({ id, name, nameEn, color, parentId }: { id: string; name: string; nameEn: string | null; color: string; parentId: string | null }) => {
      const { error } = await supabase.from('categories').update({ name, name_en: nameEn, color, parent_id: parentId }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('categories'),
    onError: onErr,
  })
  const removeCategoryM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('categories'),
    onError: onErr,
  })

  /* Attributes */
  const addAttributeM = useMutation({
    mutationFn: async ({ name, nameEn, isVariant }: { name: string; nameEn: string | null; isVariant: boolean }) => {
      const { error } = await supabase.from('attributes').insert({ name, name_en: nameEn, is_variant: isVariant, organization_id: orgId })
      if (error) throw error
    },
    onSuccess: () => invalidate('attributes'),
    onError: onErr,
  })
  const updateAttributeM = useMutation({
    mutationFn: async ({ id, name, nameEn, isVariant }: { id: string; name: string; nameEn: string | null; isVariant: boolean }) => {
      const { error } = await supabase.from('attributes').update({ name, name_en: nameEn, is_variant: isVariant }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('attributes'),
    onError: onErr,
  })
  const removeAttributeM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('attributes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('attributes'),
    onError: onErr,
  })
  const addAttributeValueM = useMutation({
    mutationFn: async ({ attrId, value, valueEn }: { attrId: string; value: string; valueEn: string | null }) => {
      const { error } = await supabase.from('attribute_values').insert({ attribute_id: attrId, value, value_en: valueEn, organization_id: orgId })
      if (error) throw error
    },
    onSuccess: () => invalidate('attributes'),
    onError: onErr,
  })
  const updateAttributeValueM = useMutation({
    mutationFn: async ({ valueId, value, valueEn }: { attrId: string; valueId: string; value: string; valueEn: string | null }) => {
      const { error } = await supabase.from('attribute_values').update({ value, value_en: valueEn }).eq('id', valueId)
      if (error) throw error
    },
    onSuccess: () => invalidate('attributes'),
    onError: onErr,
  })
  const removeAttributeValueM = useMutation({
    mutationFn: async ({ valueId }: { attrId: string; valueId: string }) => {
      const { error } = await supabase.from('attribute_values').delete().eq('id', valueId)
      if (error) throw error
    },
    onSuccess: () => invalidate('attributes'),
    onError: onErr,
  })

  /* Operations */
  const addOperationM = useMutation({
    mutationFn: async ({ name, nameEn, description }: { name: string; nameEn: string | null; description: string }) => {
      const { error } = await supabase.from('operations').insert({ name, name_en: nameEn, description, organization_id: orgId })
      if (error) throw error
    },
    onSuccess: () => invalidate('operations'),
    onError: onErr,
  })
  const updateOperationM = useMutation({
    mutationFn: async ({ id, name, nameEn, description }: { id: string; name: string; nameEn: string | null; description: string }) => {
      const { error } = await supabase.from('operations').update({ name, name_en: nameEn, description }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('operations'),
    onError: onErr,
  })
  const removeOperationM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('operations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('operations'),
    onError: onErr,
  })

  /* Warehouses */
  const addWarehouseM = useMutation({
    mutationFn: async ({ name, nameEn, address, responsible }: { name: string; nameEn: string | null; address: string; responsible: string }) => {
      const { error } = await supabase.from('warehouses').insert({ name, name_en: nameEn, address, responsible, organization_id: orgId })
      if (error) throw error
    },
    onSuccess: () => invalidate('warehouses'),
    onError: onErr,
  })
  const updateWarehouseM = useMutation({
    mutationFn: async ({ id, name, nameEn, address, responsible }: { id: string; name: string; nameEn: string | null; address: string; responsible: string }) => {
      const { error } = await supabase.from('warehouses').update({ name, name_en: nameEn, address, responsible }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('warehouses'),
    onError: onErr,
  })
  const removeWarehouseM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('warehouses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('warehouses'),
    onError: onErr,
  })

  /* Material Categories */
  const addMaterialCategoryM = useMutation({
    mutationFn: async ({ name, nameEn, color, parentId }: { name: string; nameEn: string | null; color: string; parentId: string | null }) => {
      const siblingCodes = (materialCategoriesQ.data ?? []).filter(c => c.parentId === parentId).map(c => c.shortCode)
      const shortCode = genCategoryShortCode(name, siblingCodes)
      const { error } = await supabase.from('material_categories').insert({ name, name_en: nameEn, color, parent_id: parentId, short_code: shortCode, organization_id: orgId })
      if (error) throw error
    },
    onSuccess: () => invalidate('material-categories'),
    onError: onErr,
  })
  const updateMaterialCategoryM = useMutation({
    mutationFn: async ({ id, name, nameEn, color, parentId }: { id: string; name: string; nameEn: string | null; color: string; parentId: string | null }) => {
      const { error } = await supabase.from('material_categories').update({ name, name_en: nameEn, color, parent_id: parentId }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('material-categories'),
    onError: onErr,
  })
  const removeMaterialCategoryM = useMutation({
    mutationFn: async (id: string) => {
      const { count, error: countErr } = await supabase
        .from('materials').select('id', { count: 'exact', head: true }).eq('category_id', id)
      if (countErr) throw countErr
      if ((count ?? 0) > 0) throw new Error(t('errors.cannotDeleteCategoryInUse'))
      const { error } = await supabase.from('material_categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('material-categories'),
    onError: onErr,
  })

  /* Suppliers */
  const addSupplierM = useMutation({
    mutationFn: async ({ name, nameEn, contactPerson, phone, email, address }: { name: string; nameEn: string | null; contactPerson: string; phone: string; email: string; address: string }) => {
      const { error } = await supabase.from('suppliers').insert({ name, name_en: nameEn, contact_person: contactPerson, phone, email, address, organization_id: orgId })
      if (error) throw error
    },
    onSuccess: () => invalidate('suppliers'),
    onError: onErr,
  })
  const updateSupplierM = useMutation({
    mutationFn: async ({ id, name, nameEn, contactPerson, phone, email, address }: { id: string; name: string; nameEn: string | null; contactPerson: string; phone: string; email: string; address: string }) => {
      const { error } = await supabase.from('suppliers').update({ name, name_en: nameEn, contact_person: contactPerson, phone, email, address }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('suppliers'),
    onError: onErr,
  })
  const removeSupplierM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('suppliers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('suppliers'),
    onError: onErr,
  })

  /* Units */
  const addUnitM = useMutation({
    mutationFn: async ({ name, nameEn, shortName, shortNameEn }: { name: string; nameEn: string | null; shortName: string; shortNameEn: string | null }) => {
      const { error } = await supabase.from('units').insert({ name, name_en: nameEn, short_name: shortName, short_name_en: shortNameEn, organization_id: orgId })
      if (error) throw error
    },
    onSuccess: () => invalidate('units'),
    onError: onErr,
  })
  const assertUnitUnused = async (id: string, action: 'change' | 'delete') => {
    const { count, error: countErr } = await supabase
      .from('materials').select('id', { count: 'exact', head: true }).eq('unit_id', id)
    if (countErr) throw countErr
    if ((count ?? 0) > 0) throw new Error(t(action === 'change' ? 'errors.unitInUseChange' : 'errors.unitInUseDelete'))
  }
  const updateUnitM = useMutation({
    mutationFn: async ({ id, name, nameEn, shortName, shortNameEn }: { id: string; name: string; nameEn: string | null; shortName: string; shortNameEn: string | null }) => {
      await assertUnitUnused(id, 'change')
      const { error } = await supabase.from('units').update({ name, name_en: nameEn, short_name: shortName, short_name_en: shortNameEn }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('units'),
    onError: onErr,
  })
  const removeUnitM = useMutation({
    mutationFn: async (id: string) => {
      await assertUnitUnused(id, 'delete')
      const { error } = await supabase.from('units').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('units'),
    onError: onErr,
  })

  return {
    isLoading,
    departments: departmentsQ.data ?? [],
    positions: positionsQ.data ?? [],
    categories: categoriesQ.data ?? [],
    attributes: attributesQ.data ?? [],
    operations: operationsQ.data ?? [],
    warehouses: warehousesQ.data ?? [],
    materialCategories: materialCategoriesQ.data ?? [],
    units: unitsQ.data ?? [],
    suppliers: suppliersQ.data ?? [],

    addDepartment: (name: string, color: string, nameEn: string | null = null) => addDepartmentM.mutate({ name, nameEn, color }),
    updateDepartment: (id: string, name: string, color: string, nameEn: string | null = null) => updateDepartmentM.mutate({ id, name, nameEn, color }),
    removeDepartment: (id: string) => removeDepartmentM.mutate(id),

    addPosition: (title: string, departmentId: string, titleEn: string | null = null) => addPositionM.mutate({ title, titleEn, departmentId }),
    updatePosition: (id: string, title: string, departmentId: string, titleEn: string | null = null) => updatePositionM.mutate({ id, title, titleEn, departmentId }),
    removePosition: (id: string) => removePositionM.mutate(id),

    addCategory: (name: string, color: string, parentId: string | null, nameEn: string | null = null) => addCategoryM.mutate({ name, nameEn, color, parentId }),
    updateCategory: (id: string, name: string, color: string, parentId: string | null, nameEn: string | null = null) => updateCategoryM.mutate({ id, name, nameEn, color, parentId }),
    removeCategory: (id: string) => removeCategoryM.mutate(id),

    addSupplier: (name: string, contactPerson: string, phone: string, email: string, address: string, nameEn: string | null = null) => addSupplierM.mutate({ name, nameEn, contactPerson, phone, email, address }),
    updateSupplier: (id: string, name: string, contactPerson: string, phone: string, email: string, address: string, nameEn: string | null = null) => updateSupplierM.mutate({ id, name, nameEn, contactPerson, phone, email, address }),
    removeSupplier: (id: string) => removeSupplierM.mutate(id),

    addUnit: (name: string, shortName: string, nameEn: string | null = null, shortNameEn: string | null = null) => addUnitM.mutate({ name, nameEn, shortName, shortNameEn }),
    updateUnit: (id: string, name: string, shortName: string, nameEn: string | null = null, shortNameEn: string | null = null) => updateUnitM.mutate({ id, name, nameEn, shortName, shortNameEn }),
    removeUnit: (id: string) => removeUnitM.mutate(id),

    addAttribute: (name: string, isVariant: boolean, nameEn: string | null = null) => addAttributeM.mutate({ name, nameEn, isVariant }),
    updateAttribute: (id: string, name: string, isVariant: boolean, nameEn: string | null = null) => updateAttributeM.mutate({ id, name, nameEn, isVariant }),
    removeAttribute: (id: string) => removeAttributeM.mutate(id),
    addAttributeValue: (attrId: string, value: string, valueEn: string | null = null) => addAttributeValueM.mutate({ attrId, value, valueEn }),
    updateAttributeValue: (attrId: string, valueId: string, value: string, valueEn: string | null = null) => updateAttributeValueM.mutate({ attrId, valueId, value, valueEn }),
    removeAttributeValue: (attrId: string, valueId: string) => removeAttributeValueM.mutate({ attrId, valueId }),

    addOperation: (name: string, description: string, nameEn: string | null = null) => addOperationM.mutate({ name, nameEn, description }),
    updateOperation: (id: string, name: string, description: string, nameEn: string | null = null) => updateOperationM.mutate({ id, name, nameEn, description }),
    removeOperation: (id: string) => removeOperationM.mutate(id),

    addWarehouse: (name: string, address: string, responsible: string, nameEn: string | null = null) => addWarehouseM.mutate({ name, nameEn, address, responsible }),
    updateWarehouse: (id: string, name: string, address: string, responsible: string, nameEn: string | null = null) => updateWarehouseM.mutate({ id, name, nameEn, address, responsible }),
    removeWarehouse: (id: string) => removeWarehouseM.mutate(id),

    addMaterialCategory: (name: string, color: string, parentId: string | null, nameEn: string | null = null) => addMaterialCategoryM.mutate({ name, nameEn, color, parentId }),
    updateMaterialCategory: (id: string, name: string, color: string, parentId: string | null, nameEn: string | null = null) => updateMaterialCategoryM.mutate({ id, name, nameEn, color, parentId }),
    removeMaterialCategory: (id: string) => removeMaterialCategoryM.mutate(id),
  }
}
