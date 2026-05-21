// Auditoria de eventos do portal (Bloco 6.2).
//
// Cada chamada eh fire-and-forget: a UI nao espera o registro, e erros sao
// silenciados em console.warn — auditoria nunca deve quebrar o fluxo do
// usuario. A funcao SQL `registrar_evento_portal` valida e deriva o parceiro
// do `auth.uid()` no servidor; o cliente nao consegue forjar identidade.
//
// IP fica vazio no MVP (front nao tem como obter de forma confiavel). Quando
// houver Edge Function/proxy proprio, capturar do header X-Forwarded-For.

import { supabase } from '@/lib/supabase'
import type { TipoEventoPortal } from '@sislog/shared/types'

type PayloadValue = string | number | boolean | null

interface PayloadBase {
  /** Email tentado em portal_login_falha. */
  email_tentado?: string
  /** Solicitação alvo em portal_solicitacao_criada / portal_solicitacao_cancelada. */
  solicitacao_id?: string
  /** Metadados extras (vão para o campo jsonb `metadata`). */
  [key: string]: PayloadValue | undefined
}

export async function registrarEvento(
  tipoEvento: TipoEventoPortal,
  payload: PayloadBase = {},
): Promise<void> {
  const fullPayload: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined) fullPayload[k] = v
  }
  if (typeof navigator !== 'undefined') {
    fullPayload.user_agent = navigator.userAgent
  }
  try {
    // TS 6 + supabase-js 2.105 nao consegue inferir Args de Schema['Functions'][FnName];
    // forcamos com `as never` no objeto para o type-check passar. Em runtime,
    // o supabase-js apenas serializa para JSON no body da requisicao.
    const args = {
      p_tipo_evento: tipoEvento,
      p_payload: fullPayload,
    } as never
    const { error } = await supabase.rpc('registrar_evento_portal', args)
    if (error) {
      console.warn('[eventos] registrar_evento_portal falhou', tipoEvento, error.message)
    }
  } catch (err) {
    console.warn('[eventos] excecao ao registrar', tipoEvento, err)
  }
}
