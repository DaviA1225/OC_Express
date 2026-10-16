// Drill-down: cada número do Painel/Relatórios vira um link para a lista de
// Solicitações com os parâmetros da §4 do plano (sla, data, de/ate, validade,
// idade, hora, pendencia, drill, ordem, origem, cliente, local). A lista passa
// a entender os parâmetros novos no PR-B1; os links já saem no formato final.

import type { FiltrosComuns } from './tipos'

type Valor = string | number | null | undefined

export function linkSolicitacoes(params: Record<string, Valor>, filtros?: FiltrosComuns): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') q.set(k, String(v))
  }
  if (filtros) {
    if (filtros.origem !== 'todas' && !q.has('origem')) q.set('origem', filtros.origem)
    if (filtros.clienteId && !q.has('cliente')) q.set('cliente', filtros.clienteId)
    if (filtros.local && !q.has('local')) q.set('local', filtros.local)
  }
  const s = q.toString()
  return s ? `/solicitacoes?${s}` : '/solicitacoes'
}

export function linkSolicitacao(id: string): string {
  return `/solicitacoes/${id}`
}
