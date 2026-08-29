import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { registrarAcesso } from '@/lib/acesso'
import { traduzirErroBanco } from '@/features/crud/useCrudQueries'
import type { AgendamentoStatus, Tables } from '@/types/database.types'

export const AGENDAMENTOS_BUCKET = 'agendamentos-docs'
export const MAX_DOC_BYTES = 10 * 1024 * 1024

export type Agendamento = Tables<'agendamentos'>

/** Tipo de documento no bucket. O caminho é `{agendamento_id}/{tipo}-{ts}.pdf`,
 *  e é dele que a policy do storage deriva o dono. */
export type TipoDocumento = 'comprovante' | 'nf' | 'contrato'

/** Coluna onde cada tipo é gravado. O upload persiste o caminho na hora: antes
 *  ele ficava só no estado da tela até a conclusão, e fechar o painel no meio
 *  perdia a referência, deixando o arquivo órfão no bucket. */
const COLUNA_POR_TIPO: Record<TipoDocumento, 'comprovante_path' | 'nf_pdf_path' | 'contrato_frete_path'> = {
  comprovante: 'comprovante_path',
  nf: 'nf_pdf_path',
  contrato: 'contrato_frete_path',
}

interface Placa {
  placa: string
}

export interface AgendamentoRow extends Agendamento {
  solicitacao: {
    id: string
    numero_interno: number
    status: string
    cliente_id: string | null
    numero_instrucao: string | null
    observacoes: string | null
    motorista: { nome_completo: string; cpf: string | null; telefone: string | null } | null
    veiculo: Placa | null
    carreta: Placa | null
    primeira_carreta: Placa | null
    dolly: Placa | null
    parceiro_motorista: { nome_completo: string; cpf: string; telefone: string | null } | null
    parceiro_veiculo: Placa | null
    parceiro_carreta: Placa | null
    parceiro_primeira_carreta: Placa | null
    parceiro_dolly: Placa | null
    cliente: {
      razao_social: string
      cidade: string | null
      uf: string | null
      terminal_nome: string | null
      antecedencia_minima_horas: number | null
      observacoes_agendamento: string | null
    } | null
    material: { nome: string } | null
  } | null
  parceiro: { razao_social: string } | null
}

// `!inner` no embed da solicitação: `solicitacao_id` é NOT NULL, então o inner
// join nunca descarta linha — e é ele que permite filtrar por
// `solicitacao.cliente_id` no servidor, em vez de trazer tudo e filtrar aqui.
const SELECT_COM_JOINS = `
  *,
  solicitacao:solicitacao_id!inner (
    id, numero_interno, status, cliente_id, numero_instrucao, observacoes,
    motorista:motorista_id ( nome_completo, cpf, telefone ),
    veiculo:veiculo_id ( placa ),
    carreta:carreta_id ( placa ),
    primeira_carreta:primeira_carreta_id ( placa ),
    dolly:dolly_id ( placa ),
    parceiro_motorista:parceiro_motorista_id ( nome_completo, cpf, telefone ),
    parceiro_veiculo:parceiro_veiculo_id ( placa ),
    parceiro_carreta:parceiro_carreta_id ( placa ),
    parceiro_primeira_carreta:parceiro_primeira_carreta_id ( placa ),
    parceiro_dolly:parceiro_dolly_id ( placa ),
    cliente:cliente_id (
      razao_social, cidade, uf,
      terminal_nome, antecedencia_minima_horas, observacoes_agendamento
    ),
    material:material_id ( nome )
  ),
  parceiro:parceiro_id ( razao_social )
`

/** Quando a solicitação veio do portal, os ids internos são NULL e os dados
 *  vivem nas tabelas `parceiro_*` — mesma normalização de `useSolicitacoes`,
 *  para que o bloco de cópia leia de um lugar só. */
export interface DadosVeiculo {
  motoristaNome: string | null
  motoristaCpf: string | null
  /** O TCI Itutinga exige o telefone do motorista no agendamento. Já vinha na
   *  consulta; só não estava exposto no bloco de cópia. */
  motoristaTelefone: string | null
  placaCavalo: string | null
  placaCarreta: string | null
  placaPrimeiraCarreta: string | null
  placaDolly: string | null
}

export function dadosDoVeiculo(row: AgendamentoRow): DadosVeiculo {
  const s = row.solicitacao
  return {
    motoristaNome: s?.motorista?.nome_completo ?? s?.parceiro_motorista?.nome_completo ?? null,
    motoristaCpf: s?.motorista?.cpf ?? s?.parceiro_motorista?.cpf ?? null,
    motoristaTelefone: s?.motorista?.telefone ?? s?.parceiro_motorista?.telefone ?? null,
    placaCavalo: s?.veiculo?.placa ?? s?.parceiro_veiculo?.placa ?? null,
    placaCarreta: s?.carreta?.placa ?? s?.parceiro_carreta?.placa ?? null,
    placaPrimeiraCarreta: s?.primeira_carreta?.placa ?? s?.parceiro_primeira_carreta?.placa ?? null,
    placaDolly: s?.dolly?.placa ?? s?.parceiro_dolly?.placa ?? null,
  }
}

/** Nome do terminal como a equipe o chama, com queda para a razão social. */
export function nomeTerminal(row: AgendamentoRow): string {
  const c = row.solicitacao?.cliente
  return c?.terminal_nome?.trim() || c?.razao_social || 'Terminal não identificado'
}

export interface FilaFiltros {
  clienteId: string | null
  parceiroId: string | null
  status: AgendamentoStatus[]
}

export const FILA_STATUS_PADRAO: AgendamentoStatus[] = ['solicitado', 'em_andamento']

/** Fila da equipe. Ordenada por chegada: a lista é agrupada por terminal na
 *  tela, mas dentro do grupo quem esperou mais aparece primeiro. */
export function useFilaAgendamentos(filtros: FilaFiltros) {
  return useQuery({
    queryKey: ['agendamentos', 'fila', filtros],
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<AgendamentoRow[]> => {
      let q = supabase
        .from('agendamentos')
        .select(SELECT_COM_JOINS)
        .in('status', filtros.status.length > 0 ? filtros.status : FILA_STATUS_PADRAO)
        .order('created_at', { ascending: true })
        .limit(500)

      if (filtros.parceiroId) q = q.eq('parceiro_id', filtros.parceiroId)
      if (filtros.clienteId) q = q.eq('solicitacao.cliente_id', filtros.clienteId)

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as AgendamentoRow[]
    },
  })
}

/** Contador de pendentes para o badge da sidebar. */
export function useAgendamentosPendentesCount() {
  return useQuery({
    queryKey: ['agendamentos', 'pendentes-count'],
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('agendamentos')
        .select('id', { count: 'exact', head: true })
        .in('status', ['solicitado', 'em_andamento'])
      if (error) throw error
      return count ?? 0
    },
  })
}

/** Agendamentos de uma solicitação (histórico completo, mais recente primeiro):
 *  alimenta o card na tela de detalhe e a cadeia de reagendamentos. */
export function useAgendamentosDaSolicitacao(solicitacaoId: string | null | undefined) {
  return useQuery({
    enabled: !!solicitacaoId,
    queryKey: ['agendamentos', 'solicitacao', solicitacaoId],
    queryFn: async (): Promise<AgendamentoRow[]> => {
      const { data, error } = await supabase
        .from('agendamentos')
        .select(SELECT_COM_JOINS)
        .eq('solicitacao_id', solicitacaoId as string)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as AgendamentoRow[]
    },
  })
}

export function useAgendamento(id: string | null | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ['agendamentos', 'item', id],
    queryFn: async (): Promise<AgendamentoRow | null> => {
      const { data, error } = await supabase
        .from('agendamentos')
        .select(SELECT_COM_JOINS)
        .eq('id', id as string)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as unknown as AgendamentoRow | null
    },
  })
}

/** Nome de quem assumiu/concluiu. `assumido_por` referencia `auth.users`, que
 *  não é embutível pelo PostgREST — daí o mapa à parte. */
export function useNomesInternos() {
  return useQuery({
    queryKey: ['perfis-nomes'],
    staleTime: 300_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from('perfis_usuarios')
        .select('user_id, nome_completo')
      if (error) throw error
      const mapa = new Map<string, string>()
      for (const p of (data ?? []) as { user_id: string; nome_completo: string }[]) {
        mapa.set(p.user_id, p.nome_completo)
      }
      return mapa
    },
  })
}

function invalidarTudo(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['agendamentos'] })
}

export function useAssumirAgendamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('agendamento_assumir', { p_id: id } as never)
      if (error) throw error
      return id
    },
    onSuccess: () => invalidarTudo(qc),
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

/** Devolve o card à fila sem concluir — o oposto de assumir. */
export function useLiberarAgendamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('agendamentos')
        .update({ status: 'solicitado' } as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidarTudo(qc)
      toast.success('Agendamento devolvido à fila.')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

export interface ConclusaoInput {
  id: string
  dataAgendada: string
  horaAgendada: string
  notaFiscal: string | null
  notaFiscalOrigem: 'automatica' | 'manual' | null
}

/** Conclui: status `agendado`. Os documentos já foram gravados na linha no
 *  upload; aqui vai só o que a conclusão decide. O CHECK do banco exige data,
 *  hora, comprovante e contrato juntos — se algum faltar, o UPDATE é recusado
 *  em vez de gerar um "agendado" pela metade. O trigger carimba quem concluiu e
 *  se a hora saiu da grade. */
export function useConcluirAgendamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ConclusaoInput) => {
      const { error } = await supabase
        .from('agendamentos')
        .update({
          status: 'agendado',
          data_agendada: input.dataAgendada,
          hora_agendada: input.horaAgendada,
          nota_fiscal: input.notaFiscal,
          nota_fiscal_origem: input.notaFiscalOrigem,
        } as never)
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidarTudo(qc)
      toast.success('Agendamento concluído. O parceiro já vê o comprovante no portal.')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

export function useCancelarAgendamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('agendamentos')
        .update({ status: 'cancelado' } as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidarTudo(qc)
      toast.success('Agendamento cancelado.')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

/** Reagendar não sobrescreve: a linha antiga vira `substituido` e nasce uma
 *  nova em `solicitado`, encadeada pela anterior. Tudo numa transação, na RPC. */
export function useReagendarAgendamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      motivo: string
      novaData: string
      novaHora: string | null
    }) => {
      const { data, error } = await supabase.rpc('agendamento_reagendar', {
        p_agendamento_id: input.id,
        p_motivo: input.motivo,
        p_nova_data: input.novaData,
        p_nova_hora: input.novaHora,
      } as never)
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      invalidarTudo(qc)
      toast.success('Reagendamento aberto. O pedido voltou para a fila.')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

/** Cria o agendamento pelo lado interno (motorista que mandou WhatsApp direto).
 *  Escreve na tabela: a equipe tem RLS ALL, e o trigger deriva parceiro e
 *  status. */
export function useCriarAgendamentoInterno() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      solicitacaoId: string
      dataPreferida: string
      horaPreferida: string | null
      observacoes: string | null
    }) => {
      const { data, error } = await supabase
        .from('agendamentos')
        .insert({
          solicitacao_id: input.solicitacaoId,
          data_preferida: input.dataPreferida,
          hora_preferida: input.horaPreferida,
          observacoes: input.observacoes,
        } as never)
        .select('id')
        .single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: () => {
      invalidarTudo(qc)
      toast.success('Agendamento registrado na fila.')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

function caminhoDocumento(agendamentoId: string, tipo: TipoDocumento, file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
  return `${agendamentoId}/${tipo}-${Date.now()}.${ext}`
}

/** Sobe o documento e grava o caminho na linha no mesmo passo.
 *
 *  Arquivo primeiro, linha depois — se o UPDATE falhar, o pior caso é um
 *  arquivo órfão no bucket, que não quebra nada; a ordem inversa deixaria a
 *  linha apontando para o vazio (mesma compensação dos anexos).
 *
 *  Persistir aqui, e não na conclusão, é o que garante que fechar o painel no
 *  meio não perca o que já foi anexado. O parceiro só passa a ver os
 *  documentos quando o agendamento é concluído — a entrega continua sendo de
 *  todos de uma vez. */
export function useUploadDocumento() {
  const qc = useQueryClient()
  return useMutation<string, unknown, { agendamentoId: string; tipo: TipoDocumento; file: File }>({
    mutationFn: async ({ agendamentoId, tipo, file }) => {
      if (file.size > MAX_DOC_BYTES) {
        throw new Error(`Arquivo excede o limite de ${(MAX_DOC_BYTES / 1024 / 1024).toFixed(0)}MB.`)
      }
      const path = caminhoDocumento(agendamentoId, tipo, file)
      const { error: upErr } = await supabase.storage
        .from(AGENDAMENTOS_BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false })
      if (upErr) throw upErr

      const { error } = await supabase
        .from('agendamentos')
        .update({ [COLUNA_POR_TIPO[tipo]]: path } as never)
        .eq('id', agendamentoId)
      if (error) {
        await supabase.storage.from(AGENDAMENTOS_BUCKET).remove([path])
        throw error
      }
      return path
    },
    onSuccess: (_path, vars) => {
      qc.invalidateQueries({ queryKey: ['agendamentos'] })
      toast.success(
        vars.tipo === 'comprovante'
          ? 'Comprovante anexado.'
          : vars.tipo === 'contrato'
            ? 'Contrato de frete anexado.'
            : 'PDF da NF anexado.',
      )
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : traduzirErroBanco(e)
      toast.error(msg)
    },
  })
}

export async function getDocumentoSignedUrl(path: string, expiresInSec = 900): Promise<string> {
  const { data, error } = await supabase.storage
    .from(AGENDAMENTOS_BUCKET)
    .createSignedUrl(path, expiresInSec)
  if (error) throw error
  registrarAcesso('abrir_documento_agendamento', path, { expira_em_seg: expiresInSec })
  return data.signedUrl
}

export interface NotaFiscalAuto {
  /** false quando o módulo de Embarques ainda não existe no banco. */
  disponivel: boolean
  notaFiscal: string | null
  pesoLiquido: number | null
}

/** Busca a NF do embarque correspondente (join por instrução E placa, conforme
 *  SPEC-EMBARQUES 3.2). O módulo de Embarques é dependência OPCIONAL: sem ele a
 *  tabela não existe, o PostgREST responde erro e caímos no preenchimento
 *  manual — que é o caso esperado, não uma falha. */
export function useNotaFiscalAutomatica(row: AgendamentoRow | null | undefined) {
  const instrucao = row?.solicitacao?.numero_instrucao ?? null
  const placa = dadosDoVeiculo(row ?? ({} as AgendamentoRow)).placaCavalo
  return useQuery({
    enabled: !!row && !!instrucao && !!placa,
    queryKey: ['agendamentos', 'nf-auto', instrucao, placa],
    retry: false,
    staleTime: 300_000,
    queryFn: async (): Promise<NotaFiscalAuto> => {
      const { data, error } = await supabase
        .from('embarques' as never)
        .select('nota_fiscal, peso_liquido, data_emissao')
        .eq('instrucao_filial', instrucao as string)
        .eq('placa_cavalo', placa as string)
        .is('substituido_por', null)
        .order('data_emissao', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) return { disponivel: false, notaFiscal: null, pesoLiquido: null }
      const e = data as { nota_fiscal: string | null; peso_liquido: number | null } | null
      return {
        disponivel: true,
        notaFiscal: e?.nota_fiscal ?? null,
        pesoLiquido: e?.peso_liquido ?? null,
      }
    },
  })
}
