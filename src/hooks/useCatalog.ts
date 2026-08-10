import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { PRESET_COLORS } from '../lib/colors'

/* ───────────────────────────────────────────────────────────
   Types (id — uuid-рядок з Supabase)
─────────────────────────────────────────────────────────── */

export interface Department {
  id: string
  name: string
  color: string
}

export interface Position {
  id: string
  title: string
  departmentId: string
}

export interface ProductCategory {
  id: string
  name: string
  color: string
  parentId: string | null
}

export interface AttributeValue {
  id: string
  value: string
}

export interface ProductAttribute {
  id: string
  name: string
  /** Чи формує ця характеристика варіанти товару (напр. Колір, Розмір) */
  isVariant: boolean
  values: AttributeValue[]
}

export interface Operation {
  id: string
  name: string
  description: string
}

export interface Unit {
  id: string
  name: string
  shortName: string
}

export interface Warehouse {
  id: string
  name: string
  address: string
  responsible: string
}

export interface MaterialCategory {
  id: string
  name: string
  color: string
  parentId: string | null
}

export interface Supplier {
  id: string
  name: string
  contactPerson: string
  phone: string
  email: string
  address: string
}

const DEFAULT_COLOR = PRESET_COLORS[0].text

/** Пряме створення операції (з поверненням id) — використовується інлайн-формою
 *  додавання операції прямо з інтерфейсу додавання матеріалів до продукту. */
export async function createOperationDirect(name: string, description = ''): Promise<string> {
  const { data, error } = await supabase.from('operations').insert({ name, description }).select('id').single()
  if (error) throw error
  return data.id as string
}

function friendlyError(error: { message: string; code?: string }): string {
  if (error.code === '23503') return 'Неможливо видалити: запис використовується в інших довідниках'
  if (error.code === '23505') return 'Такий запис уже існує'
  return error.message
}

/* ───────────────────────────────────────────────────────────
   Departments
─────────────────────────────────────────────────────────── */

function useDepartmentsQuery() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: async (): Promise<Department[]> => {
      const { data, error } = await supabase.from('departments').select('id, name, color').order('name')
      if (error) throw error
      return data.map(d => ({ id: d.id, name: d.name, color: d.color ?? DEFAULT_COLOR }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Positions
─────────────────────────────────────────────────────────── */

function usePositionsQuery() {
  return useQuery({
    queryKey: ['positions'],
    queryFn: async (): Promise<Position[]> => {
      const { data, error } = await supabase.from('positions').select('id, name, department_id').order('name')
      if (error) throw error
      return data.map(p => ({ id: p.id, title: p.name, departmentId: p.department_id }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Categories
─────────────────────────────────────────────────────────── */

function useCategoriesQuery() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<ProductCategory[]> => {
      const { data, error } = await supabase.from('categories').select('id, name, color, parent_id').order('name')
      if (error) throw error
      return data.map(c => ({ id: c.id, name: c.name, color: c.color ?? DEFAULT_COLOR, parentId: c.parent_id }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Attributes (+ nested values)
─────────────────────────────────────────────────────────── */

function useAttributesQuery() {
  return useQuery({
    queryKey: ['attributes'],
    queryFn: async (): Promise<ProductAttribute[]> => {
      const { data, error } = await supabase
        .from('attributes')
        .select('id, name, is_variant, attribute_values(id, value)')
        .order('name')
      if (error) throw error
      return data.map(a => ({
        id: a.id,
        name: a.name,
        isVariant: a.is_variant,
        values: (a.attribute_values ?? []).map((v: { id: string; value: string }) => ({ id: v.id, value: v.value })),
      }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Operations
─────────────────────────────────────────────────────────── */

function useOperationsQuery() {
  return useQuery({
    queryKey: ['operations'],
    queryFn: async (): Promise<Operation[]> => {
      const { data, error } = await supabase.from('operations').select('id, name, description').order('name')
      if (error) throw error
      return data.map(o => ({
        id: o.id,
        name: o.name,
        description: o.description ?? '',
      }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Units
─────────────────────────────────────────────────────────── */

function useUnitsQuery() {
  return useQuery({
    queryKey: ['units'],
    queryFn: async (): Promise<Unit[]> => {
      const { data, error } = await supabase.from('units').select('id, name, short_name').order('name')
      if (error) throw error
      return data.map(u => ({ id: u.id, name: u.name, shortName: u.short_name }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Warehouses
─────────────────────────────────────────────────────────── */

function useWarehousesQuery() {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: async (): Promise<Warehouse[]> => {
      const { data, error } = await supabase.from('warehouses').select('id, name, address, responsible').order('name')
      if (error) throw error
      return data.map(w => ({ id: w.id, name: w.name, address: w.address ?? '', responsible: w.responsible ?? '' }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Suppliers
─────────────────────────────────────────────────────────── */

function useSuppliersQuery() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await supabase.from('suppliers').select('id, name, contact_person, phone, email, address').order('name')
      if (error) throw error
      return data.map(s => ({
        id: s.id, name: s.name,
        contactPerson: s.contact_person ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '',
      }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Material Categories (окремий каталог — НЕ пов'язаний з categories,
   який належить виключно продуктам)
─────────────────────────────────────────────────────────── */

function useMaterialCategoriesQuery() {
  return useQuery({
    queryKey: ['material-categories'],
    queryFn: async (): Promise<MaterialCategory[]> => {
      const { data, error } = await supabase.from('material_categories').select('id, name, color, parent_id').order('name')
      if (error) throw error
      return data.map(c => ({ id: c.id, name: c.name, color: c.color ?? DEFAULT_COLOR, parentId: c.parent_id }))
    },
  })
}

/* ───────────────────────────────────────────────────────────
   Unified hook — той самий інтерфейс, що й раніше в catalogContext,
   але дані читаються/пишуться напряму в Supabase через React Query.
─────────────────────────────────────────────────────────── */

export function useCatalog() {
  const qc = useQueryClient()

  const departmentsQ = useDepartmentsQuery()
  const positionsQ = usePositionsQuery()
  const categoriesQ = useCategoriesQuery()
  const attributesQ = useAttributesQuery()
  const operationsQ = useOperationsQuery()
  const warehousesQ = useWarehousesQuery()
  const materialCategoriesQ = useMaterialCategoriesQuery()
  const unitsQ = useUnitsQuery()
  const suppliersQ = useSuppliersQuery()

  const isLoading =
    departmentsQ.isLoading || positionsQ.isLoading || categoriesQ.isLoading ||
    attributesQ.isLoading || operationsQ.isLoading || warehousesQ.isLoading ||
    materialCategoriesQ.isLoading || unitsQ.isLoading || suppliersQ.isLoading

  const invalidate = (key: string) => qc.invalidateQueries({ queryKey: [key] })
  const onErr = (error: { message: string; code?: string }) => alert(friendlyError(error))

  /* Departments */
  const addDepartmentM = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const { error } = await supabase.from('departments').insert({ name, color })
      if (error) throw error
    },
    onSuccess: () => invalidate('departments'),
    onError: onErr,
  })
  const updateDepartmentM = useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string }) => {
      const { error } = await supabase.from('departments').update({ name, color }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('departments'),
    onError: onErr,
  })
  const removeDepartmentM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('departments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('departments'),
    onError: onErr,
  })

  /* Positions */
  const addPositionM = useMutation({
    mutationFn: async ({ title, departmentId }: { title: string; departmentId: string }) => {
      const { error } = await supabase.from('positions').insert({ name: title, department_id: departmentId })
      if (error) throw error
    },
    onSuccess: () => invalidate('positions'),
    onError: onErr,
  })
  const updatePositionM = useMutation({
    mutationFn: async ({ id, title, departmentId }: { id: string; title: string; departmentId: string }) => {
      const { error } = await supabase.from('positions').update({ name: title, department_id: departmentId }).eq('id', id)
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
    mutationFn: async ({ name, color, parentId }: { name: string; color: string; parentId: string | null }) => {
      const { error } = await supabase.from('categories').insert({ name, color, parent_id: parentId })
      if (error) throw error
    },
    onSuccess: () => invalidate('categories'),
    onError: onErr,
  })
  const updateCategoryM = useMutation({
    mutationFn: async ({ id, name, color, parentId }: { id: string; name: string; color: string; parentId: string | null }) => {
      const { error } = await supabase.from('categories').update({ name, color, parent_id: parentId }).eq('id', id)
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
    mutationFn: async ({ name, isVariant }: { name: string; isVariant: boolean }) => {
      const { error } = await supabase.from('attributes').insert({ name, is_variant: isVariant })
      if (error) throw error
    },
    onSuccess: () => invalidate('attributes'),
    onError: onErr,
  })
  const updateAttributeM = useMutation({
    mutationFn: async ({ id, name, isVariant }: { id: string; name: string; isVariant: boolean }) => {
      const { error } = await supabase.from('attributes').update({ name, is_variant: isVariant }).eq('id', id)
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
    mutationFn: async ({ attrId, value }: { attrId: string; value: string }) => {
      const { error } = await supabase.from('attribute_values').insert({ attribute_id: attrId, value })
      if (error) throw error
    },
    onSuccess: () => invalidate('attributes'),
    onError: onErr,
  })
  const updateAttributeValueM = useMutation({
    mutationFn: async ({ valueId, value }: { attrId: string; valueId: string; value: string }) => {
      const { error } = await supabase.from('attribute_values').update({ value }).eq('id', valueId)
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
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      const { error } = await supabase.from('operations').insert({ name, description })
      if (error) throw error
    },
    onSuccess: () => invalidate('operations'),
    onError: onErr,
  })
  const updateOperationM = useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name: string; description: string }) => {
      const { error } = await supabase.from('operations').update({ name, description }).eq('id', id)
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
    mutationFn: async ({ name, address, responsible }: { name: string; address: string; responsible: string }) => {
      const { error } = await supabase.from('warehouses').insert({ name, address, responsible })
      if (error) throw error
    },
    onSuccess: () => invalidate('warehouses'),
    onError: onErr,
  })
  const updateWarehouseM = useMutation({
    mutationFn: async ({ id, name, address, responsible }: { id: string; name: string; address: string; responsible: string }) => {
      const { error } = await supabase.from('warehouses').update({ name, address, responsible }).eq('id', id)
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
    mutationFn: async ({ name, color, parentId }: { name: string; color: string; parentId: string | null }) => {
      const { error } = await supabase.from('material_categories').insert({ name, color, parent_id: parentId })
      if (error) throw error
    },
    onSuccess: () => invalidate('material-categories'),
    onError: onErr,
  })
  const updateMaterialCategoryM = useMutation({
    mutationFn: async ({ id, name, color, parentId }: { id: string; name: string; color: string; parentId: string | null }) => {
      const { error } = await supabase.from('material_categories').update({ name, color, parent_id: parentId }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('material-categories'),
    onError: onErr,
  })
  const removeMaterialCategoryM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('material_categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('material-categories'),
    onError: onErr,
  })

  /* Suppliers */
  const addSupplierM = useMutation({
    mutationFn: async ({ name, contactPerson, phone, email, address }: { name: string; contactPerson: string; phone: string; email: string; address: string }) => {
      const { error } = await supabase.from('suppliers').insert({ name, contact_person: contactPerson, phone, email, address })
      if (error) throw error
    },
    onSuccess: () => invalidate('suppliers'),
    onError: onErr,
  })
  const updateSupplierM = useMutation({
    mutationFn: async ({ id, name, contactPerson, phone, email, address }: { id: string; name: string; contactPerson: string; phone: string; email: string; address: string }) => {
      const { error } = await supabase.from('suppliers').update({ name, contact_person: contactPerson, phone, email, address }).eq('id', id)
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
    mutationFn: async ({ name, shortName }: { name: string; shortName: string }) => {
      const { error } = await supabase.from('units').insert({ name, short_name: shortName })
      if (error) throw error
    },
    onSuccess: () => invalidate('units'),
    onError: onErr,
  })
  const updateUnitM = useMutation({
    mutationFn: async ({ id, name, shortName }: { id: string; name: string; shortName: string }) => {
      const { error } = await supabase.from('units').update({ name, short_name: shortName }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate('units'),
    onError: onErr,
  })
  const removeUnitM = useMutation({
    mutationFn: async (id: string) => {
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

    addDepartment: (name: string, color: string) => addDepartmentM.mutate({ name, color }),
    updateDepartment: (id: string, name: string, color: string) => updateDepartmentM.mutate({ id, name, color }),
    removeDepartment: (id: string) => removeDepartmentM.mutate(id),

    addPosition: (title: string, departmentId: string) => addPositionM.mutate({ title, departmentId }),
    updatePosition: (id: string, title: string, departmentId: string) => updatePositionM.mutate({ id, title, departmentId }),
    removePosition: (id: string) => removePositionM.mutate(id),

    addCategory: (name: string, color: string, parentId: string | null) => addCategoryM.mutate({ name, color, parentId }),
    updateCategory: (id: string, name: string, color: string, parentId: string | null) => updateCategoryM.mutate({ id, name, color, parentId }),
    removeCategory: (id: string) => removeCategoryM.mutate(id),

    addSupplier: (name: string, contactPerson: string, phone: string, email: string, address: string) => addSupplierM.mutate({ name, contactPerson, phone, email, address }),
    updateSupplier: (id: string, name: string, contactPerson: string, phone: string, email: string, address: string) => updateSupplierM.mutate({ id, name, contactPerson, phone, email, address }),
    removeSupplier: (id: string) => removeSupplierM.mutate(id),

    addUnit: (name: string, shortName: string) => addUnitM.mutate({ name, shortName }),
    updateUnit: (id: string, name: string, shortName: string) => updateUnitM.mutate({ id, name, shortName }),
    removeUnit: (id: string) => removeUnitM.mutate(id),

    addAttribute: (name: string, isVariant: boolean) => addAttributeM.mutate({ name, isVariant }),
    updateAttribute: (id: string, name: string, isVariant: boolean) => updateAttributeM.mutate({ id, name, isVariant }),
    removeAttribute: (id: string) => removeAttributeM.mutate(id),
    addAttributeValue: (attrId: string, value: string) => addAttributeValueM.mutate({ attrId, value }),
    updateAttributeValue: (attrId: string, valueId: string, value: string) => updateAttributeValueM.mutate({ attrId, valueId, value }),
    removeAttributeValue: (attrId: string, valueId: string) => removeAttributeValueM.mutate({ attrId, valueId }),

    addOperation: (name: string, description: string) => addOperationM.mutate({ name, description }),
    updateOperation: (id: string, name: string, description: string) => updateOperationM.mutate({ id, name, description }),
    removeOperation: (id: string) => removeOperationM.mutate(id),

    addWarehouse: (name: string, address: string, responsible: string) => addWarehouseM.mutate({ name, address, responsible }),
    updateWarehouse: (id: string, name: string, address: string, responsible: string) => updateWarehouseM.mutate({ id, name, address, responsible }),
    removeWarehouse: (id: string) => removeWarehouseM.mutate(id),

    addMaterialCategory: (name: string, color: string, parentId: string | null) => addMaterialCategoryM.mutate({ name, color, parentId }),
    updateMaterialCategory: (id: string, name: string, color: string, parentId: string | null) => updateMaterialCategoryM.mutate({ id, name, color, parentId }),
    removeMaterialCategory: (id: string) => removeMaterialCategoryM.mutate(id),
  }
}
