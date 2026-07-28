import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { SLA_ALERT_HOURS, SLA_PENDING_STATUSES } from '@/features/solicitacoes/status'
import type { SolicitacaoStatus } from '@/types/database.types'

/** Status que contam como "na fila" — ainda não geraram OC. */
const PENDING_STATUSES: SolicitacaoStatus[] = ['recebida', 'em_cadastro', 'instrucao_emitida']

function baseCount() {
  return supabase.from('solicitacoes').select('id', { count: 'exact', head: true })
}

async function unwrap(
  promise: PromiseLike<{ count: number | null; error: { message: string } | null }>,
) {
  const { count, error } = await promise
  if (error) throw error
  return count ?? 0
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

/** KPIs herói do Dashboard: o que está na fila agora e o que furou o SLA. */
export function useEstadoAtual() {
  return useQuery({
    queryKey: ['dashboard-estado-atual'],
    staleTime: 30_000,
    queryFn: async (): Promise<{ pendentes: number; atrasadas: number }> => {
      const slaThreshold = new Date(Date.now() - SLA_ALERT_HOURS * 3_600_000).toISOString()
      const [pendentes, atrasadas] = await Promise.all([
        unwrap(baseCount().in('status', PENDING_STATUSES)),
        unwrap(baseCount().in('status', SLA_PENDING_STATUSES).lt('created_at', slaThreshold)),
      ])
      return { pendentes, atrasadas }
    },
  })
}
