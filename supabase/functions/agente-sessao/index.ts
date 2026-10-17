// Edge Function — agente-sessao
//
// Por que existe: o agente de WhatsApp entra no SisLog com o próprio usuário
// (perfil `assistente`), para a RLS e a auditoria valerem para ele como para
// qualquer atendente. Mas o login por senha exige CAPTCHA (Turnstile) desde
// julho, e um servidor não tem como resolver CAPTCHA — nem deveria.
//
// Esta função faz a ponte sem expor a service_role ao agente: ela gera um
// magic link SÓ para o e-mail do agente (fixo no secret, nunca vindo da
// requisição) e devolve o hashed_token. O agente troca o token por sessão com
// `verifyOtp`, usando a chave anon. A sessão resultante é uma sessão normal do
// usuário do agente: RLS por perfil, auditoria com o nome dele.
//
// Proteção: segredo compartilhado no header `x-agente-secret`, comparado em
// tempo constante. Quem não tem o segredo recebe 401 e nada mais. Não há CORS:
// é chamada servidor a servidor, nunca do navegador.
//
// Secrets necessários (supabase secrets set):
//   AGENTE_EMAIL          e-mail da conta do agente
//   AGENTE_LOGIN_SECRET   string aleatória longa, igual à do projeto Vercel

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const AGENTE_EMAIL = Deno.env.get('AGENTE_EMAIL') ?? ''
const AGENTE_LOGIN_SECRET = Deno.env.get('AGENTE_LOGIN_SECRET') ?? ''

function iguaisEmTempoConstante(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  let diff = ea.length ^ eb.length
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  return diff === 0
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

  // Secret curto demais é configuração errada: recusar em vez de aceitar fraco.
  if (AGENTE_LOGIN_SECRET.length < 32 || !AGENTE_EMAIL) {
    console.error('[agente-sessao] secrets ausentes ou fracos')
    return json(500, { error: 'not configured' })
  }
  if (!iguaisEmTempoConstante(req.headers.get('x-agente-secret') ?? '', AGENTE_LOGIN_SECRET)) {
    return json(401, { error: 'unauthorized' })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Defesa extra: o e-mail do secret tem de ser de um usuário interno ATIVO com
  // perfil assistente. Um secret trocado por engano para o e-mail de um admin
  // não vira porta dos fundos com poder de admin.
  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: AGENTE_EMAIL })
  if (error || !link?.user || !link.properties?.hashed_token) {
    console.error('[agente-sessao] generateLink', error?.message)
    return json(500, { error: 'link failed' })
  }
  const { data: perfil } = await admin
    .from('perfis_usuarios')
    .select('perfil, ativo')
    .eq('user_id', link.user.id)
    .maybeSingle()
  if (!perfil || !perfil.ativo || perfil.perfil !== 'assistente') {
    console.error('[agente-sessao] usuário do agente sem perfil assistente ativo')
    return json(403, { error: 'agent profile invalid' })
  }

  return json(200, { token_hash: link.properties.hashed_token })
})
