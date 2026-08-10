import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { UserRole } from './useCurrentUser'

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
  return useQuery({
    queryKey: ['app-users'],
    queryFn: async (): Promise<AppUser[]> => {
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, role')
        .order('first_name')
      if (error) throw error
      return data.map(u => ({
        id: u.id,
        firstName: u.first_name,
        lastName: u.last_name,
        fullName: `${u.first_name} ${u.last_name}`.trim(),
        email: u.email,
        role: (u.role as UserRole) ?? 'performer',
      }))
    },
    staleTime: 5 * 60_000,
  })
}
