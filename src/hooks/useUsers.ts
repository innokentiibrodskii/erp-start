import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { UserRole } from './useCurrentUser'
import { useActiveOrgId } from '../OrgContext'

/* ───────────────────────────────────────────────────────────
   Список користувачів застосунку — для пікера "Виконавець" і
   фільтра за працівником на сторінці "Завдання" (менеджеру).
─────────────────────────────────────────────────────────── */

export interface AppUser {
  id: string
  firstName: string
  lastName: string
  fullName: string
  email: string
  role: UserRole
}

export function useUsers() {
  const orgId = useActiveOrgId()
  return useQuery({
    queryKey: ['app-users', orgId],
    queryFn: async (): Promise<AppUser[]> => {
      // users не має organization_id (людина може належати до кількох компаній) —
      // список людей активної компанії отримуємо через членство user_organizations.
      const { data, error } = await supabase
        .from('user_organizations')
        .select('users(id, first_name, last_name, email, role)')
        .eq('organization_id', orgId)
      if (error) throw error
      return data
        .map(row => row.users as unknown as { id: string; first_name: string; last_name: string; email: string; role: string } | null)
        .filter((u): u is { id: string; first_name: string; last_name: string; email: string; role: string } => u !== null)
        .map(u => ({
          id: u.id,
          firstName: u.first_name,
          lastName: u.last_name,
          fullName: `${u.first_name} ${u.last_name}`.trim(),
          email: u.email,
          role: (u.role as UserRole) ?? 'performer',
        }))
        .sort((a, b) => a.firstName.localeCompare(b.firstName))
    },
    staleTime: 5 * 60_000,
  })
}
