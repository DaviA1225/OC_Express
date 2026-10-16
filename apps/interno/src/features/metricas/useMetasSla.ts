import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { buscarConfigMetasSla, buscarFilaPrevia, salvarConfigMetasSla } from './fonte'
import type { ConfigMetasSlaEntrada } from './tipos'

/** Config de SLA por etapa e metas (muda raramente; invalidada ao salvar). */
export function useMetasSla() {
  return useQuery({ queryKey: ['metas-operacao'], queryFn: buscarConfigMetasSla, staleTime: 10 * 60_000 })
}

/** Fila atual para a prévia "com estes limites, hoje N estariam fora do SLA". */
export function useFilaPrevia() {
  return useQuery({ queryKey: ['metas-operacao', 'fila-previa'], queryFn: buscarFilaPrevia, staleTime: 60_000 })
}

export function useSalvarMetasSla() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ entrada, autorNome }: { entrada: ConfigMetasSlaEntrada; autorNome: string | null }) =>
      salvarConfigMetasSla(entrada, autorNome),
    onSuccess: (dados) => {
      qc.setQueryData(['metas-operacao'], dados)
      void qc.invalidateQueries({ queryKey: ['metas-operacao', 'fila-previa'] })
      // O SLA muda o Painel (fora/aviso) e o % acima do alerta nos Relatórios.
      void qc.invalidateQueries({ queryKey: ['painel'] })
      void qc.invalidateQueries({ queryKey: ['metricas'] })
    },
  })
}
