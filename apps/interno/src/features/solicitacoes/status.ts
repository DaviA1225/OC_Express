import { classificarSla, SLA_FALLBACK, type SlaCfg } from '@/features/metricas/sla'
import type { EtapaSla } from '@/features/metricas/tipos'
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

// Par fundo/texto do status vindo dos tokens --st-* (index.css), claro e
// escuro. Também define --status-dot (cor do ponto) para quem precisar.
export const STATUS_CLASSES: Record<SolicitacaoStatus, string> = {
  recebida: 'status-recebida',
  em_cadastro: 'status-em_cadastro',
  instrucao_emitida: 'status-instrucao_emitida',
  oc_gerada: 'status-oc_gerada',
  oc_enviada: 'status-oc_enviada',
  finalizada: 'status-finalizada',
  cancelada: 'status-cancelada',
}

/** Cor do status para gráfico/mapa (CSS var; vale em fill/stroke do Recharts). */
export const STATUS_COLOR_VAR: Record<SolicitacaoStatus, string> = {
  recebida: 'var(--st-recebida-dot)',
  em_cadastro: 'var(--st-em_cadastro-dot)',
  instrucao_emitida: 'var(--st-instrucao_emitida-dot)',
  oc_gerada: 'var(--st-oc_gerada-dot)',
  oc_enviada: 'var(--st-oc_enviada-dot)',
  finalizada: 'var(--st-finalizada-dot)',
  cancelada: 'var(--st-cancelada-dot)',
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

export type SlaSeverity = 'warning' | 'alert'

export interface SlaInfo {
  severity: SlaSeverity
  hours: number
  label: string
}

/**
 * Selo de SLA da linha: tempo NA ETAPA ATUAL (status_desde, 0079) contra o
 * limite configurado da etapa (Metas e SLA). Aviso → 'warning'; fora → 'alert';
 * dentro do prazo ou etapa sem SLA → null. Sem config, os padrões 2 h / 8 h.
 */
export function getSlaInfo(
  status: SolicitacaoStatus,
  statusDesde: string | null | undefined,
  cfg?: Record<EtapaSla, SlaCfg> | null,
): SlaInfo | null {
  if (!statusDesde) return null
  // Só a fila tem SLA (OC enviada fica fora, mesmo que alguém ative em Metas):
  // selo, chip "Atrasadas", notificação e Painel contam as mesmas etapas.
  if (!SLA_PENDING_STATUSES.includes(status)) return null
  const c = (cfg ?? SLA_FALLBACK)[status as EtapaSla]
  const classe = classificarSla(status, statusDesde, Date.now(), c ?? null)
  if (classe !== 'aviso' && classe !== 'fora') return null
  const hours = (Date.now() - new Date(statusDesde).getTime()) / 3_600_000
  return { severity: classe === 'fora' ? 'alert' : 'warning', hours, label: formatSlaLabel(hours) }
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
