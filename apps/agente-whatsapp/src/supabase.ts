/**
 * Cliente Supabase autenticado como o **usuário do agente** (perfil `assistente`).
 *
 * Por que não service_role: com o login do próprio agente, a auditoria registra
 * "Agente IA" como autor (`created_by`, `log_auditoria`) e a RLS por perfil vale
 * para ele — o que o perfil não pode, o Postgres recusa.
 *
 * Login: o de senha exige CAPTCHA, que um servidor não resolve. A Edge Function
 * `agente-sessao` (protegida por segredo) devolve um token de magic link do
 * usuário do agente, trocado aqui por sessão com `verifyOtp`.
 *
 * A sessão fica em memória e é reaproveitada enquanto a instância serverless
 * estiver quente: logar a cada mensagem esbarraria no limite de verificações
 * do Auth (30 por 5 min por IP). Renova pelo refresh token antes de expirar.
 *
 * Cliente sem o genérico `Database`: os tipos do banco do monorepo são escritos
 * à mão e não trazem `Relationships`, o que faz o supabase-js tipar tudo como
 * `never`. Os pontos que leem linhas declaram o tipo da linha explicitamente.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from './config'

let cliente: SupabaseClient | null = null
let sessaoVence = 0

/** Margem para renovar antes do vencimento do access token. */
const MARGEM_MS = 5 * 60_000

export async function getAgentClient(): Promise<SupabaseClient> {
  if (cliente && Date.now() < sessaoVence - MARGEM_MS) {
    // Batimento da 0077: sem ele, o hook de inatividade recusaria a renovação
    // do token do agente depois de 60 min sem "atividade".
    void cliente.rpc('registrar_atividade_sessao').then(() => undefined, () => undefined)
    return cliente
  }

  if (cliente) {
    const { data, error } = await cliente.auth.refreshSession()
    if (!error && data.session) {
      sessaoVence = (data.session.expires_at ?? 0) * 1000
      return cliente
    }
  }

  const novo = createClient(config.supabase.url, config.supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const res = await fetch(`${config.supabase.url}/functions/v1/agente-sessao`, {
    method: 'POST',
    headers: { 'x-agente-secret': config.supabase.agentLoginSecret, Authorization: `Bearer ${config.supabase.anonKey}` },
  })
  if (!res.ok) throw new Error(`[agente-whatsapp] agente-sessao respondeu ${res.status}`)
  const { token_hash } = (await res.json()) as { token_hash?: string }
  if (!token_hash) throw new Error('[agente-whatsapp] agente-sessao sem token_hash')

  const { data, error } = await novo.auth.verifyOtp({ token_hash, type: 'magiclink' })
  if (error || !data.session) throw new Error(`[agente-whatsapp] verifyOtp: ${error?.message ?? 'sem sessão'}`)

  cliente = novo
  sessaoVence = (data.session.expires_at ?? 0) * 1000
  return cliente
}
