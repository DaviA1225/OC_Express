import * as React from 'react'
import type { TooltipContentProps } from 'recharts'
import { fmtInt } from '@/lib/format'

type Base = Partial<TooltipContentProps>

export interface ChartTooltipProps extends Base {
  /** Formata cada valor (padrão fmtInt). Use fmtPct/fmtDur de @/lib/format. */
  formatValue?: (value: number, name: string) => string
  /** Formata o rótulo do eixo (data, hora, categoria). */
  formatLabel?: (label: string | number) => React.ReactNode
  /** Esconde séries com valor 0/nulo. */
  hideZero?: boolean
  /** Linha de rodapé (ex.: total). Recebe a soma dos valores numéricos. */
  footer?: (total: number) => React.ReactNode
}

/**
 * Tooltip compartilhado dos gráficos (Recharts 3). Fundo popover + borda nos
 * dois temas (o padrão do Recharts saía branco no escuro), números tabulares
 * formatados em pt-BR.
 *
 *   <Tooltip content={<ChartTooltip formatValue={(v) => fmtPct(v)} />} />
 *   <Tooltip content={(p) => <ChartTooltip {...p} formatLabel={fmtDia} />} />
 */
export function ChartTooltip({ active, payload, label, formatValue, formatLabel, hideZero, footer }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const linhas = payload.filter((p) => !hideZero || (typeof p.value === 'number' && p.value !== 0))
  if (linhas.length === 0) return null
  const fmt = formatValue ?? ((v: number) => fmtInt(v))
  const total = linhas.reduce((acc, p) => acc + (typeof p.value === 'number' ? p.value : 0), 0)

  return (
    <div className="min-w-[160px] rounded-md border bg-popover px-3 py-2 text-body-sm text-popover-foreground shadow-overlay">
      {label !== undefined && label !== '' && (
        <p className="mb-1.5 font-medium text-foreground">{formatLabel ? formatLabel(label) : label}</p>
      )}
      <ul className="space-y-1">
        {linhas.map((p, i) => {
          const nome = String(p.name ?? p.dataKey ?? '')
          const cor = p.color ?? p.stroke ?? p.fill
          const valor = typeof p.value === 'number' ? fmt(p.value, nome) : String(p.value ?? '—')
          return (
            <li key={`${nome}-${i}`} className="flex items-center gap-2">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-[1px]" style={{ backgroundColor: cor }} />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{nome}</span>
              <span className="font-medium tabular-nums text-foreground">{valor}</span>
            </li>
          )
        })}
      </ul>
      {footer && <div className="mt-1.5 border-t pt-1.5 tabular-nums">{footer(total)}</div>}
    </div>
  )
}
