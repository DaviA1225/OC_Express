import { createSupabaseClient } from '@sislog/shared/supabase'

// Cliente Supabase do sistema interno. A configuração do cliente é
// compartilhada (@sislog/shared); aqui só injetamos as variáveis de ambiente
// deste app, resolvidas pelo Vite do `apps/interno`.
export const supabase = createSupabaseClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
