// Registro de ACESSO a dado pessoal (LGPD art. 37 — migration 0059).
//
// O `log_auditoria` cobre quem ESCREVE. Leitura não passa por trigger, então
// exportar a base inteira de motoristas em CSV não deixava rastro nenhum.
// Aqui ficam as três operações em que dado pessoal SAI do sistema: exportação
// CSV, link do PDF da OC e link de anexo.
//
// Fire-and-forget, igual ao `lib/eventos.ts` do portal: a UI não espera o
// registro e erro vira `console.warn`. Auditoria nunca pode quebrar o fluxo do
// usuário — se o log falhar, a exportação que ele pediu tem que sair mesmo
// assim. IP, user-agent e origem são derivados dos headers no servidor; o
// cliente não os informa.

import { supabase } from '@/lib/supabase'

export type AcaoAcesso = 'export_csv' | 'download_oc_pdf' | 'abrir_anexo'

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
