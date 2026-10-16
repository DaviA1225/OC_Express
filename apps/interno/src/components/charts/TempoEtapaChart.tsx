import { StatusDot } from '@/components/shared/SolicitacaoStatusBadge'
import { STATUS_LABELS } from '@/features/solicitacoes/status'
import type { SlaCfg } from '@/features/metricas/sla'
import type { EtapaSla, TempoEtapaLinha } from '@/features/metricas/tipos'
import { fmtDur, fmtInt, fmtPct } from '@/lib/format'

interface Props {
  linhas: TempoEtapaLinha[]
  /** Limites vigentes por etapa: desenha a marca do alerta (só etapas ativas). */
  sla?: Record<EtapaSla, SlaCfg>
}

/**
 * R8 — tempo em cada etapa: barra = P50, traço = P90, e a marca laranja do
 * alerta da etapa. Com n < 5 a linha mostra "amostra pequena" em vez dos
 * percentis (§1, convenções). Sem drill-down: o detalhe por solicitação está
 * no CSV de dados.
 */
export function TempoEtapaChart({ linhas, sla }: Props) {
  const escala = Math.max(
    60,
    ...linhas.map((l) => l.p90_min ?? 0),
    ...linhas.map((l) => (sla && sla[l.status]?.ativo ? sla[l.status].alerta_min : 0)),
  ) * 1.05
  const pos = (min: number) => `${Math.min(100, (min / escala) * 100)}%`
  return (
    <div>
      <ul className="space-y-3">
        {linhas.map((l) => {
          const pequena = l.n < 5 || l.p50_min == null
          const alerta = sla && sla[l.status]?.ativo ? sla[l.status].alerta_min : null
          return (
            <li key={l.status} className="grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-[11rem_minmax(0,1fr)_15rem] md:items-center">
              <span className="flex items-center gap-1.5 text-body-sm text-foreground">
                <StatusDot status={l.status} />
                {STATUS_LABELS[l.status]}
              </span>
              <div
                className="relative h-4 rounded-[2px] bg-muted"
                role="img"
                aria-label={
                  pequena
                    ? `${STATUS_LABELS[l.status]}: amostra pequena (n=${l.n})`
                    : `${STATUS_LABELS[l.status]}: P50 ${fmtDur(l.p50_min)}, P90 ${fmtDur(l.p90_min)}, n=${l.n}`
                }
              >
                {!pequena && (
                  <>
                    <div className="absolute inset-y-0 left-0 rounded-[2px] bg-chart-7" style={{ width: pos(l.p50_min ?? 0) }} />
                    <div className="absolute -inset-y-1 w-[2px] bg-foreground" style={{ left: pos(l.p90_min ?? 0) }} />
                  </>
                )}
                {alerta != null && (
                  <div className="absolute -inset-y-1 w-0 border-l-2 border-dashed border-chart-1" style={{ left: pos(alerta) }} />
                )}
              </div>
              <span className="text-body-sm tabular-nums text-muted-foreground md:text-right">
                {pequena ? (
                  `amostra pequena · n=${fmtInt(l.n)}`
                ) : (
                  <>
                    <span className="font-medium text-foreground">{fmtDur(l.p50_min)}</span> · P90 {fmtDur(l.p90_min)} · n={fmtInt(l.n)}
                    {l.acima_alerta_pct != null && l.acima_alerta_pct > 0 && (
                      <span className="block text-meta text-primary-strong">{fmtPct(l.acima_alerta_pct)} acima do alerta</span>
                    )}
                  </>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-meta text-muted-foreground">
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-3 rounded-[1px] bg-chart-7" /> P50 (mediana)</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-[2px] bg-foreground" /> P90</span>
        {sla && <span className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-0 border-l-2 border-dashed border-chart-1" /> Alerta da etapa</span>}
      </div>
    </div>
  )
}
