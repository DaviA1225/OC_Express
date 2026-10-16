import { memo, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { animacaoSerie, axisProps, gridProps } from '@/components/charts/chartTheme'
import { DRILL_ATIVO, linkSolicitacoes } from '@/features/metricas/links'
import { hojeOperacao } from '@/lib/datasOperacao'
import type { FiltrosComuns, PainelHora } from '@/features/metricas/tipos'
import { fmtDec, fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'

const COR_FINALIZADAS = 'var(--chart-7)'
const COR_ENTRADAS = 'var(--chart-2)'
const COR_REF = 'var(--chart-ref)'

interface Props {
  porHora: PainelHora[]
  filtros?: FiltrosComuns
  tv?: boolean
  /** Hora atual (0–23) em MS, vinda do relógio da página: número, então o
   *  memo só re-renderiza quando a hora vira. */
  horaAtual: number
}

/**
 * P10 — finalizadas por hora hoje (barras grafite) contra a média da mesma hora
 * nos 4 mesmos dias da semana anteriores (linha tracejada); entradas como série
 * secundária. Clique numa barra abre a lista das finalizadas naquela hora
 * (com os dados reais ligados).
 */
export const VazaoHora = memo(function VazaoHora({ porHora, filtros, tv, horaAtual }: Props) {
  const navigate = useNavigate()
  // Dados e clique estáveis: o Recharts reinicia a animação quando a referência
  // muda, e a página re-renderiza a cada 30 s pelo relógio.
  // Horas que ainda não chegaram ficam sem valor (null): a linha de entradas
  // para na hora atual em vez de despencar a zero; a média segue até o fim.
  const dados = useMemo(() => {
    const comDado = porHora.filter((h) => h.finalizadas > 0 || h.entradas > 0 || h.ref > 0).map((h) => h.hora)
    const ini = Math.min(6, ...comDado)
    const fim = Math.max(20, ...comDado)
    // `ref` NÃO pode ir para o dado do gráfico: o Recharts espalha os campos do
    // ponto nas props do <path> da barra, e `ref` numérico derruba o React.
    return porHora
      .filter((h) => h.hora >= ini && h.hora <= fim)
      .map((h) => {
        const futura = h.hora > horaAtual
        return {
          hora: h.hora,
          finalizadas: futura ? null : h.finalizadas,
          entradas: futura ? null : h.entradas,
          media: h.ref,
          rotulo: `${h.hora}h`,
        }
      })
  }, [porHora, horaAtual])
  const altura = tv ? 360 : 240
  const abrirHora = useCallback((hora: number) => {
    if (!filtros || !DRILL_ATIVO) return
    const hoje = hojeOperacao()
    navigate(linkSolicitacoes({ status: 'finalizada', data: 'finalizada', de: hoje, ate: hoje, hora }, filtros))
  }, [filtros, navigate])
  const aoClicarBarra = useCallback(
    (d: unknown) => {
      const hora = (d as { payload?: { hora?: number } }).payload?.hora
      if (typeof hora === 'number') abrirHora(hora)
    },
    [abrirHora],
  )
  return (
    <div>
      <p className="sr-only">
        Finalizadas por hora hoje: {dados.filter((d) => (d.finalizadas ?? 0) > 0).map((d) => `${d.hora}h ${d.finalizadas}`).join('; ') || 'nenhuma'}.
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
                cursor={filtros && !tv && DRILL_ATIVO ? 'pointer' : undefined}
                onClick={aoClicarBarra}
                {...animacaoSerie}
              />
              {/* Entradas com marcador: grafite-azulado perto do grafite das barras,
                  o ponto separa a linha do topo das colunas. */}
              <Line
                dataKey="entradas"
                name="Entradas"
                stroke={COR_ENTRADAS}
                strokeWidth={tv ? 3 : 2}
                dot={{ r: tv ? 4 : 2.5, fill: 'hsl(var(--card))', stroke: COR_ENTRADAS, strokeWidth: tv ? 2 : 1.5 }}
                activeDot={!tv && { r: 4 }}
                {...animacaoSerie}
              />
              <Line
                dataKey="media"
                name="Média 4 semanas"
                stroke={COR_REF}
                strokeWidth={tv ? 2.5 : 1.5}
                strokeDasharray="4 3"
                dot={false}
                {...animacaoSerie}
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
})
