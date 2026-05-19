import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
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

/** Carrega uma base de cadastro do parceiro inteira (ativos e inativos: uma
 *  solicitação antiga pode apontar para um registro já desativado). Usa a
 *  mesma chave invalidada por `useUpsertParceiroRow`, então o quick-create
 *  reflete na hora. */
function useParceiroBase<T extends ParceiroBaseTable>(table: T, orderBy: string) {
  return useQuery({
    queryKey: ['parceiro-options', table],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order(orderBy as never, { ascending: true } as never)
      if (error) throw error
      return (data ?? []) as unknown as Tables<T>[]
    },
  })
}

export const useMotoristasBase = () =>
  useParceiroBase('parceiro_motoristas', 'nome_completo')
export const useVeiculosBase = () => useParceiroBase('parceiro_veiculos', 'placa')
export const useCarretasBase = () => useParceiroBase('parceiro_carretas', 'placa')
export const useSubcontratadasBase = () =>
  useParceiroBase('parceiro_subcontratadas', 'razao_social')

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-solicitacoes'] })
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

/** Cancela a própria solicitação. A RLS só permite enquanto `status='recebida'`. */
export function useCancelarSolicitacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('solicitacoes')
        .update({ status: 'cancelada' } as never)
        .eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => {
      // Invalida a lista e o detalhe (a chave do detalhe tem este prefixo).
      qc.invalidateQueries({ queryKey: ['portal-solicitacoes'] })
      toast.success('Solicitação cancelada')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}
