import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { SolicitacaoStatus, SolicitacaoTipo } from '@sislog/shared/types'

const HISTORICO_DIAS = 30

export interface HistoricoRecentePortal {
  id: string
  numero_interno: number
  status: SolicitacaoStatus
  tipo: SolicitacaoTipo
  created_at: string
  cliente_id: string | null
  parceiro_veiculo_id: string | null
}

export interface HistoricoResumoPortal {
  totalMotorista: number
  totalVeiculo: number
  totalParaCliente: number
  ultimaParaCliente: { id: string; numero_interno: number; created_at: string } | null
  topRota: { clienteId: string; count: number } | null
  recentes: HistoricoRecentePortal[]
}

interface Params {
  parceiroMotoristaId: string | null
  parceiroVeiculoId: string | null
  clienteId: string | null
  currentId: string
}

/**
 * Histórico operacional dos últimos 30 dias do motorista da solicitação, no
 * escopo do próprio parceiro. Espelha o `useHistoricoOperacional` do sistema
 * interno, mas lê a view `portal_solicitacoes` (a RLS já restringe ao parceiro
 * logado) e resolve nomes/placas no cliente, pois a view expõe só IDs.
 */
export function useHistoricoOperacionalPortal({
  parceiroMotoristaId,
  parceiroVeiculoId,
  clienteId,
  currentId,
}: Params) {
  return useQuery({
    enabled: !!parceiroMotoristaId,
    queryKey: ['portal-historico', parceiroMotoristaId, parceiroVeiculoId, clienteId, currentId],
    staleTime: 60_000,
    queryFn: async (): Promise<HistoricoResumoPortal> => {
      const desde = new Date(Date.now() - HISTORICO_DIAS * 24 * 3_600_000).toISOString()

      const { data, error } = await supabase
        .from('portal_solicitacoes')
        .select('id, numero_interno, status, tipo, cliente_id, parceiro_veiculo_id, created_at')
        .eq('parceiro_motorista_id', parceiroMotoristaId!)
        .neq('id', currentId)
        .gte('created_at', desde)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error

      const rows = (data ?? []) as HistoricoRecentePortal[]

      let totalVeiculo = 0
      let totalParaCliente = 0
      let ultimaParaCliente: HistoricoResumoPortal['ultimaParaCliente'] = null
      const counts = new Map<string, number>()

      for (const r of rows) {
        if (parceiroVeiculoId && r.parceiro_veiculo_id === parceiroVeiculoId) totalVeiculo += 1
        if (clienteId && r.cliente_id === clienteId) {
          totalParaCliente += 1
          // rows já vem do mais recente para o mais antigo
          if (!ultimaParaCliente) {
            ultimaParaCliente = {
              id: r.id,
              numero_interno: r.numero_interno,
              created_at: r.created_at,
            }
          }
        }
        if (r.cliente_id) counts.set(r.cliente_id, (counts.get(r.cliente_id) ?? 0) + 1)
      }

      let topRota: HistoricoResumoPortal['topRota'] = null
      for (const [cid, count] of counts) {
        if (!topRota || count > topRota.count) topRota = { clienteId: cid, count }
      }

      return {
        totalMotorista: rows.length,
        totalVeiculo,
        totalParaCliente,
        ultimaParaCliente,
        topRota,
        recentes: rows.slice(0, 5),
      }
    },
  })
}

export const HISTORICO_JANELA_DIAS = HISTORICO_DIAS
