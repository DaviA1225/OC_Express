/**
 * Carregamento + validação das variáveis de ambiente do agente.
 * Falha cedo (no boot do serverless) se algo essencial estiver faltando, em vez
 * de só quebrar quando a primeira mensagem chegar.
 */

function required(name: string): string {
  const v = process.env[name]
  if (!v || v.trim() === '') {
    throw new Error(`[agente-whatsapp] env var obrigatória ausente: ${name}`)
  }
  return v
}

export const config = {
  meta: {
    verifyToken: required('META_VERIFY_TOKEN'),
    appSecret: required('META_APP_SECRET'),
    waToken: required('META_WA_TOKEN'),
    phoneNumberId: required('META_PHONE_NUMBER_ID'),
  },
  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
    model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
  },
  supabase: {
    url: required('SUPABASE_URL'),
    anonKey: required('SUPABASE_ANON_KEY'),
    agentEmail: required('SUPABASE_AGENT_EMAIL'),
    agentPassword: required('SUPABASE_AGENT_PASSWORD'),
  },
} as const
