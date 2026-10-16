// Regras de período compartilhadas pelos Relatórios (§1 e §1.2 do plano).

import type { Granularidade, Periodo } from './tipos'

function lerDia(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Dias corridos do período (inclusivo). */
export function diasNoPeriodo(p: Periodo): number {
  return Math.max(1, Math.round((lerDia(p.ate).getTime() - lerDia(p.de).getTime()) / 86_400_000) + 1)
}

/** R9: por hora (1 dia), por dia (até 62 dias) ou por semana. */
export function granularidadePara(p: Periodo): Granularidade {
  const n = diasNoPeriodo(p)
  return n <= 1 ? 'hora' : n <= 62 ? 'dia' : 'semana'
}

/** Texto do comparador escrito no tile ("vs. ontem até 14h37"). */
export function textoComparador(p: Periodo, agora: Date): string {
  const n = diasNoPeriodo(p)
  const fim = lerDia(p.ate).getTime() + 86_400_000
  const parcial = fim > agora.getTime() && lerDia(p.de).getTime() <= agora.getTime()
  const hora = `${agora.getHours()}h${String(agora.getMinutes()).padStart(2, '0')}`
  if (n === 1) return parcial ? `vs. ontem até ${hora}` : 'vs. dia anterior'
  return `vs. ${n} dias anteriores`
}
