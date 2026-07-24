import { supabase } from '@/lib/supabase'

// Camada fina sobre a API de MFA do Supabase (`supabase.auth.mfa.*`).
// TOTP (app autenticador). O gate de app vive no ProtectedRoute; o enrollment,
// no PerfilPage. Aqui só as operações cruas + tradução de erro.

export interface AalState {
  /** Nível da sessão atual: 'aal1' (senha) ou 'aal2' (senha + TOTP). */
  current: 'aal1' | 'aal2' | null
  /** Nível que a sessão PODE atingir. 'aal2' quando há fator verificado. */
  next: 'aal1' | 'aal2' | null
}

/**
 * Lê o nível de garantia (AAL) da sessão. `current` vem do JWT; `next` é 'aal2'
 * quando o usuário tem um fator TOTP verificado. Quem tem fator e está em aal1
 * PRECISA fazer o step-up (é o que o ProtectedRoute exige).
 */
export async function getAal(): Promise<AalState> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data) return { current: null, next: null }
  return {
    current: (data.currentLevel as AalState['current']) ?? null,
    next: (data.nextLevel as AalState['next']) ?? null,
  }
}

/** Fatores TOTP já VERIFICADOS do usuário (os que exigem código no login). */
export async function listVerifiedTotp() {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return (data?.totp ?? []).filter((f) => f.status === 'verified')
}

export interface EnrollResult {
  factorId: string
  /** SVG do QR code (string inline) para exibir. */
  qrSvg: string
  /** Segredo base32 para digitação manual no app autenticador. */
  secret: string
}

/**
 * Inicia o enrollment de um fator TOTP. O fator nasce NÃO verificado; só vira
 * verificado após `verifyTotp` com um código válido. Antes de criar, limpa
 * fatores não verificados antigos (enrollments abandonados) para não acumular.
 */
export async function enrollTotp(friendlyName = 'Autenticador'): Promise<EnrollResult> {
  // Limpa fatores TOTP não verificados de tentativas anteriores.
  const { data: list } = await supabase.auth.mfa.listFactors()
  const stale = (list?.totp ?? []).filter((f) => f.status !== 'verified')
  for (const f of stale) {
    await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {})
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName,
  })
  if (error) throw error
  return {
    factorId: data.id,
    qrSvg: data.totp.qr_code,
    secret: data.totp.secret,
  }
}

/**
 * Verifica um código TOTP contra um fator. Serve tanto para CONCLUIR o
 * enrollment (fator vira verificado) quanto para o STEP-UP no login (sessão
 * vira aal2). Faz o challenge + verify numa chamada.
 */
export async function verifyTotp(factorId: string, code: string): Promise<void> {
  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId })
  if (cErr) throw cErr
  const { error: vErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.trim(),
  })
  if (vErr) throw vErr
}

/** Remove um fator (desativar 2FA / reset). */
export async function unenroll(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw error
}

/** Mensagens de erro do MFA em pt-BR. */
export function traduzirErroMfa(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  if (msg.includes('invalid') && msg.includes('code')) return 'Código inválido. Confira o app e tente de novo.'
  if (msg.includes('mfa') && (msg.includes('disabled') || msg.includes('not enabled')))
    return 'A verificação em duas etapas não está habilitada no projeto. Avise o administrador.'
  if (msg.includes('too many')) return 'Muitas tentativas. Aguarde alguns instantes.'
  if (msg.includes('expired')) return 'O código expirou. Gere um novo no app e tente de novo.'
  return 'Não foi possível verificar o código. Tente novamente.'
}
