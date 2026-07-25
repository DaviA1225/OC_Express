import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Realtime do portal. O parceiro tem policy de SELECT em `solicitacao_pendencias`
 * (migration 0035), então recebe os eventos das SUAS pendências — quando a equipe
 * devolve (INSERT) ou algo muda (UPDATE), o sino/banner/badge atualizam na hora,
 * sem refresh.
 *
 * Observação: `solicitacoes` NÃO entra aqui — o parceiro não tem SELECT nessa
 * tabela (lê pela view portal_solicitacoes), então a RLS do realtime não
 * entregaria esses eventos. A frescura do status vem do polling nas queries
 * de solicitação (refetchInterval em useSolicitacoes).
 */
export function usePortalRealtime() {
  const qc = useQueryClient()

  React.useEffect(() => {
    const channel = supabase
      .channel('portal-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'solicitacao_pendencias' },
        () => {
          qc.invalidateQueries({ queryKey: ['pendencias-abertas'] })
          qc.invalidateQueries({ queryKey: ['pendencia-aberta'] })
          qc.invalidateQueries({ queryKey: ['pendencias-solicitacao'] })
          qc.invalidateQueries({ queryKey: ['portal-solicitacoes'] })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [qc])
}
