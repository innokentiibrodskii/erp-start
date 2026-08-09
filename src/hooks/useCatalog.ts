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
  values: AttributeValue[]
}

export interface Operation {
  id: string
  name: string
  description: string
  unit: string
}

export interface Warehouse {
  id: string
  name: string
  address: string
  responsible: string
}

const DEFAULT_COLOR = PRESET_COLORS[0].text

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
        .select('id, name, attribute_values(id, value)')
        .order('name')
      if (error) throw error
      return data.map(a => ({
        id: a.id,
        name: a.name,
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
      const { data, error } = await supabase.from('operations').select('id, name, description, unit').order('name')
      if (error) throw error
      return data.map(o => ({ id: o.id, name: o.name, description: o.description ?? '', unit: o.unit }))
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

  const isLoading =
    departmentsQ.isLoading || positionsQ.isLoading || categoriesQ.isLoading ||
    attributesQ.isLoading || operationsQ.isLoading || warehousesQ.isLoading

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
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('attributes').insert({ name })
      if (error) throw error
    },
    onSuccess: () => invalidate('attributes'),
    onError: onErr,
  })
  const updateAttributeM = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('attributes').update({ name }).eq('id', id)
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
    mutationFn: async ({ name, description, unit }: { name: string; description: string; unit: string }) => {
      const { error } = await supabase.from('operations').insert({ name, description, unit })
      if (error) throw error
    },
    onSuccess: () => invalidate('operations'),
    onError: onErr,
  })
  const updateOperationM = useMutation({
    mutationFn: async ({ id, name, description, unit }: { id: string; name: string; description: string; unit: string }) => {
      const { error } = await supabase.from('operations').update({ name, description, unit }).eq('id', id)
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

  return {
    isLoading,
    departments: departmentsQ.data ?? [],
    positions: positionsQ.data ?? [],
    categories: categoriesQ.data ?? [],
    attributes: attributesQ.data ?? [],
    operations: operationsQ.data ?? [],
    warehouses: warehousesQ.data ?? [],

    addDepartment: (name: string, color: string) => addDepartmentM.mutate({ name, color }),
    updateDepartment: (id: string, name: string, color: string) => updateDepartmentM.mutate({ id, name, color }),
    removeDepartment: (id: string) => removeDepartmentM.mutate(id),

    addPosition: (title: string, departmentId: string) => addPositionM.mutate({ title, departmentId }),
    updatePosition: (id: string, title: string, departmentId: string) => updatePositionM.mutate({ id, title, departmentId }),
    removePosition: (id: string) => removePositionM.mutate(id),

    addCategory: (name: string, color: string, parentId: string | null) => addCategoryM.mutate({ name, color, parentId }),
    updateCategory: (id: string, name: string, color: string, parentId: string | null) => updateCategoryM.mutate({ id, name, color, parentId }),
    removeCategory: (id: string) => removeCategoryM.mutate(id),

    addAttribute: (name: string) => addAttributeM.mutate(name),
    updateAttribute: (id: string, name: string) => updateAttributeM.mutate({ id, name }),
    removeAttribute: (id: string) => removeAttributeM.mutate(id),
    addAttributeValue: (attrId: string, value: string) => addAttributeValueM.mutate({ attrId, value }),
    updateAttributeValue: (attrId: string, valueId: string, value: string) => updateAttributeValueM.mutate({ attrId, valueId, value }),
    removeAttributeValue: (attrId: string, valueId: string) => removeAttributeValueM.mutate({ attrId, valueId }),

    addOperation: (name: string, description: string, unit: string) => addOperationM.mutate({ name, description, unit }),
    updateOperation: (id: string, name: string, description: string, unit: string) => updateOperationM.mutate({ id, name, description, unit }),
    removeOperation: (id: string) => removeOperationM.mutate(id),

    addWarehouse: (name: string, address: string, responsible: string) => addWarehouseM.mutate({ name, address, responsible }),
    updateWarehouse: (id: string, name: string, address: string, responsible: string) => updateWarehouseM.mutate({ id, name, address, responsible }),
    removeWarehouse: (id: string) => removeWarehouseM.mutate(id),
  }
}
