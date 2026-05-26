/**
 * Cliente Supabase autenticado como o **usuário do agente** (perfil `assistente`).
 *
 * Por que não service_role: usar o role anônimo + login com senha mantém o
 * audit trail correto (`created_by`, `usuario_id` em `log_auditoria`) e
 * respeita a RLS por perfil (migration 0025) — se o agente tentar mexer em
 * algo fora do seu escopo, o Postgres rejeita.
 *
 * O serverless é stateless, então fazemos login em cada invocação. O custo é
 * irrisório (1 ida ao auth do Supabase por mensagem recebida).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@sislog/shared/types'
import { config } from './config'

export async function getAgentClient(): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(config.supabase.url, config.supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error } = await client.auth.signInWithPassword({
    email: config.supabase.agentEmail,
    password: config.supabase.agentPassword,
  })

  if (error) {
    throw new Error(`[agente-whatsapp] falha ao autenticar como agente: ${error.message}`)
  }

  return client
}
