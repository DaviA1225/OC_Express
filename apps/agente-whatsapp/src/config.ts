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
  uazapi: {
    /** Server URL da instância, sem barra no fim. */
    url: required('UAZAPI_URL').replace(/\/+$/, ''),
    /** Token da instância: autentica as chamadas e prova a origem do webhook. */
    token: required('UAZAPI_TOKEN'),
  },
  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
    model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
  },
  openai: {
    apiKey: required('OPENAI_API_KEY'),
    transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL ?? 'gpt-4o-transcribe',
  },
  supabase: {
    url: required('SUPABASE_URL'),
    anonKey: required('SUPABASE_ANON_KEY'),
    /** Segredo da Edge Function `agente-sessao` (login do agente sem CAPTCHA). */
    agentLoginSecret: required('AGENTE_LOGIN_SECRET'),
  },
  agente: {
    /** Espera depois da última mensagem antes de responder: quem manda "oi",
     *  depois a placa, depois um áudio, recebe UMA resposta, não três. */
    debounceMs: Number(process.env.AGENTE_DEBOUNCE_MS ?? 7000),
    /** Conversa parada há mais que isso começa uma sessão nova (histórico
     *  limpo). O que importa do passado o agente consulta pelas ferramentas. */
    horasNovaSessao: Number(process.env.AGENTE_HORAS_NOVA_SESSAO ?? 8),
    /** Teto de voltas do ciclo de ferramentas por resposta. */
    maxVoltas: Number(process.env.AGENTE_MAX_VOLTAS ?? 16),
    /** Mensagem que chega com mais atraso que isso (chip desconectado, fila
     *  da UAZAPI) não dispara resposta: responder em rajada a conversas de
     *  dias atrás é o padrão que derruba número. Fica para a próxima volta. */
    maxAtrasoMin: Number(process.env.AGENTE_MAX_ATRASO_MIN ?? 60),
    /** Teto de respostas enviadas por conversa em 10 min. Passou disso, é
     *  quase certo um robô do outro lado: a conversa vai para a equipe. */
    maxRespostas10Min: Number(process.env.AGENTE_MAX_RESPOSTAS_10MIN ?? 8),
  },
} as const
