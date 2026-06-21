import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts'
import { ClipboardCheck, ClipboardList, Hourglass, Percent, Download, Loader2, AlertTriangle, RotateCcw } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useRelatorioDataset,
  useStatusTransitions,
  calcKPIs,
  calcPorDia,
  topClientes,
  topMotoristas,
  topVeiculos,
  topSubcontratadas,
  topAtendentes,
  porMaterial,
  tmaPorStatus,
  periodoFromPreset,
  type PeriodoPreset,
  type PeriodoRelatorio,
  type TopItem,
  type TmaStatusEntry,
} from '@/features/relatorios/useRelatorios'
import { STATUS_LABELS } from '@/features/solicitacoes/status'
import { buildCsv, downloadCsv, type CsvColumn } from '@/lib/csv'
import { cn } from '@/lib/utils'

const PRESETS: { value: PeriodoPreset; label: string }[] = [
  { value: 'mes', label: 'Mês corrente' },
  { value: 'mes_anterior', label: 'Mês anterior' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
]

const VALID_PRESETS = PRESETS.map((p) => p.value)

const MATERIAL_COLORS = ['#FF5100', '#3b82f6', '#f59e0b', '#10b981', '#6366f1', '#ec4899', '#14b8a6', '#a855f7']

export default function RelatoriosPage() {
  const [params, setParams] = useSearchParams()
  const presetRaw = params.get('p')
  const preset: PeriodoPreset = (VALID_PRESETS as string[]).includes(presetRaw ?? '')
    ? (presetRaw as PeriodoPreset)
    : 'mes'
  const periodo = React.useMemo<PeriodoRelatorio>(() => periodoFromPreset(preset), [preset])
  const setPreset = (p: PeriodoPreset) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (p === 'mes') next.delete('p')
        else next.set('p', p)
        return next
      },
      { replace: true },
    )
  }

  const ds = useRelatorioDataset(periodo)

  const solicitacaoIds = React.useMemo(() => (ds.data?.rows ?? []).map((r) => r.id), [ds.data])
  const transitions = useStatusTransitions(periodo, solicitacaoIds)

  const kpis = ds.data ? calcKPIs(ds.data.rows) : null
  const porDia = ds.data ? calcPorDia(ds.data.rows, periodo) : []
  const top10Clientes = ds.data ? topClientes(ds.data, 10) : []
  const top10Motoristas = ds.data ? topMotoristas(ds.data, 10) : []
  const top10Veiculos = ds.data ? topVeiculos(ds.data, 10) : []
  const top10Subcontratadas = ds.data ? topSubcontratadas(ds.data, 10) : []
  const top10Atendentes = ds.data ? topAtendentes(ds.data, 10) : []
  const distribMaterial = ds.data ? porMaterial(ds.data) : []
  const tmaEntries = ds.data && transitions.data ? tmaPorStatus(ds.data.rows, transitions.data) : []

  const [exporting, setExporting] = React.useState(false)
  const exportCsv = () => {
    if (!ds.data) return
    setExporting(true)
    try {
      const cols: CsvColumn<{ secao: string; titulo: string; valor: string }>[] = [
        { header: 'Seção', accessor: (r) => r.secao },
        { header: 'Item', accessor: (r) => r.titulo },
        { header: 'Valor', accessor: (r) => r.valor },
      ]
      const linhas: { secao: string; titulo: string; valor: string }[] = []
      if (kpis) {
        linhas.push({ secao: 'KPIs', titulo: 'Total de OCs', valor: String(kpis.total) })
        linhas.push({ secao: 'KPIs', titulo: 'Finalizadas', valor: String(kpis.finalizadas) })
        linhas.push({ secao: 'KPIs', titulo: 'Em envio', valor: String(kpis.emEnvio) })
        linhas.push({ secao: 'KPIs', titulo: 'Canceladas', valor: String(kpis.canceladas) })
        linhas.push({ secao: 'KPIs', titulo: 'Taxa de finalização', valor: `${(kpis.taxaFinalizacao * 100).toFixed(1)}%` })
        linhas.push({
          secao: 'KPIs',
          titulo: 'Tempo médio (criada → finalizada)',
          valor: kpis.tempoMedioHoras != null ? `${kpis.tempoMedioHoras.toFixed(1)} h` : '—',
        })
      }
      for (const d of porDia) {
        linhas.push({ secao: 'Volume diário', titulo: d.dia, valor: `${d.total} OCs (${d.finalizadas} finalizadas)` })
      }
      for (const c of top10Clientes) {
        linhas.push({ secao: 'Top clientes', titulo: c.label, valor: String(c.total) })
      }
      for (const m of top10Motoristas) {
        linhas.push({ secao: 'Top motoristas', titulo: m.label, valor: String(m.total) })
      }
      for (const v of top10Veiculos) {
        linhas.push({ secao: 'Top veículos', titulo: v.label, valor: String(v.total) })
      }
      for (const s of top10Subcontratadas) {
        linhas.push({ secao: 'Top subcontratadas', titulo: s.label, valor: String(s.total) })
      }
      for (const a of top10Atendentes) {
        linhas.push({ secao: 'Top atendentes', titulo: a.label, valor: String(a.total) })
      }
      for (const m of distribMaterial) {
        linhas.push({ secao: 'Por material', titulo: m.label, valor: String(m.total) })
      }
      for (const t of tmaEntries) {
        linhas.push({
          secao: 'TMA por status',
          titulo: STATUS_LABELS[t.status as keyof typeof STATUS_LABELS] ?? t.status,
          valor: `média ${t.avgHours.toFixed(1)}h · mediana ${t.medianHours.toFixed(1)}h · n=${t.count}`,
        })
      }
      const csv = buildCsv(linhas, cols)
      const ts = new Date()
      const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}_${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}`
      downloadCsv(`relatorio_${preset}_${stamp}.csv`, csv)
      toast.success('Relatório exportado')
    } catch (err) {
      toast.error('Falha ao exportar')
      console.error(err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Relatórios</h1>
          <p className="text-[12px] text-muted-foreground">
            {periodo.label} · {format(new Date(periodo.desde), "dd/MM/yyyy", { locale: ptBR })}
            {' a '}
            {format(addDays(new Date(periodo.ate), -1), "dd/MM/yyyy", { locale: ptBR })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodoTabs value={preset} onChange={setPreset} />
          <Button
            type="button"
            variant="outline"
            onClick={exportCsv}
            disabled={exporting || ds.isLoading}
            title="Exportar relatório em CSV"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">Exportar</span>
          </Button>
        </div>
      </div>

      {ds.isError && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card py-16 text-center">
          <AlertTriangle className="h-6 w-6 text-red-500" />
          <p className="text-[14px] font-semibold text-foreground">Não foi possível carregar os relatórios</p>
          <p className="max-w-sm text-[13px] text-muted-foreground">Verifique a conexão e tente novamente.</p>
          <Button variant="outline" size="sm" onClick={() => { void ds.refetch() }} className="mt-1">
            <RotateCcw className="h-4 w-4" /> Tentar de novo
          </Button>
        </div>
      )}

      {!ds.isError && (
      <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total de OCs"
          value={kpis?.total ?? 0}
          icon={<ClipboardList className="h-4 w-4 text-foreground/70" />}
          accent="bg-muted/60 border"
          isLoading={ds.isLoading}
        />
        <KpiCard
          label="Finalizadas"
          value={kpis?.finalizadas ?? 0}
          icon={<ClipboardCheck className="h-4 w-4 text-foreground/70" />}
          accent="bg-muted/60 border"
          isLoading={ds.isLoading}
        />
        <KpiCard
          label="Taxa de finalização"
          value={kpis ? `${(kpis.taxaFinalizacao * 100).toFixed(1)}%` : '—'}
          icon={<Percent className="h-4 w-4 text-foreground/70" />}
          accent="bg-muted/60 border"
          isLoading={ds.isLoading}
        />
        <KpiCard
          label="Tempo médio (criada → finalizada)"
          value={kpis?.tempoMedioHoras != null ? `${kpis.tempoMedioHoras.toFixed(1)} h` : '—'}
          icon={<Hourglass className="h-4 w-4 text-foreground/70" />}
          accent="bg-muted/60 border"
          isLoading={ds.isLoading}
        />
      </div>

      <Card title="Volume diário" subtitle="Solicitações criadas por dia">
        <VolumeChart data={porDia} isLoading={ds.isLoading} />
      </Card>

      <Card
        title="TMA por status"
        subtitle="Tempo médio até sair de cada etapa (intervalos concluídos)"
      >
        <TmaChart entries={tmaEntries} isLoading={ds.isLoading || transitions.isLoading} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Top 10 clientes" subtitle="Por número de OCs no período">
          <TopList items={top10Clientes} isLoading={ds.isLoading} emptyText="Nenhum cliente no período." />
        </Card>
        <Card title="Top 10 motoristas" subtitle="Por número de OCs no período">
          <TopList items={top10Motoristas} isLoading={ds.isLoading} emptyText="Nenhum motorista no período." />
        </Card>
        <Card title="Top 10 subcontratadas" subtitle="Por número de OCs no período">
          <TopList items={top10Subcontratadas} isLoading={ds.isLoading} emptyText="Nenhuma subcontratada no período." />
        </Card>
        <Card title="Top 10 veículos" subtitle="Por número de OCs no período">
          <TopList items={top10Veiculos} isLoading={ds.isLoading} emptyText="Nenhum veículo no período." />
        </Card>
        <Card title="Ranking de atendentes" subtitle="Por número de OCs no período">
          <TopList items={top10Atendentes} isLoading={ds.isLoading} emptyText="Nenhum atendente atribuído no período." />
        </Card>
      </div>

      <Card title="Distribuição por material" subtitle="Participação de cada material no volume total">
        <MaterialDonut data={distribMaterial} isLoading={ds.isLoading} />
      </Card>
      </>
      )}
    </div>
  )
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}

function PeriodoTabs({ value, onChange }: { value: PeriodoPreset; onChange: (v: PeriodoPreset) => void }) {
  return (
    <div className="inline-flex rounded-lg border bg-card p-1" role="tablist">
      {PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          role="tab"
          aria-selected={value === p.value}
          onClick={() => onChange(p.value)}
          className={cn(
            'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
            value === p.value
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground/70 hover:bg-muted hover:text-foreground',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

interface KpiCardProps {
  label: string
  value: number | string
  icon: React.ReactNode
  accent: string
  isLoading: boolean
}

function KpiCard({ label, value, icon, accent, isLoading }: KpiCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">{label}</p>
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-md', accent)}>{icon}</span>
      </div>
      {isLoading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <p className="mt-1 text-[24px] font-medium tabular-nums text-foreground">{value}</p>
      )}
    </div>
  )
}

interface CardProps {
  title: string
  subtitle?: string
  children: React.ReactNode
}

function Card({ title, subtitle, children }: CardProps) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="border-b px-4 py-3">
        <h2 className="text-[14px] font-medium text-foreground">{title}</h2>
        {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

interface VolumeChartProps {
  data: { dia: string; total: number; finalizadas: number }[]
  isLoading: boolean
}

function VolumeChart({ data, isLoading }: VolumeChartProps) {
  if (isLoading) return <Skeleton className="h-[260px] w-full" />
  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-[13px] text-muted-foreground">
        Sem dados no período.
      </div>
    )
  }
  const formatted = data.map((d) => ({
    ...d,
    label: format(new Date(d.dia), 'dd/MM', { locale: ptBR }),
  }))
  return (
    <div className="h-[260px] w-full" role="group" aria-label="Volume diário de OCs criadas e finalizadas no período">
      <ResponsiveContainer>
        <LineChart accessibilityLayer data={formatted} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
            labelFormatter={(_, p) => {
              const item = p?.[0]?.payload as { dia: string } | undefined
              return item?.dia ? format(new Date(item.dia), "dd 'de' MMMM", { locale: ptBR }) : ''
            }}
            formatter={(value, name) => [
              `${value ?? 0}`,
              String(name) === 'total' ? 'Total criadas' : 'Finalizadas',
            ]}
          />
          <Line
            type="monotone"
            dataKey="total"
            stroke="#FF5100"
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="finalizadas"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-[#FF5100]" /> Total criadas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-[#10b981]" /> Finalizadas
        </span>
      </div>
    </div>
  )
}

interface TopListProps {
  items: TopItem[]
  isLoading: boolean
  emptyText: string
}

function TopList({ items, isLoading, emptyText }: TopListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="flex h-[150px] items-center justify-center text-[13px] text-muted-foreground">
        {emptyText}
      </div>
    )
  }
  const max = items[0]?.total ?? 1
  return (
    <ul className="space-y-1">
      {items.map((it, i) => {
        const pct = (it.total / max) * 100
        return (
          <li key={it.id} className="flex items-center gap-2 text-[12px]">
            <span className="w-5 text-right tabular-nums text-muted-foreground">{i + 1}.</span>
            <div className="relative min-w-0 flex-1 rounded bg-muted">
              <div
                className="h-6 rounded bg-primary/15"
                style={{ width: `${pct}%` }}
              />
              <span className="absolute inset-0 flex items-center px-2 text-foreground">
                <span className="truncate">{it.label}</span>
              </span>
            </div>
            <span className="w-10 text-right tabular-nums font-medium text-foreground">{it.total}</span>
          </li>
        )
      })}
    </ul>
  )
}

interface TmaChartProps {
  entries: TmaStatusEntry[]
  isLoading: boolean
}

function TmaChart({ entries, isLoading }: TmaChartProps) {
  if (isLoading) return <Skeleton className="h-[260px] w-full" />
  if (entries.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-[13px] text-muted-foreground">
        Sem transições suficientes para calcular TMA. Aumente o período.
      </div>
    )
  }
  const data = entries.map((e) => ({
    label: STATUS_LABELS[e.status as keyof typeof STATUS_LABELS] ?? e.status,
    media: Number(e.avgHours.toFixed(2)),
    mediana: Number(e.medianHours.toFixed(2)),
    count: e.count,
  }))
  return (
    <div className="space-y-3">
      <div className="h-[240px] w-full" role="group" aria-label="Tempo médio até sair de cada status (média e mediana, em horas)">
        <ResponsiveContainer>
          <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} />
            <YAxis
              tick={{ fontSize: 11 }}
              label={{ value: 'horas', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#6B7280' }}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 6 }}
              formatter={(value, name) => [`${Number(value).toFixed(1)} h`, name === 'media' ? 'Média' : 'Mediana']}
            />
            <Bar dataKey="media" fill="#FF5100" radius={[4, 4, 0, 0]} />
            <Bar dataKey="mediana" fill="#6B7280" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-[#FF5100]" /> Média
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-[#6B7280]" /> Mediana
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-1 text-[11px] text-muted-foreground sm:grid-cols-2 md:grid-cols-3">
        {entries.map((e) => (
          <li key={e.status} className="truncate">
            <span className="text-foreground">
              {STATUS_LABELS[e.status as keyof typeof STATUS_LABELS] ?? e.status}
            </span>
            {' · '}
            {e.count} {e.count === 1 ? 'transição' : 'transições'}
          </li>
        ))}
      </ul>
    </div>
  )
}

interface MaterialDonutProps {
  data: TopItem[]
  isLoading: boolean
}

function MaterialDonut({ data, isLoading }: MaterialDonutProps) {
  if (isLoading) return <Skeleton className="h-[220px] w-full" />
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-[13px] text-muted-foreground">
        Sem dados de material no período.
      </div>
    )
  }
  const total = data.reduce((acc, d) => acc + d.total, 0)
  const chartData = data.map((d) => ({ name: d.label, value: d.total }))
  return (
    <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[200px_1fr]">
      <div className="relative h-[200px]" role="img" aria-label="Distribuição de OCs por material; detalhada na legenda ao lado">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
              {chartData.map((_e, i) => (
                <Cell key={i} fill={MATERIAL_COLORS[i % MATERIAL_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [`${value ?? 0}`, String(name ?? '')]}
              contentStyle={{ fontSize: 12, borderRadius: 6 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground">Total</span>
          <span className="text-[20px] font-medium tabular-nums text-foreground">{total}</span>
        </div>
      </div>
      <ul className="space-y-1.5">
        {chartData.map((d, i) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
          return (
            <li key={d.name} className="flex items-center justify-between text-[12px]">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: MATERIAL_COLORS[i % MATERIAL_COLORS.length] }} />
                <span className="truncate text-foreground">{d.name}</span>
              </div>
              <span className="ml-2 shrink-0 text-muted-foreground tabular-nums">
                {d.value} <span className="text-[10px]">({pct}%)</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
