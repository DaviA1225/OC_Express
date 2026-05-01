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
  em_cadastro: 'bg-blue-100 text-blue-800',
  instrucao_emitida: 'bg-amber-100 text-amber-800',
  oc_gerada: 'bg-indigo-100 text-indigo-900',
  oc_enviada: 'bg-emerald-100 text-emerald-800',
  finalizada: 'bg-emerald-200 text-emerald-900',
  cancelada: 'bg-red-100 text-red-800',
}

export function nextStatus(current: SolicitacaoStatus): SolicitacaoStatus | null {
  if (current === 'cancelada' || current === 'finalizada') return null
  const i = STATUS_ORDER.indexOf(current)
  return i >= 0 ? STATUS_ORDER[i + 1] ?? null : null
}

export function canCancel(current: SolicitacaoStatus): boolean {
  return current !== 'cancelada' && current !== 'finalizada'
}

export function isEditable(current: SolicitacaoStatus): boolean {
  return current !== 'cancelada' && current !== 'finalizada'
}
