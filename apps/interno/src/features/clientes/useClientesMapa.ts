import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { SolicitacaoStatus, Tables } from '@/types/database.types'

/** Status que NÃO contam como "carregando" (carga já encerrada). */
const STATUS_ENCERRADOS: SolicitacaoStatus[] = ['finalizada', 'cancelada']

export interface ClienteMapaPonto {
  id: string
  razao_social: string
  cidade: string | null
  uf: string | null
  latitude: number
  longitude: number
  frete_cacamba: number | null
  frete_graneleiro: number | null
  liberado: boolean
  aceita_cacamba: boolean
  aceita_graneleiro: boolean
  /** Solicitações de carregamento em aberto neste cliente. */
  carregando: CargaAtiva[]
}

export interface CargaAtiva {
  id: string
  numero_interno: number
  status: SolicitacaoStatus
  veiculo: string | null
  carreta: string | null
  motorista: string | null
}

type ClienteRow = Pick<
  Tables<'clientes'>,
  | 'id' | 'razao_social' | 'cidade' | 'uf' | 'latitude' | 'longitude'
  | 'frete_cacamba' | 'frete_graneleiro' | 'liberado'
  | 'aceita_cacamba' | 'aceita_graneleiro'
>

interface SolicitacaoCargaRow {
  id: string
  numero_interno: number
  status: SolicitacaoStatus
  cliente_id: string | null
  veiculo: { placa: string } | null
  carreta: { placa: string } | null
  motorista: { nome_completo: string } | null
  parceiro_veiculo: { placa: string } | null
  parceiro_carreta: { placa: string } | null
  parceiro_motorista: { nome_completo: string } | null
}

const SOLIC_SELECT = `
  id, numero_interno, status, cliente_id,
  veiculo:veiculo_id ( placa ),
  carreta:carreta_id ( placa ),
  motorista:motorista_id ( nome_completo ),
  parceiro_veiculo:parceiro_veiculo_id ( placa ),
  parceiro_carreta:parceiro_carreta_id ( placa ),
  parceiro_motorista:parceiro_motorista_id ( nome_completo )
`

/**
 * Carrega os clientes de minério com coordenadas e, para cada um, as
 * solicitações de carregamento ainda em aberto (que veículo está carregando).
 * Recarrega a cada 30s para refletir cargas que entram/saem.
 */
export function useClientesMapaMinerio(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['clientes-mapa-minerio'],
    refetchInterval: 60_000,
    queryFn: async (): Promise<ClienteMapaPonto[]> => {
      const { data: clientesData, error: clientesErr } = await supabase
        .from('clientes')
        .select(
          'id, razao_social, cidade, uf, latitude, longitude, frete_cacamba, frete_graneleiro, liberado, aceita_cacamba, aceita_graneleiro',
        )
        .eq('cliente_minerio', true)
        .eq('ativo', true)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('razao_social', { ascending: true })
      if (clientesErr) throw clientesErr

      const clientes = (clientesData ?? []) as ClienteRow[]
      if (clientes.length === 0) return []

      const ids = clientes.map((c) => c.id)
      const { data: solicData, error: solicErr } = await supabase
        .from('solicitacoes')
        .select(SOLIC_SELECT)
        .in('cliente_id', ids)
        .not('status', 'in', `(${STATUS_ENCERRADOS.join(',')})`)
        .order('created_at', { ascending: false })
      if (solicErr) throw solicErr

      const solics = (solicData ?? []) as unknown as SolicitacaoCargaRow[]
      const porCliente = new Map<string, CargaAtiva[]>()
      for (const s of solics) {
        if (!s.cliente_id) continue
        const lista = porCliente.get(s.cliente_id) ?? []
        lista.push({
          id: s.id,
          numero_interno: s.numero_interno,
          status: s.status,
          veiculo: s.veiculo?.placa ?? s.parceiro_veiculo?.placa ?? null,
          carreta: s.carreta?.placa ?? s.parceiro_carreta?.placa ?? null,
          motorista: s.motorista?.nome_completo ?? s.parceiro_motorista?.nome_completo ?? null,
        })
        porCliente.set(s.cliente_id, lista)
      }

      return clientes.map((c) => ({
        id: c.id,
        razao_social: c.razao_social,
        cidade: c.cidade,
        uf: c.uf,
        latitude: c.latitude as number,
        longitude: c.longitude as number,
        frete_cacamba: c.frete_cacamba,
        frete_graneleiro: c.frete_graneleiro,
        liberado: c.liberado,
        aceita_cacamba: c.aceita_cacamba,
        aceita_graneleiro: c.aceita_graneleiro,
        carregando: porCliente.get(c.id) ?? [],
      }))
    },
  })
}
