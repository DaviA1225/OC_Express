import type { AgendamentoStatus, TipoVeiculo, TipoVeiculoSlot } from '@/types/database.types'

/** `#A0412` — o "A" separa da numeração das solicitações na conversa da equipe. */
export function numeroAgendamento(n: number): string {
  return `#A${String(n).padStart(4, '0')}`
}

export const AGENDAMENTO_STATUS_LABELS: Record<AgendamentoStatus, string> = {
  solicitado: 'Na fila',
  em_andamento: 'Em atendimento',
  agendado: 'Agendado',
  substituido: 'Reagendado',
  cancelado: 'Cancelado',
}

export const AGENDAMENTO_STATUS_CLASSES: Record<AgendamentoStatus, string> = {
  solicitado: 'bg-slate-100 text-slate-700',
  em_andamento: 'status-em_cadastro',
  agendado: 'bg-emerald-100 text-emerald-800',
  substituido: 'cat-steel',
  cancelado: 'bg-red-100 text-red-800',
}

/** Gêmeo do rótulo do portal. O vocabulário vem de `clientes.aceita_cacamba` /
 *  `aceita_graneleiro` (0005) — a operação já fala assim. */
export const TIPO_VEICULO_LABELS: Record<TipoVeiculo, string> = {
  cacamba: 'Caçamba',
  graneleiro: 'Graneleiro',
}

/** Rótulo do slot na grade, onde existe um terceiro valor ('todos'). */
export const TIPO_SLOT_LABELS: Record<TipoVeiculoSlot, string> = {
  todos: 'Todos',
  cacamba: 'Caçamba',
  graneleiro: 'Graneleiro',
}

export function tipoVeiculoLabel(tipo: string | null | undefined): string | null {
  if (tipo === 'cacamba' || tipo === 'graneleiro') return TIPO_VEICULO_LABELS[tipo]
  return null
}

/** Terminal que atende cada tipo de veículo num horário diferente (A.B/CSN). A
 *  própria grade responde: basta um slot tipado. Terminal de grade única (TCI,
 *  MRS) tem tudo em 'todos'. */
export function separaPorTipo(slots: { tipo_veiculo: TipoVeiculoSlot }[]): boolean {
  return slots.some((s) => s.tipo_veiculo !== 'todos')
}

export function tiposDaGrade(slots: { tipo_veiculo: TipoVeiculoSlot }[]): TipoVeiculo[] {
  const ordem: TipoVeiculo[] = ['cacamba', 'graneleiro']
  return ordem.filter((t) => slots.some((s) => s.tipo_veiculo === t))
}

/** `time` do Postgres chega como `HH:MM:SS`; a operação fala em `HH:MM`. */
export function horaCurta(hora: string | null): string {
  if (!hora) return '—'
  return hora.slice(0, 5)
}

/** `2026-03-18` -> `18/03`. Sem `new Date()` de propósito: a string de `date`
 *  não tem fuso, e convertê-la para Date deslocava a data um dia para trás em
 *  UTC-3 (o mesmo tropeço que já apareceu nos relatórios). */
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

/** Data de hoje em `YYYY-MM-DD` no fuso local (não em UTC). */
export function hojeISO(): string {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/** Menor data aceitável considerando a antecedência exigida pelo terminal. */
export function dataMinima(antecedenciaHoras: number | null | undefined): string {
  const d = new Date(Date.now() + (antecedenciaHoras ?? 0) * 3_600_000)
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

export type EsperaSeveridade = 'normal' | 'atencao' | 'critico'

export interface Espera {
  severidade: EsperaSeveridade
  horas: number
  label: string
}

// Âmbar acima de 4h, vermelho acima de 8h (SPEC-AGENDAMENTOS 5.4). Mais curto
// que o SLA da solicitação porque o terminal fecha: um pedido que dorme na fila
// perde o dia, não só o turno.
export const ESPERA_ATENCAO_HORAS = 4
export const ESPERA_CRITICO_HORAS = 8

export function calcularEspera(createdAt: string | null): Espera {
  if (!createdAt) return { severidade: 'normal', horas: 0, label: 'agora' }
  const horas = (Date.now() - new Date(createdAt).getTime()) / 3_600_000
  const severidade: EsperaSeveridade =
    horas >= ESPERA_CRITICO_HORAS ? 'critico' : horas >= ESPERA_ATENCAO_HORAS ? 'atencao' : 'normal'
  return { severidade, horas, label: formatarEspera(horas) }
}

function formatarEspera(horas: number): string {
  if (horas < 1) {
    const min = Math.max(1, Math.round(horas * 60))
    return `há ${min}min`
  }
  if (horas < 24) return `há ${Math.floor(horas)}h`
  const dias = Math.floor(horas / 24)
  return `há ${dias}d`
}

/** Minutos de duração do slot em forma legível: 60 -> "1h", 360 -> "6h". */
export function duracaoLegivel(minutos: number): string {
  if (minutos % 60 === 0) return `${minutos / 60} h`
  return `${minutos} min`
}

/** Um agendamento assumido há mais de 2h volta a ser assumível: o card não pode
 *  ficar preso a quem saiu no meio do expediente (regra espelhada na RPC
 *  `agendamento_assumir`). */
export const ASSUMIDO_EXPIRA_HORAS = 2

export function assumidoExpirado(assumidoEm: string | null): boolean {
  if (!assumidoEm) return true
  return Date.now() - new Date(assumidoEm).getTime() > ASSUMIDO_EXPIRA_HORAS * 3_600_000
}

/** CPF mascarado na tela; o valor cheio só sai ao copiar, e o acesso fica
 *  registrado em auditoria (SPEC-AGENDAMENTOS 8 / COMPLIANCE). */
export function mascararCpf(cpf: string | null): string {
  if (!cpf) return '—'
  const so = cpf.replace(/\D/g, '')
  if (so.length !== 11) return '•••'
  return `•••.•••.${so.slice(6, 9)}-••`
}

export function formatarCpf(cpf: string | null): string {
  if (!cpf) return ''
  const so = cpf.replace(/\D/g, '')
  if (so.length !== 11) return cpf
  return `${so.slice(0, 3)}.${so.slice(3, 6)}.${so.slice(6, 9)}-${so.slice(9)}`
}
