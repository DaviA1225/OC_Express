import { useQuery } from '@tanstack/react-query'
import { buscarPainelEstadoAtual, buscarPainelHoje } from './fonte'
import type { FiltrosComuns } from './tipos'

/**
 * Ao vivo (§3.5):
 * - Painel: polling de 120 s só com a aba visível (padrão do React Query) e o
 *   Realtime invalida `['painel']` em rajada de 1,5 s (useRealtimeSubscriptions);
 * - TV: polling de 60 s, inclusive em segundo plano — fora do AppLayout não há
 *   Realtime, e a TV é a aba "esquecida" na parede.
 */
export type ModoPainel = 'painel' | 'tv'

function opcoes(modo: ModoPainel) {
  return {
    refetchInterval: modo === 'tv' ? 60_000 : 120_000,
    refetchIntervalInBackground: modo === 'tv',
    staleTime: 30_000,
  }
}

export function usePainelEstadoAtual(f: FiltrosComuns, modo: ModoPainel = 'painel') {
  return useQuery({
    queryKey: ['painel', 'estado', f.origem, f.clienteId, f.local],
    queryFn: () => buscarPainelEstadoAtual(f),
    ...opcoes(modo),
  })
}

export function usePainelHoje(f: FiltrosComuns, modo: ModoPainel = 'painel') {
  return useQuery({
    queryKey: ['painel', 'hoje', f.origem, f.clienteId, f.local],
    queryFn: () => buscarPainelHoje(f),
    ...opcoes(modo),
  })
}
