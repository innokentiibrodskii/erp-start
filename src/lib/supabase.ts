import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Відсутні VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Перевірте файл .env',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
