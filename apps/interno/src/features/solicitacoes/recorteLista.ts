// Recorte da lista vindo de um drill-down do Painel/Relatórios (§4 do plano dos
// dashboards). Cada número clicável manda parâmetros na URL; aqui eles viram
// filtros da lista com a MESMA definição das RPCs (0080), para o número do tile
// bater com o da lista.
//
// Parâmetros: sla=fora|aviso · data=criada|finalizada|cancelada + de/ate (dias
// em MS, inclusivos) + hora (0–23) · validade=vencendo|vencida · idade=<faixa>
// · pendencia=aberta · cliente · local ('Sem local') · parceiro ·
// origem=nao_parceiro · drill=conclusao48|sla_estourou.
// `ordem` é ignorado de propósito: a lista fica sempre com as mais recentes no
// topo (decisão do Davi, 2026-10-16).

import { diaOperacao, hojeOperacao, inicioDoDiaOperacao } from '@/lib/datasOperacao'
import { ETAPAS_FILA, type SlaCfg } from '@/features/metricas/sla'
import type { EtapaSla, FaixaIdade, TipoDrill } from '@/features/metricas/tipos'

export interface RecorteLista {
  sla: 'fora' | 'aviso' | null
  data: 'criada' | 'finalizada' | null
  de: string | null
  ate: string | null
  hora: number | null
  validade: 'vencendo' | 'vencida' | null
  idade: FaixaIdade | null
  pendencia: boolean
  cliente: string | null
  local: string | null
  parceiro: string | null
  naoParceiro: boolean
  drill: TipoDrill | null
}

/** Configuração vigente que alguns recortes precisam (SLA por etapa, alerta de validade). */
export interface ContextoRecorte {
  sla: Record<EtapaSla, SlaCfg>
  alertaValidadeH: number
}

/** Parâmetros que pertencem ao recorte (limpar o recorte apaga todos). */
export const PARAMS_RECORTE = [
  'sla', 'data', 'de', 'ate', 'hora', 'validade', 'idade', 'pendencia', 'cliente', 'local', 'parceiro', 'drill', 'ordem',
] as const

const FAIXAS: Record<FaixaIdade, [number, number | null]> = {
  lt1h: [0, 60], '1a4h': [60, 240], '4a8h': [240, 480], '8a24h': [480, 1440], gt24h: [1440, null],
}
const DIA = /^\d{4}-\d{2}-\d{2}$/

export function lerRecorte(params: URLSearchParams): RecorteLista | null {
  const v = (k: string) => params.get(k) || null
  const data = v('data')
  const drillParam = v('drill')
  const hora = v('hora')
  const r: RecorteLista = {
    sla: v('sla') === 'fora' || v('sla') === 'aviso' ? (v('sla') as 'fora' | 'aviso') : null,
    data: data === 'criada' || data === 'finalizada' ? data : null,
    de: v('de') && DIA.test(v('de')!) ? v('de') : null,
    ate: v('ate') && DIA.test(v('ate')!) ? v('ate') : null,
    hora: hora !== null && /^\d{1,2}$/.test(hora) && Number(hora) < 24 ? Number(hora) : null,
    validade: v('validade') === 'vencendo' || v('validade') === 'vencida' ? (v('validade') as 'vencendo' | 'vencida') : null,
    idade: v('idade') && v('idade')! in FAIXAS ? (v('idade') as FaixaIdade) : null,
    pendencia: v('pendencia') === 'aberta',
    cliente: v('cliente'),
    local: v('local'),
    parceiro: v('parceiro'),
    naoParceiro: v('origem') === 'nao_parceiro',
    // "Canceladas no período" sai das transições: mesmo caminho dos drills por id.
    drill: data === 'cancelada' ? 'cancelada'
      : drillParam === 'conclusao48' || drillParam === 'sla_estourou' ? drillParam : null,
  }
  const ativo = r.sla || r.data || r.validade || r.idade || r.pendencia || r.cliente || r.local || r.parceiro || r.naoParceiro || r.drill
  return ativo ? r : null
}

function fmtDia(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Texto curto do recorte, para a faixa acima da lista. */
export function descreverRecorte(r: RecorteLista): string[] {
  const out: string[] = []
  if (r.sla === 'fora') out.push('Fora do SLA da etapa')
  if (r.sla === 'aviso') out.push('Em aviso de SLA')
  if (r.drill === 'conclusao48') out.push('Concluídas em até 48 h')
  if (r.drill === 'sla_estourou') out.push('Finalizadas que estouraram o SLA em alguma etapa')
  if (r.drill === 'cancelada') out.push('Canceladas no período')
  if (r.data === 'finalizada') out.push('Finalizadas')
  if (r.data === 'criada') out.push('Entradas')
  if (r.de && r.ate) out.push(r.de === r.ate ? fmtDia(r.de) : `${fmtDia(r.de)} a ${fmtDia(r.ate)}`)
  if (r.hora !== null) out.push(`das ${r.hora}h às ${r.hora + 1}h`)
  if (r.validade === 'vencendo') out.push('OCs com validade vencendo')
  if (r.validade === 'vencida') out.push('OCs com validade vencida')
  if (r.idade) {
    const [a, b] = FAIXAS[r.idade]
    out.push(b === null ? `Na fila há mais de ${a / 60} h` : a === 0 ? 'Na fila há menos de 1 h' : `Na fila há ${a / 60}–${b / 60} h`)
  }
  if (r.pendencia) out.push('Com pendência aberta com o parceiro')
  if (r.naoParceiro) out.push('Internas (inclui e-mail e WhatsApp)')
  if (r.cliente) out.push('Cliente filtrado')
  if (r.local) out.push(`Local: ${r.local}`)
  if (r.parceiro) out.push('Parceiro filtrado')
  return out
}

/** Etapas implícitas no recorte (para não brigar com a "Fila de trabalho"). */
export function recorteDefineEtapas(r: RecorteLista): boolean {
  return !!(r.sla || r.idade || r.validade || r.data === 'finalizada' || r.drill)
}

// O builder do PostgREST muda de tipo a cada filtro; aqui só encadeamos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Consulta = any

/**
 * Cláusula `or` do PostgREST para "fora do SLA da etapa" (mesma regra de
 * sla_classificar, 0079): status de cada etapa ativa da fila com status_desde
 * antes de agora − alerta. null = nenhuma etapa com SLA ativo.
 */
export function clausulaSla(sla: Record<EtapaSla, SlaCfg>, classe: 'fora' | 'aviso', agora = new Date()): string | null {
  const partes: string[] = []
  for (const etapa of ETAPAS_FILA) {
    const c = sla[etapa]
    if (!c?.ativo) continue
    const tAviso = new Date(agora.getTime() - c.aviso_min * 60_000).toISOString()
    const tAlerta = new Date(agora.getTime() - c.alerta_min * 60_000).toISOString()
    partes.push(
      classe === 'fora'
        ? `and(status.eq.${etapa},status_desde.lt."${tAlerta}")`
        : `and(status.eq.${etapa},status_desde.lte."${tAviso}",status_desde.gte."${tAlerta}")`,
    )
  }
  return partes.length ? partes.join(',') : null
}

/** Aplica o recorte (menos o drill por id, que troca a ORIGEM da consulta). */
export function aplicarRecorte(q: Consulta, r: RecorteLista, ctx: ContextoRecorte, agora = new Date()): Consulta {
  if (r.naoParceiro) q = q.neq('origem', 'parceiro')
  if (r.cliente) q = q.eq('cliente_id', r.cliente)
  if (r.parceiro) q = q.eq('parceiro_id', r.parceiro)
  if (r.local) {
    q = r.local === 'Sem local'
      ? q.or('local_carregamento.is.null,local_carregamento.eq.')
      : q.eq('local_carregamento', r.local)
  }
  if (r.data && r.de && !r.drill) {
    const col = r.data === 'finalizada' ? 'finalizada_em' : 'created_at'
    let ini = inicioDoDiaOperacao(r.de)
    let fim = inicioDoDiaOperacao(r.ate ?? r.de, 1)
    if (r.hora !== null && ini) {
      ini = new Date(new Date(ini).getTime() + r.hora * 3_600_000).toISOString()
      fim = new Date(new Date(ini).getTime() + 3_600_000).toISOString()
    }
    if (ini) q = q.gte(col, ini)
    if (fim) q = q.lt(col, fim)
    if (r.data === 'finalizada') q = q.eq('status', 'finalizada')
  }
  if (r.validade) {
    const hoje = hojeOperacao(agora)
    q = q.in('status', ['oc_gerada', 'oc_enviada'])
    if (r.validade === 'vencida') q = q.lt('validade_fim', hoje)
    else {
      const limite = diaOperacao(new Date(agora.getTime() + ctx.alertaValidadeH * 3_600_000))
      q = q.gte('validade_fim', hoje).lte('validade_fim', limite)
    }
  }
  if (r.idade) {
    const [a, b] = FAIXAS[r.idade]
    q = q.in('status', ETAPAS_FILA)
    q = q.lte('created_at', new Date(agora.getTime() - a * 60_000).toISOString())
    if (b !== null) q = q.gt('created_at', new Date(agora.getTime() - b * 60_000).toISOString())
  }
  if (r.sla) {
    const c = clausulaSla(ctx.sla, r.sla, agora)
    q = c ? q.or(c) : q.eq('id', '00000000-0000-0000-0000-000000000000')
  }
  return q
}
