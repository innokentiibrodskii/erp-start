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
  departmentNameEn: string | null
  positionId: string | null
  positionName: string | null
  positionNameEn: string | null
}

interface RawPosition {
  id: string
  name: string
  name_en: string | null
  department_id: string
  departments: { name: string; name_en: string | null } | null
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
          user_positions(position_id, positions(id, name, name_en, department_id, departments(name, name_en)))
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
          departmentNameEn: pos?.departments?.name_en ?? null,
          positionId: pos?.id ?? null,
          positionName: pos?.name ?? null,
          positionNameEn: pos?.name_en ?? null,
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

/** Редагування вже наявного працівника: ім'я/прізвище/телефон — прямий
 *  update рядка users (RLS дозволяє менеджеру/адміну редагувати працівників
 *  своєї організації); посада — не поле users, а окремий зв'язок у
 *  user_positions, тож оновлюємо його delete+insert (простіше й безпечніше
 *  за upsert, коли невідомо, чи вже є рядок для цього користувача/організації).
 *  Департамент у профілі — похідний від посади (positions.department_id),
 *  окремого запису для нього немає.
 *  Email і пароль — НЕ тут: email є логіном у Supabase Auth (auth.users),
 *  змінити його для СЕБЕ можна через supabase.auth.updateUser (ProfilePage.tsx,
 *  лише для власного профілю), а для чужого — потрібен service-role, якого в
 *  цього клієнта немає. Пароль іншого працівника скидається листом
 *  (supabase.auth.resetPasswordForEmail) — так само без потреби в service-role. */
interface UpdateEmployeeArgs {
  id: string
  firstName: string
  lastName: string
  phone: string | null
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

  const update = useMutation({
    mutationFn: async (args: UpdateEmployeeArgs) => {
      const { error: userErr } = await supabase.from('users')
        .update({ first_name: args.firstName, last_name: args.lastName, phone: args.phone })
        .eq('id', args.id)
      if (userErr) throw userErr

      const { error: delErr } = await supabase.from('user_positions').delete().eq('user_id', args.id).eq('organization_id', orgId)
      if (delErr) throw delErr
      if (args.positionId) {
        const { error: insErr } = await supabase.from('user_positions').insert({ user_id: args.id, position_id: args.positionId, organization_id: orgId })
        if (insErr) throw insErr
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees', orgId] }),
  })

  return {
    createEmployee: (args: CreateEmployeeArgs) => create.mutateAsync(args),
    updateEmployee: (args: UpdateEmployeeArgs) => update.mutateAsync(args),
    isSaving: create.isPending,
    isUpdating: update.isPending,
  }
}
