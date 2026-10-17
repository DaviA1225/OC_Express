// Regras de período compartilhadas pelos Relatórios (§1 e §1.2 do plano).

import { hojeOperacao, relogioOperacao } from '@/lib/datasOperacao'
import type { Granularidade, Periodo } from './tipos'

/** `yyyy-mm-dd` → meia-noite LOCAL desse dia (nunca `new Date('yyyy-mm-dd')`, que é UTC). */
export function lerDia(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * `balde` da série (contrato: timestamptz ISO do INÍCIO do balde em Mato
 * Grosso do Sul). Devolve o relógio de parede de MS como Date local, então o
 * rótulo sai certo em qualquer fuso da estação.
 * Aceita também `yyyy-mm-dd` puro — o PostgREST devolve assim se a coluna sair
 * como `date` —, lido como dia, sem o deslocamento de UTC que jogaria o
 * rótulo para a véspera.
 */
export function lerBalde(balde: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(balde) ? lerDia(balde) : relogioOperacao(balde)
}

/** `yyyy-mm-dd` (local) de uma data. */
export function isoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  const hoje = hojeOperacao()
  const parcial = p.de <= hoje && p.ate >= hoje
  const hora = `${agora.getHours()}h${String(agora.getMinutes()).padStart(2, '0')}`
  if (n === 1) return parcial ? `vs. ontem até ${hora}` : 'vs. dia anterior'
  return `vs. ${n} dias anteriores`
}

// ── Vetores do `balde` (rodar em node: ver o relatório do PR) ───────────────

export const VETORES_BALDE: { caso: string; balde: string; esperado: string }[] = [
  { caso: 'date puro', balde: '2026-10-16', esperado: '2026-10-16' },
  { caso: 'timestamptz -04:00 (meia-noite MS)', balde: '2026-10-16T00:00:00-04:00', esperado: '2026-10-16' },
  { caso: 'timestamptz em UTC (04:00Z = 00:00 MS)', balde: '2026-10-16T04:00:00Z', esperado: '2026-10-16' },
  { caso: 'balde de hora (14h MS)', balde: '2026-10-16T14:00:00-04:00', esperado: '2026-10-16' },
  { caso: 'virada de mês', balde: '2026-11-01', esperado: '2026-11-01' },
  { caso: 'semana (segunda 00:00 MS)', balde: '2026-10-12T00:00:00-04:00', esperado: '2026-10-12' },
]

/** Confere os vetores (o resultado não depende do fuso do processo). */
export function conferirVetoresBalde(): { caso: string; esperado: string; obtido: string }[] {
  return VETORES_BALDE.flatMap((v) => {
    const obtido = isoDia(lerBalde(v.balde))
    return obtido === v.esperado ? [] : [{ caso: v.caso, esperado: v.esperado, obtido }]
  })
}
