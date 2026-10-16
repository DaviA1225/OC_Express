import { useQuery } from '@tanstack/react-query'
import {
  buscarMapaCalor,
  buscarOpcoesClientes,
  buscarProdutividade,
  buscarRelatorioLocais,
  buscarRelatorioRanking,
  buscarRelatorioResumo,
  buscarRelatorioSerie,
  buscarRelatorioTempoEtapas,
} from './fonte'
import type { DimensaoRanking, FiltrosPeriodo, Granularidade, Periodo } from './tipos'

// Relatórios são análise, não ao vivo (§3.5): 5 min de cache + botão
// "Atualizar", que invalida ['metricas'].
const STALE = 5 * 60_000

function chave(p: FiltrosPeriodo) {
  return [p.de, p.ate, p.origem, p.clienteId, p.local] as const
}

export function useRelatorioResumo(p: FiltrosPeriodo) {
  return useQuery({ queryKey: ['metricas', 'resumo', ...chave(p)], queryFn: () => buscarRelatorioResumo(p), staleTime: STALE })
}

export function useRelatorioSerie(p: FiltrosPeriodo, gran: Granularidade) {
  return useQuery({ queryKey: ['metricas', 'serie', gran, ...chave(p)], queryFn: () => buscarRelatorioSerie(p, gran), staleTime: STALE })
}

export function useRelatorioTempoEtapas(p: FiltrosPeriodo, enabled = true) {
  return useQuery({
    queryKey: ['metricas', 'tempo-etapas', ...chave(p)],
    queryFn: () => buscarRelatorioTempoEtapas(p),
    staleTime: STALE,
    enabled,
  })
}

export function useRelatorioRanking(p: FiltrosPeriodo, dim: DimensaoRanking, enabled = true) {
  return useQuery({
    queryKey: ['metricas', 'ranking', dim, ...chave(p)],
    queryFn: () => buscarRelatorioRanking(p, dim),
    staleTime: STALE,
    enabled,
  })
}

export function useMapaCalor(p: FiltrosPeriodo, enabled = true) {
  return useQuery({ queryKey: ['metricas', 'mapa-calor', ...chave(p)], queryFn: () => buscarMapaCalor(p), staleTime: STALE, enabled })
}

export function useProdutividade(p: Periodo) {
  return useQuery({ queryKey: ['metricas', 'produtividade', p.de, p.ate], queryFn: () => buscarProdutividade(p), staleTime: STALE })
}

/** Opções de local (§4: vêm de `relatorio_locais`). */
export function useOpcoesLocais(p: Periodo) {
  return useQuery({ queryKey: ['metricas', 'locais', p.de, p.ate], queryFn: () => buscarRelatorioLocais(p), staleTime: 30 * 60_000 })
}

export function useOpcoesClientes() {
  return useQuery({ queryKey: ['metricas', 'opcoes-clientes'], queryFn: buscarOpcoesClientes, staleTime: 30 * 60_000 })
}
