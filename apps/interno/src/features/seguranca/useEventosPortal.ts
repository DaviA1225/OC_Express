import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Json, TipoEventoPortal } from '@/types/database.types'

export interface EventosPortalPeriodo {
  desde: string | null
  ate: string | null
}

export interface EventosPortalFilters {
  tipos: TipoEventoPortal[]
  parceiroIds: string[]
  periodo: EventosPortalPeriodo
  page: number
  pageSize: number
}

interface EventoPortalRow {
  id: string
  tipo_evento: TipoEventoPortal
  user_id: string | null
  parceiro_id: string | null
  parceiro_usuario_id: string | null
  email_tentado: string | null
  solicitacao_id: string | null
  ip: string | null
  user_agent: string | null
  metadata: Json | null
  created_at: string
}

export interface EventoPortalRowResolved extends EventoPortalRow {
  parceiro_razao_social: string | null
  parceiro_usuario_nome: string | null
  numero_interno_solicitacao: number | null
}

export const TIPO_EVENTO_LABELS: Record<TipoEventoPortal, string> = {
  portal_login: 'Login',
  portal_login_falha: 'Falha de login',
  portal_logout: 'Logout',
  portal_solicitacao_criada: 'Solicitação criada',
  portal_solicitacao_cancelada: 'Solicitação cancelada',
  portal_senha_alterada: 'Senha alterada',
}

export const TIPOS_EVENTO: TipoEventoPortal[] = [
  'portal_login',
  'portal_login_falha',
  'portal_logout',
  'portal_solicitacao_criada',
  'portal_solicitacao_cancelada',
  'portal_senha_alterada',
]

export function useEventosPortal(filters: EventosPortalFilters) {
  return useQuery({
    queryKey: ['eventos-portal', filters],
    queryFn: async () => {
      let q = supabase
        .from('eventos_portal')
        .select('*', { count: 'exact' })

      if (filters.tipos.length > 0) q = q.in('tipo_evento', filters.tipos)
      if (filters.parceiroIds.length > 0) q = q.in('parceiro_id', filters.parceiroIds)
      if (filters.periodo.desde) q = q.gte('created_at', filters.periodo.desde)
      if (filters.periodo.ate) q = q.lte('created_at', filters.periodo.ate)

      q = q.order('created_at', { ascending: false })
      const from = (filters.page - 1) * filters.pageSize
      const to = from + filters.pageSize - 1
      q = q.range(from, to)

      const { data, error, count } = await q
      if (error) throw error
      const rows = (data ?? []) as EventoPortalRow[]

      // Resolve parceiro / usuario_parceiro / solicitacao em uma rodada de joins
      // separados (a tabela nao tem FK declaradas no PostgREST porque parceiro_id
      // foi adicionado em ALTER TABLE).
      const parceiroIds = uniq(rows.map((r) => r.parceiro_id))
      const usuarioIds = uniq(rows.map((r) => r.parceiro_usuario_id))
      const solicitacaoIds = uniq(rows.map((r) => r.solicitacao_id))

      const [parceirosMap, usuariosMap, solicitacoesMap] = await Promise.all([
        parceiroIds.length === 0 ? new Map<string, string>() : fetchMap(
          'parceiros', parceiroIds, (r: { id: string; razao_social: string }) => [r.id, r.razao_social],
        ),
        usuarioIds.length === 0 ? new Map<string, string>() : fetchMap(
          'parceiro_usuarios', usuarioIds, (r: { id: string; nome_completo: string }) => [r.id, r.nome_completo],
        ),
        solicitacaoIds.length === 0 ? new Map<string, number>() : fetchMap(
          'solicitacoes', solicitacaoIds, (r: { id: string; numero_interno: number }) => [r.id, r.numero_interno],
        ),
      ])

      return {
        data: rows.map((r) => ({
          ...r,
          parceiro_razao_social: r.parceiro_id ? parceirosMap.get(r.parceiro_id) ?? null : null,
          parceiro_usuario_nome: r.parceiro_usuario_id ? usuariosMap.get(r.parceiro_usuario_id) ?? null : null,
          numero_interno_solicitacao: r.solicitacao_id ? solicitacoesMap.get(r.solicitacao_id) ?? null : null,
        })) as EventoPortalRowResolved[],
        count: count ?? 0,
      }
    },
  })
}

/** Lista parceiros para o filtro multi-select (somente os que aparecem como
 *  dono de algum evento ou estão ativos — usamos a tabela inteira já que sao poucos). */
export function useParceirosParaFiltro() {
  return useQuery({
    queryKey: ['parceiros-filtro-seguranca'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parceiros')
        .select('id, razao_social')
        .order('razao_social', { ascending: true })
      if (error) throw error
      return (data ?? []) as { id: string; razao_social: string }[]
    },
  })
}

/** Conta tentativas de login falhadas nas ultimas 24h — chamada separada porque
 *  o destaque no topo da pagina nao depende dos filtros aplicados. */
export function useLoginFalhasUltimas24h() {
  return useQuery({
    queryKey: ['eventos-portal-falhas-24h'],
    queryFn: async () => {
      const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count, error } = await supabase
        .from('eventos_portal')
        .select('id', { count: 'exact', head: true })
        .eq('tipo_evento', 'portal_login_falha')
        .gte('created_at', desde)
      if (error) throw error
      return count ?? 0
    },
  })
}

function uniq<T>(arr: (T | null | undefined)[]): T[] {
  return Array.from(new Set(arr.filter((x): x is T => x != null)))
}

async function fetchMap<R, K, V>(
  table: 'parceiros' | 'parceiro_usuarios' | 'solicitacoes',
  ids: string[],
  toEntry: (row: R) => [K, V],
): Promise<Map<K, V>> {
  const cols = table === 'solicitacoes'
    ? 'id, numero_interno'
    : table === 'parceiros'
      ? 'id, razao_social'
      : 'id, nome_completo'
  const { data, error } = await supabase.from(table).select(cols).in('id', ids)
  if (error) throw error
  const map = new Map<K, V>()
  for (const row of (data ?? []) as R[]) {
    const [k, v] = toEntry(row)
    map.set(k, v)
  }
  return map
}
