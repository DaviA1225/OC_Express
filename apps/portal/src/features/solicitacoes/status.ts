import type { SolicitacaoStatus } from '@sislog/shared/types'

/**
 * Mapeamento de status do portal (SPEC-PORTAL 5.3). O parceiro NÃO vê as
 * distinções internas de status — a UX dele é "enviei → estão processando →
 * tá pronta → acabou". Vários status internos colapsam num único rótulo.
 */
export interface PortalStatusInfo {
  /** Texto curto para o badge. */
  badge: string
  /** Texto completo, usado em cabeçalhos e na linha do tempo. */
  label: string
  /** Classes Tailwind do badge. */
  className: string
}

export const PORTAL_STATUS: Record<SolicitacaoStatus, PortalStatusInfo> = {
  recebida: {
    badge: 'Enviada',
    label: 'Enviada — aguardando a LHG',
    className: 'bg-blue-100 text-blue-800',
  },
  em_cadastro: {
    badge: 'Em processamento',
    label: 'Em processamento pela LHG',
    className: 'bg-amber-100 text-amber-800',
  },
  instrucao_emitida: {
    badge: 'Em processamento',
    label: 'Em processamento pela LHG',
    className: 'bg-amber-100 text-amber-800',
  },
  oc_gerada: {
    badge: 'OC pronta',
    label: 'OC pronta — baixe pelo portal',
    className: 'bg-emerald-100 text-emerald-800',
  },
  oc_enviada: {
    badge: 'OC pronta',
    label: 'OC pronta — baixe pelo portal',
    className: 'bg-emerald-100 text-emerald-800',
  },
  finalizada: {
    badge: 'Concluída',
    label: 'Concluída',
    className: 'bg-emerald-200 text-emerald-900',
  },
  cancelada: {
    badge: 'Cancelada',
    label: 'Cancelada',
    className: 'bg-red-100 text-red-700',
  },
}

export function statusInfo(status: SolicitacaoStatus | null): PortalStatusInfo {
  return status ? PORTAL_STATUS[status] : PORTAL_STATUS.recebida
}

/** O parceiro só pode cancelar enquanto a solicitação ainda está em `recebida`
 *  (a política RLS garante essa regra no banco — aqui é só a UI). */
export function podeCancelar(status: SolicitacaoStatus | null): boolean {
  return status === 'recebida'
}

// --- Filtro de status (agrupa os status internos como o parceiro os enxerga) ---

export type StatusFiltro =
  | 'todas'
  | 'enviada'
  | 'em_processamento'
  | 'oc_pronta'
  | 'concluida'
  | 'cancelada'

export const STATUS_FILTRO_OPTIONS: { value: StatusFiltro; label: string }[] = [
  { value: 'todas', label: 'Todos os status' },
  { value: 'enviada', label: 'Enviada' },
  { value: 'em_processamento', label: 'Em processamento' },
  { value: 'oc_pronta', label: 'OC pronta' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'cancelada', label: 'Cancelada' },
]

const FILTRO_STATUSES: Record<Exclude<StatusFiltro, 'todas'>, SolicitacaoStatus[]> = {
  enviada: ['recebida'],
  em_processamento: ['em_cadastro', 'instrucao_emitida'],
  oc_pronta: ['oc_gerada', 'oc_enviada'],
  concluida: ['finalizada'],
  cancelada: ['cancelada'],
}

export function matchStatusFiltro(
  status: SolicitacaoStatus | null,
  filtro: StatusFiltro,
): boolean {
  if (filtro === 'todas') return true
  if (!status) return false
  return FILTRO_STATUSES[filtro].includes(status)
}
