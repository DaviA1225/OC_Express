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
    // Rajadas viram UMA rodada de refetch. Uma ação em lote (finalizar 20
    // solicitações) dispara 20 eventos, e cada um, sozinho, refazia todas as
    // listas abertas em todas as telas conectadas — cada refetch é uma linha de
    // log no Supabase, e o plano Free estourou a cota de logs (2026-10).
    const pendentes = new Set<string>()
    let timer: ReturnType<typeof setTimeout> | null = null
    const agendar = (...chaves: string[]) => {
      for (const c of chaves) pendentes.add(c)
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        for (const c of pendentes) qc.invalidateQueries({ queryKey: JSON.parse(c) as unknown[] })
        pendentes.clear()
      }, 1500)
    }
    const k = (...key: unknown[]) => JSON.stringify(key)

    const channel = supabase
      .channel('app-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes' }, (payload) => {
        // Só o detalhe da solicitação que mudou. Invalidar `['solicitacao']`
        // inteiro refazia o detalhe aberto de cada usuário a cada mudança em
        // QUALQUER solicitação — era a maior fonte de requisições nos logs
        // (o mesmo detalhe buscado 30-64 vezes por hora).
        const id = (payload.new as { id?: string } | null)?.id ?? (payload.old as { id?: string } | null)?.id
        if (id) agendar(k('solicitacao', id))
        agendar(
          k('solicitacoes'),
          k('recebidas-count'),
          // `dashboard-estado-atual` alimenta os KPIs herói (pendentes/atrasadas).
          k('dashboard-estado-atual'),
          k('dashboard-status-breakdown'),
        )
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cargas_retorno' }, () => {
        agendar(
          k('cargas-retorno-options'),
          k('crud', 'cargas_retorno'),
          k('crud-count-active', 'cargas_retorno'),
        )
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacao_pendencias' }, () => {
        agendar(k('pendencias'), k('notifications'))
      })
      // Agendamentos (0061): a fila é compartilhada por 15 pessoas e a trava de
      // "quem assumiu" só serve se o card mudar na tela dos outros na hora.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, () => {
        agendar(k('agendamentos'), k('notifications'))
      })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') setStatus('live')
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('error')
      })

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [qc])

  return status
}
