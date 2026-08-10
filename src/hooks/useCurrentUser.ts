import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/* ───────────────────────────────────────────────────────────
   Поточний користувач застосунку: профіль із public.users
   (ім'я, роль) прив'язаний до авторизованого supabase-акаунту.
   role визначає, що бачить користувач на сторінці "Завдання":
   manager — усі завдання й може призначати їх іншим,
   performer — лише свої.
─────────────────────────────────────────────────────────── */

export type UserRole = 'manager' | 'performer'

export interface CurrentUser {
  id: string
  firstName: string
  lastName: string
  fullName: string
  email: string
  role: UserRole
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ['current-user'],
    queryFn: async (): Promise<CurrentUser | null> => {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      const authUser = authData.user
      if (!authUser) return null

      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, role')
        .eq('id', authUser.id)
        .maybeSingle()
      if (error) throw error
      if (!data) return null

      return {
        id: data.id,
        firstName: data.first_name,
        lastName: data.last_name,
        fullName: `${data.first_name} ${data.last_name}`.trim(),
        email: data.email,
        role: (data.role as UserRole) ?? 'performer',
      }
    },
    staleTime: 5 * 60_000,
  })
}
