import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/**
 * Cria um cliente Supabase tipado com o schema do SisLog.
 *
 * A leitura das variáveis de ambiente (`VITE_SUPABASE_URL` /
 * `VITE_SUPABASE_ANON_KEY`) é responsabilidade de cada app, porque
 * `import.meta.env` é resolvido pelo Vite do app consumidor. Cada app mantém
 * um `lib/supabase.ts` fino que lê seu próprio `.env.local` e chama esta
 * factory — assim o portal e o sistema interno apontam para projetos/credenciais
 * diferentes sem duplicar a configuração do cliente.
 */
export function createSupabaseClient(
  url: string | undefined,
  anonKey: string | undefined,
) {
  if (!url || !anonKey) {
    throw new Error(
      'Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórias. ' +
        'Configure o .env.local do app.',
    )
  }

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
}

export type SupabaseClient = ReturnType<typeof createSupabaseClient>

/** Estado do kill switch / modo manutenção compartilhado (tabela system_status). */
export interface SystemStatus {
  maintenance: boolean
  message: string | null
}

/**
 * Lê a linha única de `system_status` para o gate de manutenção dos apps.
 *
 * FAIL-OPEN por design: se a leitura falhar (rede, Supabase indisponível), volta
 * `maintenance: false`. Um soluço de infra não pode, sozinho, derrubar o app —
 * a manutenção só liga quando a flag foi explicitamente setada no banco.
 */
export async function fetchSystemStatus(
  supabase: SupabaseClient,
): Promise<SystemStatus> {
  const { data, error } = await supabase
    .from('system_status')
    .select('maintenance, message')
    .eq('id', 1)
    .maybeSingle<SystemStatus>()

  if (error || !data) {
    return { maintenance: false, message: null }
  }
  return { maintenance: data.maintenance, message: data.message }
}
