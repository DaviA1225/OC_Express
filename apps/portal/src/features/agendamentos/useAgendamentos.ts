import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { registrarAcesso } from '@/lib/acesso'
import { registrarEvento } from '@/lib/eventos'
import { traduzirErroBanco } from '@/features/cadastros/useParceiroCrud'
import type { Tables, TipoVeiculo, TipoVeiculoSlot } from '@sislog/shared/types'

export const AGENDAMENTOS_BUCKET = 'agendamentos-docs'

export type Agendamento = Tables<'agendamentos'>

export interface SlotOcupacao {
  hora: string
  /** 'todos' no terminal de grade única. Na A.B/CSN cada horário pertence a um
   *  tipo de veículo, e 13:00 aparece duas vezes — uma por tipo. */
  tipo_veiculo: TipoVeiculoSlot
  duracao_minutos: number
  capacidade: number | null
  /** Veículos da própria LHG já agendados no horário. Não é disponibilidade:
   *  a vaga vive no sistema do terminal, que também atende outras
   *  transportadoras. */
  ocupados: number
}

/**
 * Grade do terminal com a ocupação da LHG na data escolhida. Vem por RPC porque
 * a contagem precisa somar os agendamentos de todos os parceiros para servir de
 * referência, e o RLS não deixa ninguém ver os agendamentos alheios.
 */
export function useSlotsDoTerminal(clienteId: string | null | undefined, data: string | null) {
  return useQuery({
    enabled: !!clienteId && !!data,
    queryKey: ['agendamento-slots', clienteId, data],
    queryFn: async (): Promise<SlotOcupacao[]> => {
      const { data: rows, error } = await supabase.rpc('agendamentos_ocupacao_slot', {
        p_cliente_id: clienteId as string,
        p_data: data as string,
      } as never)
      if (error) throw error
      return (rows ?? []) as SlotOcupacao[]
    },
  })
}

/** Agendamentos desta solicitação, do mais recente ao mais antigo. O parceiro
 *  tem policy de SELECT na tabela (0061) — é ela que também alimenta o
 *  Realtime. */
export function useAgendamentosDaSolicitacao(solicitacaoId: string | null | undefined) {
  return useQuery({
    enabled: !!solicitacaoId,
    queryKey: ['agendamentos-solicitacao', solicitacaoId],
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<Agendamento[]> => {
      const { data, error } = await supabase
        .from('agendamentos')
        .select('*')
        .eq('solicitacao_id', solicitacaoId as string)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Agendamento[]
    },
  })
}

/** Janela do aviso "agendamento confirmado" no sino. Curta de propósito: o
 *  sino do portal não tem dispensa por item (o de pendências é puro estado
 *  aberto/resolvido), então um aviso longo viraria ruído permanente. */
const AVISO_HORAS = 24

/** Agendamentos confirmados nas últimas horas — o "sino" do parceiro. O card na
 *  solicitação continua sendo a fonte completa; isto é só o aviso de que
 *  chegou comprovante novo. */
export function useAgendamentosRecentes() {
  return useQuery({
    queryKey: ['agendamentos-recentes'],
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<Agendamento[]> => {
      const desde = new Date(Date.now() - AVISO_HORAS * 3_600_000).toISOString()
      const { data, error } = await supabase
        .from('agendamentos')
        .select('*')
        .eq('status', 'agendado')
        .gte('agendado_em', desde)
        .order('agendado_em', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as Agendamento[]
    },
  })
}

function invalidar(qc: ReturnType<typeof useQueryClient>, solicitacaoId: string) {
  qc.invalidateQueries({ queryKey: ['agendamentos-solicitacao', solicitacaoId] })
  qc.invalidateQueries({ queryKey: ['agendamento-slots'] })
}

export function useSolicitarAgendamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      solicitacaoId: string
      dataPreferida: string
      horaPreferida: string | null
      observacoes: string | null
      /** Opcional (0068): encurta a busca da nota no Corporate pela equipe. */
      notaFiscal: string | null
      /** Obrigatório (0069) quando o terminal separa a grade por tipo: é o tipo
       *  que decide quais horários existem. O banco recusa o pedido sem ele. */
      tipoVeiculo: TipoVeiculo | null
    }) => {
      const { data, error } = await supabase.rpc('portal_solicitar_agendamento', {
        p_solicitacao_id: input.solicitacaoId,
        p_data_preferida: input.dataPreferida,
        p_hora_preferida: input.horaPreferida,
        p_observacoes: input.observacoes,
        p_nota_fiscal: input.notaFiscal,
        p_tipo_veiculo: input.tipoVeiculo,
      } as never)
      if (error) throw error
      return data as string
    },
    onSuccess: (_id, vars) => {
      invalidar(qc, vars.solicitacaoId)
      void registrarEvento('portal_agendamento_solicitado', { solicitacao_id: vars.solicitacaoId })
      toast.success('Pedido enviado. A equipe da LHG agenda no terminal e devolve o comprovante aqui.')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

export function useCancelarAgendamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; solicitacaoId: string }) => {
      const { error } = await supabase.rpc('portal_cancelar_agendamento', { p_id: input.id } as never)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      invalidar(qc, vars.solicitacaoId)
      void registrarEvento('portal_agendamento_cancelado', { solicitacao_id: vars.solicitacaoId })
      toast.success('Pedido de agendamento cancelado.')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

/** Reagendar não sobrescreve: o agendamento atual passa a constar como
 *  reagendado e um pedido novo entra na fila da equipe. */
export function useReagendar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      solicitacaoId: string
      motivo: string
      novaData: string
      novaHora: string | null
    }) => {
      const { data, error } = await supabase.rpc('portal_reagendar_agendamento', {
        p_id: input.id,
        p_motivo: input.motivo,
        p_nova_data: input.novaData,
        p_nova_hora: input.novaHora,
      } as never)
      if (error) throw error
      return data as string
    },
    onSuccess: (_id, vars) => {
      invalidar(qc, vars.solicitacaoId)
      void registrarEvento('portal_agendamento_reagendado', { solicitacao_id: vars.solicitacaoId })
      toast.success('Reagendamento pedido. A equipe confirma a nova janela no terminal.')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

/** Signed URL curta para um documento do agendamento (comprovante, contrato de
 *  frete, PDF da NF). O bucket é privado; a policy do storage deriva o dono do
 *  primeiro segmento do caminho ({agendamento_id}/...). */
export async function getDocumentoUrl(path: string, expiresInSec = 900): Promise<string> {
  const { data, error } = await supabase.storage
    .from(AGENDAMENTOS_BUCKET)
    .createSignedUrl(path, expiresInSec)
  if (error) throw error
  registrarAcesso('abrir_documento_agendamento', path, { expira_em_seg: expiresInSec })
  return data.signedUrl
}
