// Cores de gráfico lidas dos tokens CSS (--chart-*), que mudam com o tema.
// Recharts aceita `var(--chart-n)` direto em fill/stroke de SVG — prefira isso.
// Use `chartColors()` só onde o valor precisa ser hex resolvido (canvas,
// Leaflet, export de imagem); chame dentro do render para pegar o tema atual.

export const CHART_SERIES = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
] as const

export const CHART_VARS = {
  ref: 'var(--chart-ref)',
  ok: 'var(--chart-ok)',
  bad: 'var(--chart-bad)',
  grid: 'var(--chart-grid)',
  axis: 'var(--chart-axis)',
} as const

/** Cor da série i (cicla depois da 8ª). */
export function seriesColor(i: number): string {
  return CHART_SERIES[((i % CHART_SERIES.length) + CHART_SERIES.length) % CHART_SERIES.length]
}

/** Props padrão de eixo/grade para Recharts (spread em XAxis/YAxis/CartesianGrid). */
export const axisProps = {
  tick: { fill: 'var(--chart-axis)', fontSize: 11 },
  axisLine: { stroke: 'var(--chart-grid)' },
  tickLine: false,
} as const

export const gridProps = {
  stroke: 'var(--chart-grid)',
  strokeDasharray: '0',
  vertical: false,
} as const

/** Valores resolvidos (hex) do tema atual — para quem não aceita var(). */
export function chartColors(): {
  series: string[]
  ref: string
  ok: string
  bad: string
  grid: string
  axis: string
  tooltipBg: string
} {
  const css = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null
  const v = (name: string, fallback: string) => css?.getPropertyValue(name).trim() || fallback
  return {
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => v(`--chart-${n}`, '#FF5100')),
    ref: v('--chart-ref', '#8A93A3'),
    ok: v('--chart-ok', '#2F7D4F'),
    bad: v('--chart-bad', '#C0362C'),
    grid: v('--chart-grid', '#E9ECF1'),
    axis: v('--chart-axis', '#5B6472'),
    tooltipBg: v('--chart-tooltip-bg', '#FFFFFF'),
  }
}
