// Drill-down: cada número do Painel/Relatórios vira um link para a lista de
// Solicitações com os parâmetros da §4 do plano (sla, data, de/ate, validade,
// idade, hora, pendencia, drill, ordem, origem, cliente, local). A lista passa
// a entender os parâmetros novos no PR-B1; os links já saem no formato final.
//
// CONTRATO `origem` na lista: `parceiro` | `nao_parceiro` (tudo que não é
// parceiro: interno, e-mail e WhatsApp) | valores crus de `solicitacoes.origem`.
// O recorte "Internas" das telas de análise vira SEMPRE `nao_parceiro` — usar
// `origem=interno` filtraria só a origem crua 'interno' e o número da lista não
// bateria com o do tile.

import { DADOS_SIMULADOS } from './fonte'
import type { FiltrosComuns, OrigemFiltro } from './tipos'

type Valor = string | number | null | undefined

/**
 * Enquanto os números são simulados, nenhum drill-down abre a lista: ela
 * mostraria dados reais que não batem com o tile (e ids de mentira dão 404).
 */
export const DRILL_ATIVO = !DADOS_SIMULADOS

export const MSG_DRILL_INATIVO = 'Disponível quando os dados reais estiverem ligados'

/** Recorte de origem das telas → valor do parâmetro `origem` da lista. */
export function origemParaLista(o: OrigemFiltro | string): string | null {
  if (o === 'todas') return null
  if (o === 'interno') return 'nao_parceiro'
  return o
}

export function linkSolicitacoes(params: Record<string, Valor>, filtros?: FiltrosComuns): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue
    if (k === 'origem') {
      const o = origemParaLista(String(v))
      if (o) q.set(k, o)
      continue
    }
    q.set(k, String(v))
  }
  if (filtros) {
    const o = origemParaLista(filtros.origem)
    if (o && !q.has('origem')) q.set('origem', o)
    if (filtros.clienteId && !q.has('cliente')) q.set('cliente', filtros.clienteId)
    if (filtros.local && !q.has('local')) q.set('local', filtros.local)
  }
  const s = q.toString()
  return s ? `/solicitacoes?${s}` : '/solicitacoes'
}

export function linkSolicitacao(id: string): string {
  return `/solicitacoes/${id}`
}

/** `to` de um KpiTile: some (tile não clicável) enquanto o drill está desligado. */
export function drillTo(url: string): string | undefined {
  return DRILL_ATIVO ? url : undefined
}
