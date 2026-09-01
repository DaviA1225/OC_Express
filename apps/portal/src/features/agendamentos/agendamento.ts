import type { AgendamentoStatus, TipoVeiculo, TipoVeiculoSlot } from '@sislog/shared/types'

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

export const TIPO_VEICULO_LABELS: Record<TipoVeiculo, string> = {
  cacamba: 'Caçamba',
  graneleiro: 'Graneleiro',
}

/** Rótulo do BOTÃO de escolha, e só dele: caçamba e basculante são o mesmo
 *  veículo, e parte da operação usa uma palavra, parte usa a outra. Quem chama
 *  de basculante precisa se reconhecer na opção — errar o tipo aqui manda o
 *  caminhão para a grade errada do terminal.
 *
 *  O registro continua curto (`TIPO_VEICULO_LABELS`): depois de escolhido, o
 *  card não precisa repetir os dois nomes. */
export const TIPO_VEICULO_ESCOLHA: Record<TipoVeiculo, string> = {
  cacamba: 'Caçamba / Basculante',
  graneleiro: 'Graneleiro',
}

export function tipoVeiculoLabel(tipo: string | null | undefined): string | null {
  if (tipo === 'cacamba' || tipo === 'graneleiro') return TIPO_VEICULO_LABELS[tipo]
  return null
}

/** Terminal que atende cada tipo de veículo num horário diferente. A grade
 *  responde por si: basta um slot com tipo para a pergunta passar a valer.
 *  Terminal de grade única (TCI, MRS) tem tudo em 'todos' e a tela não pergunta
 *  nada. */
export function separaPorTipo(slots: { tipo_veiculo: TipoVeiculoSlot }[]): boolean {
  return slots.some((s) => s.tipo_veiculo !== 'todos')
}

/** Tipos que a grade oferece, na ordem em que a tela os mostra. */
export function tiposDaGrade(slots: { tipo_veiculo: TipoVeiculoSlot }[]): TipoVeiculo[] {
  const ordem: TipoVeiculo[] = ['cacamba', 'graneleiro']
  return ordem.filter((t) => slots.some((s) => s.tipo_veiculo === t))
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
