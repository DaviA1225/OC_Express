// SLA por etapa (D1/D2): espelho no front da função SQL
// `sla_classificar(p_status, p_desde, p_agora, p_aviso, p_alerta, p_ativo)` da
// migration 0079. As duas versões são validadas com os MESMOS vetores
// (VETORES_SLA, abaixo) — mudou a regra aqui, muda lá, e vice-versa.
//
// Regra (horas corridas):
//   - etapa sem SLA (finalizada, cancelada, oc_enviada ou `ativo=false`) → null
//   - minutos na etapa < aviso            → 'ok'   (inclui status_desde no futuro)
//   - aviso ≤ minutos ≤ alerta            → 'aviso'
//   - minutos > alerta                    → 'fora'

import type { SolicitacaoStatus } from '@/types/database.types'
import type { ClasseSla, EtapaFila, EtapaSla, SlaEtapa } from './tipos'

export interface SlaCfg {
  aviso_min: number
  alerta_min: number
  ativo: boolean
}

/** Etapas da fila de SLA, na ordem do fluxo. */
export const ETAPAS_FILA: EtapaFila[] = ['recebida', 'em_cadastro', 'instrucao_emitida', 'oc_gerada']

/** Etapas configuráveis (a fila + oc_enviada, que nasce desligada). */
export const ETAPAS_SLA: EtapaSla[] = [...ETAPAS_FILA, 'oc_enviada']

/**
 * Valores usados enquanto `sla_etapas` não respondeu (ou falhou): os mesmos do
 * seed da 0079 — 2 h de aviso e 8 h de alerta; "OC enviada" fora do SLA.
 */
export const SLA_FALLBACK: Record<EtapaSla, SlaCfg> = {
  recebida: { aviso_min: 120, alerta_min: 480, ativo: true },
  em_cadastro: { aviso_min: 120, alerta_min: 480, ativo: true },
  instrucao_emitida: { aviso_min: 120, alerta_min: 480, ativo: true },
  oc_gerada: { aviso_min: 120, alerta_min: 480, ativo: true },
  oc_enviada: { aviso_min: 120, alerta_min: 480, ativo: false },
}

/** Alerta de validade da OC (horas) enquanto `metas_operacao` não respondeu. */
export const VALIDADE_ALERTA_H_FALLBACK = 24

function ehEtapaSla(s: string): s is EtapaSla {
  return (ETAPAS_SLA as string[]).includes(s)
}

/**
 * Classifica uma solicitação no SLA da etapa atual. Função pura.
 *
 * @param status      status atual
 * @param statusDesde quando entrou na etapa (ISO, Date ou epoch ms)
 * @param agora       instante de referência (ISO, Date ou epoch ms)
 * @param cfg         limites da etapa; ausente → SLA_FALLBACK da etapa
 */
export function classificarSla(
  status: SolicitacaoStatus | string,
  statusDesde: string | number | Date | null | undefined,
  agora: string | number | Date,
  cfg?: SlaCfg | null,
): ClasseSla | null {
  if (!ehEtapaSla(status)) return null
  const c = cfg ?? SLA_FALLBACK[status]
  if (!c.ativo) return null
  if (statusDesde == null) return null
  const desde = new Date(statusDesde).getTime()
  const ref = new Date(agora).getTime()
  if (!Number.isFinite(desde) || !Number.isFinite(ref)) return null
  const min = (ref - desde) / 60_000
  if (min < c.aviso_min) return 'ok'
  if (min <= c.alerta_min) return 'aviso'
  return 'fora'
}

/** Minutos na etapa (≥ 0). */
export function minutosNaEtapa(statusDesde: string | number | Date, agora: string | number | Date): number {
  return Math.max(0, (new Date(agora).getTime() - new Date(statusDesde).getTime()) / 60_000)
}

/** Mapa status → cfg a partir das linhas de `sla_etapas` (com fallback por etapa). */
export function mapaSla(etapas: Pick<SlaEtapa, 'status' | 'aviso_min' | 'alerta_min' | 'ativo'>[] | null | undefined): Record<EtapaSla, SlaCfg> {
  const out = { ...SLA_FALLBACK }
  for (const e of etapas ?? []) out[e.status] = { aviso_min: e.aviso_min, alerta_min: e.alerta_min, ativo: e.ativo }
  return out
}

// ── Vetores de teste (os mesmos da §6.3 do plano, para SQL e front) ─────────
//
// Referência: agora = 2026-10-16T15:00:00-04:00; limites 120/480 min.
// No SQL: select sla_classificar(status, desde::timestamptz, agora::timestamptz, aviso, alerta, ativo)

export interface VetorSla {
  caso: string
  status: string
  desde: string | null
  agora: string
  aviso: number
  alerta: number
  ativo: boolean
  esperado: ClasseSla | null
}

const AGORA = '2026-10-16T15:00:00-04:00'
const menos = (min: number) => new Date(new Date(AGORA).getTime() - min * 60_000).toISOString()

export const VETORES_SLA: VetorSla[] = [
  { caso: 'etapa inativa', status: 'recebida', desde: menos(600), agora: AGORA, aviso: 120, alerta: 480, ativo: false, esperado: null },
  { caso: '0 min', status: 'recebida', desde: menos(0), agora: AGORA, aviso: 120, alerta: 480, ativo: true, esperado: 'ok' },
  { caso: 'aviso − 1', status: 'em_cadastro', desde: menos(119), agora: AGORA, aviso: 120, alerta: 480, ativo: true, esperado: 'ok' },
  { caso: 'aviso', status: 'em_cadastro', desde: menos(120), agora: AGORA, aviso: 120, alerta: 480, ativo: true, esperado: 'aviso' },
  { caso: 'alerta', status: 'instrucao_emitida', desde: menos(480), agora: AGORA, aviso: 120, alerta: 480, ativo: true, esperado: 'aviso' },
  { caso: 'alerta + 1', status: 'oc_gerada', desde: menos(481), agora: AGORA, aviso: 120, alerta: 480, ativo: true, esperado: 'fora' },
  { caso: 'status terminal (finalizada)', status: 'finalizada', desde: menos(9000), agora: AGORA, aviso: 120, alerta: 480, ativo: true, esperado: null },
  { caso: 'status terminal (cancelada)', status: 'cancelada', desde: menos(9000), agora: AGORA, aviso: 120, alerta: 480, ativo: true, esperado: null },
  { caso: 'status_desde no futuro', status: 'recebida', desde: menos(-30), agora: AGORA, aviso: 120, alerta: 480, ativo: true, esperado: 'ok' },
  { caso: 'oc_enviada (inativa no seed)', status: 'oc_enviada', desde: menos(900), agora: AGORA, aviso: 120, alerta: 480, ativo: false, esperado: null },
  { caso: 'status_desde nulo', status: 'recebida', desde: null, agora: AGORA, aviso: 120, alerta: 480, ativo: true, esperado: null },
]

/** Roda os vetores e devolve as falhas (vazio = tudo certo). */
export function conferirVetoresSla(): { caso: string; esperado: ClasseSla | null; obtido: ClasseSla | null }[] {
  return VETORES_SLA.flatMap((v) => {
    const obtido = classificarSla(v.status, v.desde, v.agora, { aviso_min: v.aviso, alerta_min: v.alerta, ativo: v.ativo })
    return obtido === v.esperado ? [] : [{ caso: v.caso, esperado: v.esperado, obtido }]
  })
}
