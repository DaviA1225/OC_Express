import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type RealtimeStatus = 'connecting' | 'live' | 'error'

/**
 * Subscribe once (per logged-in app session) to changes on solicitacoes and
 * cargas_retorno. On any change, invalidate the related react-query caches so
 * every connected user sees the update without refreshing.
 *
 * Returns the current connection status for UI feedback.
 */
export function useRealtimeSubscriptions(): RealtimeStatus {
  const qc = useQueryClient()
  const [status, setStatus] = React.useState<RealtimeStatus>('connecting')

  React.useEffect(() => {
    const channel = supabase
      .channel('app-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes' }, () => {
        qc.invalidateQueries({ queryKey: ['solicitacoes'] })
        qc.invalidateQueries({ queryKey: ['solicitacao'] })
        // `dashboard-estado-atual` alimenta os KPIs herói (pendentes/atrasadas).
        // Aqui havia `dashboard-counts` e `dashboard-oldest-pending`, chaves de
        // hooks que nao existem mais — invalidava-se o nada enquanto a chave
        // viva nunca era invalidada.
        qc.invalidateQueries({ queryKey: ['dashboard-estado-atual'] })
        qc.invalidateQueries({ queryKey: ['dashboard-status-breakdown'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cargas_retorno' }, () => {
        qc.invalidateQueries({ queryKey: ['cargas-retorno-options'] })
        qc.invalidateQueries({ queryKey: ['crud', 'cargas_retorno'] })
        qc.invalidateQueries({ queryKey: ['crud-count-active', 'cargas_retorno'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacao_pendencias' }, () => {
        qc.invalidateQueries({ queryKey: ['pendencias'] })
        qc.invalidateQueries({ queryKey: ['notifications'] })
      })
      // Agendamentos (0061): a fila é compartilhada por 15 pessoas e a trava de
      // "quem assumiu" só serve se o card mudar na tela dos outros na hora.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, () => {
        qc.invalidateQueries({ queryKey: ['agendamentos'] })
        qc.invalidateQueries({ queryKey: ['notifications'] })
      })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') setStatus('live')
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('error')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [qc])

  return status
}
