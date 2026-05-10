import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { SolicitacaoStatus, SolicitacaoTipo } from '@/types/database.types'

const HISTORICO_DIAS = 30

export interface HistoricoRecent {
  id: string
  numero_interno: number
  status: SolicitacaoStatus
  tipo: SolicitacaoTipo
  created_at: string
  cliente: { razao_social: string } | null
  veiculo: { placa: string } | null
}

export interface HistoricoSummary {
  totalMotorista: number
  totalVeiculo: number
  totalParaCliente: number
  ultimaParaCliente: {
    numero_interno: number
    id: string
    created_at: string
    status: SolicitacaoStatus
  } | null
  topRota: { cliente: string; count: number } | null
  recentes: HistoricoRecent[]
}

interface Params {
  motoristaId: string | null
  veiculoId: string | null
  clienteId: string | null
  currentId: string
}

/**
 * Histórico operacional dos últimos 30 dias do motorista/veículo da solicitação,
 * usado pra ajudar o atendente a reconhecer "essa rota o cara já fez".
 */
export function useHistoricoOperacional({
  motoristaId,
  veiculoId,
  clienteId,
  currentId,
}: Params) {
  const enabled = !!motoristaId
  return useQuery({
    enabled,
    queryKey: ['historico-operacional', motoristaId, veiculoId, clienteId, currentId],
    staleTime: 60_000,
    queryFn: async (): Promise<HistoricoSummary> => {
      const desde = new Date(Date.now() - HISTORICO_DIAS * 24 * 3_600_000).toISOString()

      const recentesPromise = supabase
        .from('solicitacoes')
        .select(
          'id, numero_interno, status, tipo, cliente_id, created_at, cliente:cliente_id(razao_social), veiculo:veiculo_id(placa)',
        )
        .eq('motorista_id', motoristaId!)
        .neq('id', currentId)
        .gte('created_at', desde)
        .order('created_at', { ascending: false })
        .limit(20)

      const veiculoCountPromise = veiculoId
        ? supabase
            .from('solicitacoes')
            .select('id', { count: 'exact', head: true })
            .eq('veiculo_id', veiculoId)
            .neq('id', currentId)
            .gte('created_at', desde)
        : Promise.resolve({ count: 0, error: null })

      const ultimaClientePromise = clienteId
        ? supabase
            .from('solicitacoes')
            .select('id, numero_interno, status, created_at')
            .eq('motorista_id', motoristaId!)
            .eq('cliente_id', clienteId)
            .neq('id', currentId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null })

      const [recentesRes, veicRes, ultimaRes] = await Promise.all([
        recentesPromise,
        veiculoCountPromise,
        ultimaClientePromise,
      ])

      if (recentesRes.error) throw recentesRes.error
      if (veicRes.error) throw veicRes.error
      if (ultimaRes.error) throw ultimaRes.error

      const recentes = (recentesRes.data ?? []) as unknown as Array<
        HistoricoRecent & { cliente_id: string | null }
      >

      // Top rota do motorista nos últimos 30d (cliente mais frequente)
      const counts = new Map<string, { label: string; count: number }>()
      let totalParaCliente = 0
      for (const r of recentes) {
        if (r.cliente_id && clienteId && r.cliente_id === clienteId) totalParaCliente += 1
        const label = r.cliente?.razao_social
        if (!label) continue
        const cur = counts.get(label) ?? { label, count: 0 }
        cur.count += 1
        counts.set(label, cur)
      }
      let topRota: HistoricoSummary['topRota'] = null
      for (const v of counts.values()) {
        if (!topRota || v.count > topRota.count) topRota = { cliente: v.label, count: v.count }
      }

      return {
        totalMotorista: recentes.length,
        totalVeiculo: veicRes.count ?? 0,
        totalParaCliente,
        ultimaParaCliente: ultimaRes.data
          ? {
              id: ultimaRes.data.id,
              numero_interno: ultimaRes.data.numero_interno,
              status: ultimaRes.data.status as SolicitacaoStatus,
              created_at: ultimaRes.data.created_at,
            }
          : null,
        topRota,
        recentes: recentes.slice(0, 5).map((r) => ({
          id: r.id,
          numero_interno: r.numero_interno,
          status: r.status,
          tipo: r.tipo,
          created_at: r.created_at,
          cliente: r.cliente,
          veiculo: r.veiculo,
        })),
      }
    },
  })
}

export const HISTORICO_JANELA_DIAS = HISTORICO_DIAS
