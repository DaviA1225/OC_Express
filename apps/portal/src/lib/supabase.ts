import { createSupabaseClient } from '@sislog/shared/supabase'

// Cliente Supabase do Portal de Parceiros. Aponta para a mesma instância
// Supabase do sistema interno (mesmo banco/Auth) — o isolamento entre
// parceiros vem da RLS, não de bancos separados. As variáveis de ambiente
// são resolvidas pelo Vite do `apps/portal`.
export const supabase = createSupabaseClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
