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
        qc.invalidateQueries({ queryKey: ['dashboard-counts'] })
        qc.invalidateQueries({ queryKey: ['dashboard-status-breakdown'] })
        qc.invalidateQueries({ queryKey: ['dashboard-oldest-pending'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cargas_retorno' }, () => {
        qc.invalidateQueries({ queryKey: ['cargas-retorno-options'] })
        qc.invalidateQueries({ queryKey: ['crud', 'cargas_retorno'] })
        qc.invalidateQueries({ queryKey: ['crud-count-active', 'cargas_retorno'] })
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
