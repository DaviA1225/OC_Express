import { useNavigate } from 'react-router-dom'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { axisProps, gridProps } from '@/components/charts/chartTheme'
import { linkSolicitacoes } from '@/features/metricas/links'
import type { FiltrosComuns, PainelHora } from '@/features/metricas/tipos'
import { fmtDec, fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'

const COR_FINALIZADAS = 'var(--chart-7)'
const COR_ENTRADAS = 'var(--chart-2)'
const COR_REF = 'var(--chart-ref)'

function hojeIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Props {
  porHora: PainelHora[]
  filtros?: FiltrosComuns
  tv?: boolean
}

/**
 * P10 — finalizadas por hora hoje (barras grafite) contra a média da mesma hora
 * nos 4 mesmos dias da semana anteriores (linha tracejada); entradas como série
 * secundária. Clique numa barra abre a lista das finalizadas naquela hora.
 */
export function VazaoHora({ porHora, filtros, tv }: Props) {
  const navigate = useNavigate()
  const comDado = porHora.filter((h) => h.finalizadas > 0 || h.entradas > 0 || h.ref > 0).map((h) => h.hora)
  const ini = Math.min(6, ...comDado)
  const fim = Math.max(20, ...comDado)
  const dados = porHora.filter((h) => h.hora >= ini && h.hora <= fim).map((h) => ({ ...h, rotulo: `${h.hora}h` }))
  const altura = tv ? 360 : 240
  const abrirHora = (hora: number) => {
    if (!filtros) return
    const hoje = hojeIso()
    navigate(linkSolicitacoes({ status: 'finalizada', data: 'finalizada', de: hoje, ate: hoje, hora }, filtros))
  }
  return (
    <div>
      <p className="sr-only">
        Finalizadas por hora hoje: {dados.filter((d) => d.finalizadas > 0).map((d) => `${d.hora}h ${d.finalizadas}`).join('; ') || 'nenhuma'}.
      </p>
      {/* No celular a rolagem fica dentro do gráfico, nunca na página. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className={cn(!tv && 'min-w-[520px]')} style={{ height: altura }} aria-hidden>
          <ResponsiveContainer>
            <ComposedChart data={dados} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                dataKey="rotulo"
                {...axisProps}
                tick={{ ...axisProps.tick, fontSize: tv ? 18 : 11 }}
                interval={tv ? 1 : 0}
              />
              <YAxis {...axisProps} tick={{ ...axisProps.tick, fontSize: tv ? 18 : 11 }} allowDecimals={false} width={tv ? 56 : 40} />
              {!tv && (
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))' }}
                  content={(p) => (
                    <ChartTooltip {...p} formatValue={(v, nome) => (nome.startsWith('Média') ? fmtDec(v, 1, 0) : fmtInt(v))} />
                  )}
                />
              )}
              <Bar
                dataKey="finalizadas"
                name="Finalizadas"
                fill={COR_FINALIZADAS}
                radius={[2, 2, 0, 0]}
                maxBarSize={28}
                cursor={filtros && !tv ? 'pointer' : undefined}
                onClick={(d) => {
                  const hora = (d as { payload?: { hora?: number } }).payload?.hora
                  if (typeof hora === 'number') abrirHora(hora)
                }}
                isAnimationActive={!tv}
              />
              <Line dataKey="entradas" name="Entradas" stroke={COR_ENTRADAS} strokeWidth={1.5} dot={false} isAnimationActive={!tv} />
              <Line
                dataKey="ref"
                name="Média 4 semanas"
                stroke={COR_REF}
                strokeWidth={tv ? 2.5 : 1.5}
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={!tv}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className={cn('mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground', tv ? 'tv-meta' : 'text-meta')}>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-[1px]" style={{ backgroundColor: COR_FINALIZADAS }} /> Finalizadas
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3" style={{ backgroundColor: COR_ENTRADAS }} /> Entradas
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-0 w-3 border-t-2 border-dashed" style={{ borderColor: COR_REF }} /> Média das 4 últimas semanas
        </span>
      </div>
    </div>
  )
}
