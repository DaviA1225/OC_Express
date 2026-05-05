import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { SolicitacaoStatus, Tables } from '@/types/database.types'

export interface DashboardCounts {
  criadasHoje: number
  pendentes: number
  ocsGeradasHoje: number
  ocsEnviadasHoje: number
}

const PENDING_STATUSES: SolicitacaoStatus[] = ['recebida', 'em_cadastro', 'instrucao_emitida']

function startOfTodayISO(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
}

function baseCount() {
  return supabase.from('solicitacoes').select('id', { count: 'exact', head: true })
}

async function unwrap(promise: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count, error } = await promise
  if (error) throw error
  return count ?? 0
}

export function useDashboardCounts() {
  return useQuery({
    queryKey: ['dashboard-counts'],
    staleTime: 30_000,
    queryFn: async (): Promise<DashboardCounts> => {
      const todayISO = startOfTodayISO()

      const [criadasHoje, pendentes, ocsGeradasHoje, ocsEnviadasHoje] = await Promise.all([
        unwrap(baseCount().gte('created_at', todayISO)),
        unwrap(baseCount().in('status', PENDING_STATUSES)),
        unwrap(baseCount().not('pdf_url', 'is', null).gte('updated_at', todayISO)),
        unwrap(baseCount().gte('enviada_em', todayISO)),
      ])

      return { criadasHoje, pendentes, ocsGeradasHoje, ocsEnviadasHoje }
    },
  })
}

export interface StatusBreakdownItem {
  status: SolicitacaoStatus
  count: number
}

const ALL_STATUSES: SolicitacaoStatus[] = [
  'recebida', 'em_cadastro', 'instrucao_emitida',
  'oc_gerada', 'oc_enviada', 'finalizada', 'cancelada',
]

export function useStatusBreakdown() {
  return useQuery({
    queryKey: ['dashboard-status-breakdown'],
    staleTime: 60_000,
    queryFn: async (): Promise<StatusBreakdownItem[]> => {
      const results = await Promise.all(
        ALL_STATUSES.map(async (status) => {
          const { count, error } = await supabase
            .from('solicitacoes')
            .select('id', { count: 'exact', head: true })
            .eq('status', status)
          if (error) throw error
          return { status, count: count ?? 0 }
        }),
      )
      return results.filter((r) => r.count > 0)
    },
  })
}

type Sol = Tables<'solicitacoes'>
export interface OldestPendingRow extends Pick<Sol, 'id' | 'numero_interno' | 'status' | 'tipo' | 'created_at' | 'solicitante_nome'> {
  cliente: { razao_social: string } | null
  material: { nome: string } | null
}

export function useOldestPending(limit = 5) {
  return useQuery({
    queryKey: ['dashboard-oldest-pending', limit],
    staleTime: 30_000,
    queryFn: async (): Promise<OldestPendingRow[]> => {
      const { data, error } = await supabase
        .from('solicitacoes')
        .select(`
          id, numero_interno, status, tipo, created_at, solicitante_nome,
          cliente:cliente_id ( razao_social ),
          material:material_id ( nome )
        `)
        .in('status', PENDING_STATUSES)
        .order('created_at', { ascending: true })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as unknown as OldestPendingRow[]
    },
  })
}
