// Registro de ACESSO a dado pessoal (LGPD art. 37 — migration 0059).
//
// Gêmeo do `apps/interno/src/lib/acesso.ts`: cada app importa o próprio client
// de `@/lib/supabase`, por isso o helper vive nos dois em vez de em
// @sislog/shared. Mesma razão pela qual `lib/csv.ts` é duplicado.
//
// No portal, as operações registradas são a exportação CSV da frota do
// parceiro (nome, CPF e telefone dos motoristas dele) e a abertura de anexo.
// A `registrar_acesso` deriva `origem='portal'` no servidor.
//
// Fire-and-forget, igual ao `lib/eventos.ts`: a UI não espera e erro vira
// `console.warn`. Auditoria nunca pode quebrar o fluxo do usuário.

import { supabase } from '@/lib/supabase'

export type AcaoAcesso =
  | 'export_csv'
  | 'download_oc_pdf'
  | 'abrir_anexo'
  // 0061 — comprovante do agendamento baixado pelo parceiro.
  | 'abrir_documento_agendamento'
  | 'copiar_cpf'

export function registrarAcesso(
  acao: AcaoAcesso,
  recurso?: string | null,
  detalhe?: Record<string, unknown> | null,
): void {
  void (async () => {
    try {
      // supabase-js não infere Args de Schema['Functions'][FnName] aqui; o
      // `as never` só afeta o type-check — em runtime é JSON no corpo.
      const args = {
        p_acao: acao,
        p_recurso: recurso ?? null,
        p_detalhe: detalhe ?? null,
      } as never
      const { error } = await supabase.rpc('registrar_acesso', args)
      if (error) console.warn('[acesso] registrar_acesso falhou', acao, error.message)
    } catch (err) {
      console.warn('[acesso] excecao ao registrar', acao, err)
    }
  })()
}
