import { Link } from 'react-router-dom'
import { FAIXA_LABEL } from '@/features/metricas/rotulos'
import { linkSolicitacoes } from '@/features/metricas/links'
import { ETAPAS_FILA } from '@/features/metricas/sla'
import type { FiltrosComuns, PainelAging } from '@/features/metricas/tipos'
import { fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'

/** P9 — a fila em faixas pelo tempo desde a entrada; só "> 24 h" em laranja. */
export function IdadeFila({ aging, filtros, tv }: { aging: PainelAging[]; filtros?: FiltrosComuns; tv?: boolean }) {
  const max = Math.max(1, ...aging.map((a) => a.qtd))
  const total = aging.reduce((s, a) => s + a.qtd, 0)
  return (
    <div>
      <p className="sr-only">
        Idade da fila: {aging.map((a) => `${FAIXA_LABEL[a.faixa]}: ${a.qtd}`).join('; ')}.
      </p>
      <ul className={cn('grid grid-cols-5 items-end gap-2', tv ? 'h-[220px]' : 'h-[168px]')} aria-hidden>
        {aging.map((a) => {
          const critica = a.faixa === 'gt24h'
          const barra = (
            <>
              <span className={cn('font-medium tabular-nums', critica && a.qtd > 0 ? 'text-primary-strong' : 'text-foreground', tv ? 'tv-texto' : 'text-body-sm')}>
                {fmtInt(a.qtd)}
              </span>
              <span
                className="w-full rounded-t-[2px]"
                style={{
                  height: `${Math.max(a.qtd > 0 ? 4 : 1, (a.qtd / max) * 100)}%`,
                  backgroundColor: critica ? 'var(--chart-1)' : 'var(--chart-7)',
                }}
              />
            </>
          )
          return (
            <li key={a.faixa} className="flex h-full flex-col items-center justify-end gap-1">
              {tv || !filtros ? (
                barra
              ) : (
                <Link
                  to={linkSolicitacoes({ status: ETAPAS_FILA.join(','), idade: a.faixa, ordem: 'antiga' }, filtros)}
                  tabIndex={-1}
                  className="flex h-full w-full flex-col items-center justify-end gap-1 rounded-[2px] transition-colors duration-fast hover:bg-row-hover"
                >
                  {barra}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
      <ul className="mt-1.5 grid grid-cols-5 gap-2 border-t pt-1.5">
        {aging.map((a) => (
          <li key={a.faixa} className={cn('text-center text-muted-foreground', tv ? 'tv-meta' : 'text-meta')}>
            {tv || !filtros ? (
              FAIXA_LABEL[a.faixa]
            ) : (
              <Link
                to={linkSolicitacoes({ status: ETAPAS_FILA.join(','), idade: a.faixa, ordem: 'antiga' }, filtros)}
                className="hover:text-foreground hover:underline"
                aria-label={`${FAIXA_LABEL[a.faixa]}: ${a.qtd} na fila`}
              >
                {FAIXA_LABEL[a.faixa]}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {!tv && <p className="mt-2 text-meta text-muted-foreground">Tempo desde a entrada · {fmtInt(total)} na fila</p>}
    </div>
  )
}
