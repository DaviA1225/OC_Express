import type { SolicitacaoStatus } from '@/types/database.types'

export const STATUS_ORDER: SolicitacaoStatus[] = [
  'recebida',
  'em_cadastro',
  'instrucao_emitida',
  'oc_gerada',
  'oc_enviada',
  'finalizada',
]

export const STATUS_LABELS: Record<SolicitacaoStatus, string> = {
  recebida: 'Recebida',
  em_cadastro: 'Em emissão',
  instrucao_emitida: 'Instrução emitida',
  oc_gerada: 'OC gerada',
  oc_enviada: 'OC enviada',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
}

export const STATUS_CLASSES: Record<SolicitacaoStatus, string> = {
  recebida: 'bg-slate-100 text-slate-700',
  em_cadastro: 'status-em_cadastro',
  instrucao_emitida: 'bg-amber-100 text-amber-800',
  oc_gerada: 'status-oc_gerada',
  oc_enviada: 'bg-emerald-100 text-emerald-800',
  finalizada: 'bg-emerald-200 text-emerald-900',
  cancelada: 'bg-red-100 text-red-800',
}


export function canCancel(current: SolicitacaoStatus): boolean {
  return current !== 'cancelada' && current !== 'finalizada'
}

export function isEditable(current: SolicitacaoStatus): boolean {
  return current !== 'finalizada'
}

export const SLA_PENDING_STATUSES: SolicitacaoStatus[] = [
  'recebida',
  'em_cadastro',
  'instrucao_emitida',
  'oc_gerada',
]

export const SLA_WARNING_HOURS = 2
export const SLA_ALERT_HOURS = 8

export type SlaSeverity = 'warning' | 'alert'

export interface SlaInfo {
  severity: SlaSeverity
  hours: number
  label: string
}

export function getSlaInfo(
  status: SolicitacaoStatus,
  createdAt: string | null,
): SlaInfo | null {
  if (!createdAt) return null
  if (!SLA_PENDING_STATUSES.includes(status)) return null
  const ms = Date.now() - new Date(createdAt).getTime()
  const hours = ms / 3_600_000
  if (hours < SLA_WARNING_HOURS) return null
  const severity: SlaSeverity = hours >= SLA_ALERT_HOURS ? 'alert' : 'warning'
  const label = formatSlaLabel(hours)
  return { severity, hours, label }
}

function formatSlaLabel(hours: number): string {
  if (hours < 1) {
    const min = Math.max(1, Math.round(hours * 60))
    return `há ${min}min`
  }
  if (hours < 24) return `há ${Math.floor(hours)}h`
  const days = Math.floor(hours / 24)
  return `há ${days}d`
}
