import type { AgendamentoStatus } from '@sislog/shared/types'

/** Gêmeo de `apps/interno/src/features/agendamentos/agendamento.ts`, com os
 *  rótulos na linguagem do parceiro. Duplicado pelo mesmo motivo de
 *  `lib/acesso.ts`: cada app tem o próprio vocabulário de tela. */

export function numeroAgendamento(n: number): string {
  return `#A${String(n).padStart(4, '0')}`
}

export const AGENDAMENTO_STATUS_LABELS: Record<AgendamentoStatus, string> = {
  solicitado: 'Enviado',
  em_andamento: 'Em andamento',
  agendado: 'Agendado',
  substituido: 'Reagendado',
  cancelado: 'Cancelado',
}

export const AGENDAMENTO_STATUS_CLASSES: Record<AgendamentoStatus, string> = {
  solicitado: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  em_andamento: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  agendado: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  substituido: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  cancelado: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300',
}

/** `time` chega como `HH:MM:SS`; a tela fala em `HH:MM`. */
export function horaCurta(hora: string | null): string {
  if (!hora) return '—'
  return hora.slice(0, 5)
}

/** Sem `new Date()`: a string de `date` não tem fuso e converter deslocaria a
 *  data um dia para trás em UTC-3. */
export function dataCurta(data: string | null): string {
  if (!data) return '—'
  const [ano, mes, dia] = data.split('-')
  if (!ano || !mes || !dia) return data
  return `${dia}/${mes}`
}

export function dataCompleta(data: string | null): string {
  if (!data) return '—'
  const [ano, mes, dia] = data.split('-')
  if (!ano || !mes || !dia) return data
  return `${dia}/${mes}/${ano}`
}

/** Menor data aceitável considerando a antecedência exigida pelo terminal. */
export function dataMinima(antecedenciaHoras: number | null | undefined): string {
  const d = new Date(Date.now() + (antecedenciaHoras ?? 0) * 3_600_000)
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/** Pedido e confirmado divergem por rotina (agenda-se na data disponível mais
 *  próxima). Isso não é alarme — mas também não se esconde. */
export function divergiu(a: {
  data_preferida: string
  hora_preferida: string | null
  data_agendada: string | null
  hora_agendada: string | null
}): boolean {
  if (a.data_agendada == null) return false
  if (a.data_agendada !== a.data_preferida) return true
  return a.hora_preferida != null && a.hora_agendada !== a.hora_preferida
}
