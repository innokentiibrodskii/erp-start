import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useActiveOrgId } from '../OrgContext'
import type { UserRole } from './useCurrentUser'

/* ───────────────────────────────────────────────────────────
   Працівники активної організації. Створення нового працівника
   (auth-користувача з паролем) виконується через Edge Function
   create-employee — client не може безпечно створювати
   auth-користувачів напряму (потрібен service-role ключ).
─────────────────────────────────────────────────────────── */

export interface Employee {
  id: string
  firstName: string
  lastName: string
  fullName: string
  email: string
  phone: string | null
  role: UserRole
  departmentId: string | null
  departmentName: string | null
  positionId: string | null
  positionName: string | null
}

interface RawPosition {
  id: string
  name: string
  department_id: string
  departments: { name: string } | null
}

interface RawUserPosition {
  position_id: string
  positions: RawPosition | null
}

interface RawEmployeeRow {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  role: string
  user_positions: RawUserPosition[]
}

export function useEmployees() {
  const orgId = useActiveOrgId()
  return useQuery({
    queryKey: ['employees', orgId],
    queryFn: async (): Promise<Employee[]> => {
      const { data, error } = await supabase
        .from('users')
        .select(`
          id, first_name, last_name, email, phone, role,
          user_organizations!inner(organization_id),
          user_positions(position_id, positions(id, name, department_id, departments(name)))
        `)
        .eq('user_organizations.organization_id', orgId)
        .eq('user_positions.organization_id', orgId)
        .order('first_name')
      if (error) throw error
      return (data as unknown as RawEmployeeRow[]).map(u => {
        const pos = u.user_positions?.[0]?.positions ?? null
        return {
          id: u.id,
          firstName: u.first_name,
          lastName: u.last_name,
          fullName: `${u.first_name} ${u.last_name}`.trim(),
          email: u.email,
          phone: u.phone,
          role: (u.role as UserRole) ?? 'performer',
          departmentId: pos?.department_id ?? null,
          departmentName: pos?.departments?.name ?? null,
          positionId: pos?.id ?? null,
          positionName: pos?.name ?? null,
        }
      })
    },
  })
}

interface CreateEmployeeArgs {
  firstName: string
  lastName: string
  email: string
  phone: string
  password: string
  role: UserRole
  positionId: string | null
}

export function useEmployeeMutations() {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()

  const create = useMutation({
    mutationFn: async (args: CreateEmployeeArgs) => {
      const { data, error } = await supabase.functions.invoke('create-employee', {
        body: {
          organizationId: orgId,
          firstName: args.firstName,
          lastName: args.lastName,
          email: args.email,
          phone: args.phone || null,
          password: args.password,
          role: args.role,
          positionId: args.positionId,
        },
      })
      if (error) {
        const ctx = (error as { context?: Response }).context
        const body = await ctx?.json?.().catch(() => null)
        throw new Error(body?.error ?? error.message)
      }
      if (data?.error) throw new Error(data.error)
      return data?.id as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees', orgId] }),
  })

  return {
    createEmployee: (args: CreateEmployeeArgs) => create.mutateAsync(args),
    isSaving: create.isPending,
  }
}
