// Schema, tipo e valores padrão do formulário de solicitação do portal.
//
// Vive fora de `SolicitacaoForm.tsx` para que aquele arquivo exporte apenas o
// componente — requisito do React Fast Refresh (regra react-refresh/
// only-export-components). Páginas que só precisam do schema/defaults importam
// daqui sem arrastar o componente.
import { z } from 'zod'

export const solicitacaoSchema = z
  .object({
    tipo: z.enum(['carregamento', 'retorno']),
    parceiro_motorista_id: z.string().min(1, 'Selecione o motorista'),
    parceiro_veiculo_id: z.string().min(1, 'Selecione o cavalo'),
    parceiro_carreta_id: z.string().min(1, 'Selecione a última carreta'),
    parceiro_primeira_carreta_id: z.string(),
    parceiro_dolly_id: z.string(),
    parceiro_subcontratada_id: z.string().min(1, 'Selecione a subcontratada'),
    cliente_id: z.string(),
    // Só no retorno: vem da carga de retorno escolhida, junto com o cliente.
    local_carregamento: z.string(),
    pamcard_status: z.enum(['tem_cartao', 'nao_tem_cartao', 'nao_necessario']),
    pamcard_numero: z.string().optional(),
    observacoes: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    // No retorno o cliente sai da carga escolhida, então o erro aparece no
    // seletor de carga (o de cliente nem é exibido).
    if (v.tipo === 'retorno') {
      if (!v.cliente_id || !v.local_carregamento.trim()) {
        ctx.addIssue({ code: 'custom', path: ['local_carregamento'], message: 'Selecione a carga de retorno' })
      }
    } else if (!v.cliente_id) {
      ctx.addIssue({ code: 'custom', path: ['cliente_id'], message: 'Selecione o cliente' })
    }

    if (v.pamcard_status !== 'tem_cartao') return
    const num = (v.pamcard_numero ?? '').trim()
    if (!num) {
      ctx.addIssue({ code: 'custom', path: ['pamcard_numero'], message: 'Informe o número do cartão' })
    } else if (!/^\d+$/.test(num)) {
      ctx.addIssue({ code: 'custom', path: ['pamcard_numero'], message: 'O Pamcard deve conter apenas números' })
    } else if (num.length < 10) {
      ctx.addIssue({ code: 'custom', path: ['pamcard_numero'], message: 'O Pamcard deve ter no mínimo 10 dígitos' })
    } else if (num.length > 16) {
      ctx.addIssue({ code: 'custom', path: ['pamcard_numero'], message: 'O Pamcard deve ter no máximo 16 dígitos' })
    }
  })

export type SolicitacaoFormValues = z.infer<typeof solicitacaoSchema>

export const SOLICITACAO_FORM_DEFAULTS: SolicitacaoFormValues = {
  tipo: 'carregamento',
  parceiro_motorista_id: '',
  parceiro_veiculo_id: '',
  parceiro_carreta_id: '',
  parceiro_primeira_carreta_id: '',
  parceiro_dolly_id: '',
  parceiro_subcontratada_id: '',
  cliente_id: '',
  local_carregamento: '',
  pamcard_status: 'tem_cartao',
  pamcard_numero: '',
  observacoes: '',
}
