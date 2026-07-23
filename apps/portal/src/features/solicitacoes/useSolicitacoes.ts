import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { registrarEvento } from '@/lib/eventos'
import { traduzirErroBanco } from '@/features/cadastros/useParceiroCrud'
import type { Tables, Views, PamcardStatus } from '@sislog/shared/types'

export type PortalSolicitacao = Views<'portal_solicitacoes'>
export type ClientePublico = Views<'clientes_publicos'>

// --- Bases do parceiro -------------------------------------------------------
// A view `portal_solicitacoes` expõe apenas IDs (decisão de segurança do
// Bloco 1). Para mostrar nomes/placas nas telas, carregamos as bases do
// parceiro inteiras e resolvemos os IDs no cliente — o volume de cada base é
// pequeno (uma transportadora, ~5 usuários).

type ParceiroBaseTable =
  | 'parceiro_motoristas'
  | 'parceiro_veiculos'
  | 'parceiro_carretas'
  | 'parceiro_subcontratadas'
  | 'parceiro_pamcards'

/** Carrega uma base de cadastro do parceiro inteira (ativos e inativos: uma
 *  solicitação antiga pode apontar para um registro já desativado). Usa a
 *  mesma chave invalidada por `useUpsertParceiroRow`, então o quick-create
 *  reflete na hora. */
// Sem limite explícito, o PostgREST corta a resposta no teto padrão (1000) e
// registros além disso somem do seletor de solicitação em silêncio (foi o que
// aconteceu com as carretas no app interno). Paginamos até esgotar para que a
// base inteira do parceiro sempre carregue, por menor que seja hoje.
const PARCEIRO_BASE_PAGE_SIZE = 1000

function useParceiroBase<T extends ParceiroBaseTable>(table: T, orderBy: string) {
  return useQuery({
    queryKey: ['parceiro-options', table],
    queryFn: async () => {
      const all: Tables<T>[] = []
      for (let from = 0; ; from += PARCEIRO_BASE_PAGE_SIZE) {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .order(orderBy as never, { ascending: true } as never)
          .range(from, from + PARCEIRO_BASE_PAGE_SIZE - 1)
        if (error) throw error
        const rows = (data ?? []) as unknown as Tables<T>[]
        all.push(...rows)
        if (rows.length < PARCEIRO_BASE_PAGE_SIZE) break
      }
      return all
    },
  })
}

export const useMotoristasBase = () =>
  useParceiroBase('parceiro_motoristas', 'nome_completo')
export const useVeiculosBase = () => useParceiroBase('parceiro_veiculos', 'placa')
export const useCarretasBase = () => useParceiroBase('parceiro_carretas', 'placa')
export const useSubcontratadasBase = () =>
  useParceiroBase('parceiro_subcontratadas', 'razao_social')
export const usePamcardsBase = () => useParceiroBase('parceiro_pamcards', 'numero')

/** Clientes da LHG disponíveis para o parceiro escolher (view pública —
 *  só `id, razao_social, cidade, uf` dos clientes ativos). */
export function useClientesPublicos() {
  return useQuery({
    queryKey: ['clientes-publicos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes_publicos')
        .select('*')
        .order('razao_social', { ascending: true })
      if (error) throw error
      return (data ?? []) as ClientePublico[]
    },
  })
}

// --- Solicitações ------------------------------------------------------------

/** Lista as solicitações do parceiro logado (a view já filtra por
 *  `origem='parceiro' AND parceiro_id = get_current_parceiro_id()`). */
export function useSolicitacoesPortal() {
  return useQuery({
    queryKey: ['portal-solicitacoes'],
    // O status (OC pronta, finalizada...) muda no lado da LHG e não chega ao
    // parceiro por realtime (sem SELECT em solicitacoes). Polling reflete sem
    // refresh manual; refocus também reconsulta. Intervalo a 120s e SEM polling
    // em background para conter egress (plano Free) — o refocus garante frescor.
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portal_solicitacoes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as PortalSolicitacao[]
    },
  })
}

export function useSolicitacaoPortal(id: string | undefined) {
  return useQuery({
    queryKey: ['portal-solicitacoes', id],
    enabled: !!id,
    refetchInterval: 90_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portal_solicitacoes')
        .select('*')
        .eq('id', id as string)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as PortalSolicitacao | null
    },
  })
}

export interface NovaSolicitacaoInput {
  parceiro_motorista_id: string
  parceiro_veiculo_id: string
  parceiro_carreta_id: string | null
  parceiro_primeira_carreta_id: string | null
  parceiro_dolly_id: string | null
  parceiro_subcontratada_id: string | null
  cliente_id: string
  pamcard_status: PamcardStatus
  pamcard_numero: string | null
  observacoes: string | null
}

/** Cria uma solicitação de carregamento a partir do portal. O material é
 *  deixado em branco — a equipe interna define no processamento (SPEC 5.5). */
export function useCriarSolicitacao() {
  const qc = useQueryClient()
  const { parceiro, parceiroUsuario } = useAuth()

  return useMutation({
    mutationFn: async (input: NovaSolicitacaoInput): Promise<string> => {
      if (!parceiro?.id || !parceiroUsuario?.id) {
        throw new Error('Sessão do parceiro não identificada. Recarregue a página.')
      }
      // O parceiro não tem policy de SELECT em `solicitacoes`, então não dá
      // para usar INSERT … RETURNING. Geramos o id no cliente para conhecer o
      // destino do redirecionamento sem precisar ler a tabela de volta.
      const id = crypto.randomUUID()
      const { error } = await supabase.from('solicitacoes').insert({
        id,
        tipo: 'carregamento',
        origem: 'parceiro',
        status: 'recebida',
        parceiro_id: parceiro.id,
        parceiro_usuario_id: parceiroUsuario.id,
        parceiro_motorista_id: input.parceiro_motorista_id,
        parceiro_veiculo_id: input.parceiro_veiculo_id,
        parceiro_carreta_id: input.parceiro_carreta_id,
        parceiro_primeira_carreta_id: input.parceiro_primeira_carreta_id,
        parceiro_dolly_id: input.parceiro_dolly_id,
        parceiro_subcontratada_id: input.parceiro_subcontratada_id,
        cliente_id: input.cliente_id,
        material_id: null,
        pamcard_status: input.pamcard_status,
        pamcard_numero: input.pamcard_numero,
        observacoes: input.observacoes,
      } as never)
      if (error) throw error
      return id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['portal-solicitacoes'] })
      void registrarEvento('portal_solicitacao_criada', { solicitacao_id: id })
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

/** Duplica uma solicitação: cria uma nova com os mesmos dados do parceiro
 *  (motorista, veículo, composição, cliente, pamcard, observações). O status
 *  volta a 'recebida' e o material fica em branco — a equipe interna redefine no
 *  processamento, igual ao create. Mesma via de INSERT direto (o parceiro tem
 *  policy de INSERT mas não de SELECT, então geramos o id no cliente). */
export function useDuplicarSolicitacao() {
  const qc = useQueryClient()
  const { parceiro, parceiroUsuario } = useAuth()

  return useMutation<string, unknown, { sourceId: string }>({
    mutationFn: async ({ sourceId }): Promise<string> => {
      if (!parceiro?.id || !parceiroUsuario?.id) {
        throw new Error('Sessão do parceiro não identificada. Recarregue a página.')
      }
      const { data: source, error: fetchErr } = await supabase
        .from('portal_solicitacoes')
        .select('*')
        .eq('id', sourceId)
        .maybeSingle()
      if (fetchErr) throw fetchErr
      if (!source) throw new Error('Solicitação original não encontrada.')
      const src = source as PortalSolicitacao

      const id = crypto.randomUUID()
      const { error } = await supabase.from('solicitacoes').insert({
        id,
        tipo: src.tipo,
        origem: 'parceiro',
        status: 'recebida',
        parceiro_id: parceiro.id,
        parceiro_usuario_id: parceiroUsuario.id,
        parceiro_motorista_id: src.parceiro_motorista_id,
        parceiro_veiculo_id: src.parceiro_veiculo_id,
        parceiro_carreta_id: src.parceiro_carreta_id,
        parceiro_primeira_carreta_id: src.parceiro_primeira_carreta_id,
        parceiro_dolly_id: src.parceiro_dolly_id,
        parceiro_subcontratada_id: src.parceiro_subcontratada_id,
        cliente_id: src.cliente_id,
        material_id: null,
        pamcard_status: src.pamcard_status,
        pamcard_numero: src.pamcard_numero,
        observacoes: src.observacoes,
      } as never)
      if (error) throw error
      return id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['portal-solicitacoes'] })
      void registrarEvento('portal_solicitacao_criada', { solicitacao_id: id })
      toast.success('Solicitação duplicada.')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

export interface EditarSolicitacaoInput extends NovaSolicitacaoInput {
  id: string
}

/** Edita uma solicitação ainda não processada. Vai por RPC SECURITY DEFINER
 *  (`portal_editar_solicitacao`) porque o parceiro não tem SELECT em
 *  `solicitacoes` — um UPDATE direto não acharia a linha (a RLS não a torna
 *  visível) e afetaria 0 linhas em silêncio. A função valida posse + status no
 *  servidor e edita a mesma linha, preservando `numero_interno`/fila. */
export function useEditarSolicitacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: EditarSolicitacaoInput): Promise<string> => {
      const { id, ...campos } = input
      const args = {
        p_id: id,
        p_motorista: campos.parceiro_motorista_id,
        p_veiculo: campos.parceiro_veiculo_id,
        p_carreta: campos.parceiro_carreta_id,
        p_primeira_carreta: campos.parceiro_primeira_carreta_id,
        p_dolly: campos.parceiro_dolly_id,
        p_subcontratada: campos.parceiro_subcontratada_id,
        p_cliente: campos.cliente_id,
        p_pamcard_status: campos.pamcard_status,
        p_pamcard_numero: campos.pamcard_numero,
        p_observacoes: campos.observacoes,
      } as never
      const { error } = await supabase.rpc('portal_editar_solicitacao', args)
      if (error) throw error
      return id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['portal-solicitacoes'] })
      void registrarEvento('portal_solicitacao_editada', { solicitacao_id: id })
      toast.success('Solicitação atualizada')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

// --- Download da OC ----------------------------------------------------------

/** Extrai o corpo JSON de um erro de Edge Function (FunctionsHttpError guarda
 *  o Response em `.context`). Devolve null se não der para ler. */
async function extractFunctionErrorBody(
  err: unknown,
): Promise<{ error?: string; detalhe?: string } | null> {
  try {
    const ctx = (err as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.clone().json()
      if (body && typeof body === 'object') return body as { error?: string; detalhe?: string }
    }
  } catch {
    /* ignora — cai no fallback */
  }
  return null
}

function traduzErroOc(code: string | undefined): string {
  switch (code) {
    case 'oc_indisponivel':
      return 'A OC ainda não está disponível para esta solicitação.'
    case 'forbidden':
      return 'Você não tem acesso a esta OC.'
    case 'solicitacao_nao_encontrada':
      return 'Solicitação não encontrada.'
    case 'sessao_invalida':
      return 'Sessão expirada. Recarregue a página e entre novamente.'
    default:
      return 'Não foi possível baixar a OC. Tente novamente.'
  }
}

/** Pede à Edge Function `baixar-oc` um signed URL curto do PDF da OC. O bucket
 *  `ocs-pdf` é privado e só o time interno tem acesso direto (migration 0026);
 *  a função autoriza o parceiro dono da solicitação e assina o link no servidor. */
export function useBaixarOC() {
  return useMutation({
    mutationFn: async (solicitacaoId: string): Promise<string> => {
      const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(
        'baixar-oc',
        { body: { solicitacao_id: solicitacaoId } },
      )
      if (error) {
        const fnBody = await extractFunctionErrorBody(error)
        throw new Error(traduzErroOc(fnBody?.error))
      }
      if (data?.error) throw new Error(traduzErroOc(data.error))
      if (!data?.url) throw new Error('Resposta sem link da OC.')
      return data.url
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/** Cancela a própria solicitação (só enquanto `status='recebida'`). Vai por RPC
 *  SECURITY DEFINER (`portal_cancelar_solicitacao`) pelo mesmo motivo da edição:
 *  sem SELECT em `solicitacoes`, um UPDATE direto afetaria 0 linhas em silêncio. */
export function useCancelarSolicitacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('portal_cancelar_solicitacao', { p_id: id } as never)
      if (error) throw error
      return id
    },
    onSuccess: (id) => {
      // Invalida a lista e o detalhe (a chave do detalhe tem este prefixo).
      qc.invalidateQueries({ queryKey: ['portal-solicitacoes'] })
      void registrarEvento('portal_solicitacao_cancelada', { solicitacao_id: id })
      toast.success('Solicitação cancelada')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}
