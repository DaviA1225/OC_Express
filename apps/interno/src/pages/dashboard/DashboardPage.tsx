import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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
} from 'recharts'
import {
  ClipboardList,
  ClipboardCheck,
  Hourglass,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Inbox,
  ArrowRight,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useRelatorioDataset,
  calcKPIs,
  calcPorDia,
  topClientes,
  topMotoristas,
  topSubcontratadas,
  periodoFromPreset,
  previousPeriod,
  type PeriodoPreset,
  type PeriodoRelatorio,
  type TopItem,
} from '@/features/relatorios/useRelatorios'
import { useEstadoAtual, useStatusBreakdown, type StatusBreakdownItem } from '@/features/dashboard/useDashboard'
import { STATUS_LABELS } from '@/features/solicitacoes/status'
import { cn } from '@/lib/utils'
import type { SolicitacaoStatus } from '@/types/database.types'

const PRESETS: { value: PeriodoPreset; label: string }[] = [
  { value: 'hoje', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'mes', label: 'Mês' },
]
const VALID_PRESETS = PRESETS.map((p) => p.value) as string[]

const STATUS_HEX: Record<SolicitacaoStatus, string> = {
  recebida: '#94a3b8',
  em_cadastro: '#FF8A50',       // laranja LHG claro
  instrucao_emitida: '#f59e0b',
  oc_gerada: '#C44612',          // laranja LHG queimado
  oc_enviada: '#10b981',
  finalizada: '#059669',
  cancelada: '#ef4444',
}

const CHART_PRIMARY = '#FF5100'  // laranja LHG
const CHART_SECONDARY = '#10b981'// emerald (mantido como sinal universal de "concluído")

export default function DashboardPage() {
  const [params, setParams] = useSearchParams()
  const presetRaw = params.get('p')
  const preset: PeriodoPreset = VALID_PRESETS.includes(presetRaw ?? '')
    ? (presetRaw as PeriodoPreset)
    : 'hoje'
  const periodo = React.useMemo<PeriodoRelatorio>(() => periodoFromPreset(preset), [preset])
  const periodoAnterior = React.useMemo(() => previousPeriod(periodo), [periodo])

  const ds = useRelatorioDataset(periodo)
  const dsAnterior = useRelatorioDataset(periodoAnterior)
  const estado = useEstadoAtual()
  const breakdown = useStatusBreakdown()

  const setPreset = (p: PeriodoPreset) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (p === 'hoje') next.delete('p')
        else next.set('p', p)
        return next
      },
      { replace: true },
    )
  }

  const kpis = ds.data ? calcKPIs(ds.data.rows) : null
  const kpisAnt = dsAnterior.data ? calcKPIs(dsAnterior.data.rows) : null
  const porDia = ds.data ? calcPorDia(ds.data.rows, periodo) : []
  const topClientesItems = ds.data ? topClientes(ds.data, 5) : []
  const topMotoristasItems = ds.data ? topMotoristas(ds.data, 5) : []
  const topSubcontratadasItems = ds.data ? topSubcontratadas(ds.data, 5) : []

  const atrasadas = estado.data?.atrasadas ?? 0
  const pendentesAtuais = estado.data?.pendentes ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            Visão geral
          </h1>
          <p className="text-[12px] text-muted-foreground">
            {periodo.label} ·{' '}
            {format(new Date(periodo.desde), 'dd MMM', { locale: ptBR })} a{' '}
            {format(addDays(new Date(periodo.ate), -1), 'dd MMM yyyy', { locale: ptBR })}
          </p>
        </div>
        <PeriodoTabs value={preset} onChange={setPreset} />
      </div>

      {atrasadas > 0 && (
        <Link
          to="/solicitacoes?atrasadas=1"
          className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] transition-colors hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:hover:bg-red-950/60"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-red-800 dark:text-red-200">
              {atrasadas} {atrasadas === 1 ? 'solicitação atrasada' : 'solicitações atrasadas'}
            </p>
            <p className="text-[11px] text-red-700/80 dark:text-red-300/80">
              Pendentes há mais de 8 horas — atender com prioridade.
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
        </Link>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total de OCs"
          value={kpis?.total}
          previous={kpisAnt?.total}
          icon={<ClipboardList className="h-4 w-4" />}
          accent="text-foreground/70"
          isLoading={ds.isLoading}
          higherIsBetter
        />
        <KpiCard
          label="Finalizadas"
          value={kpis?.finalizadas}
          subValue={kpis ? `${(kpis.taxaFinalizacao * 100).toFixed(0)}% de conclusão` : undefined}
          previous={kpisAnt?.finalizadas}
          icon={<ClipboardCheck className="h-4 w-4" />}
          accent="text-foreground/70"
          isLoading={ds.isLoading}
          higherIsBetter
        />
        <KpiCard
          label="Tempo médio"
          value={kpis?.tempoMedioHoras != null ? Number(kpis.tempoMedioHoras.toFixed(1)) : null}
          unit="h"
          subValue="Criada → finalizada"
          previous={kpisAnt?.tempoMedioHoras ?? null}
          icon={<Hourglass className="h-4 w-4" />}
          accent="text-foreground/70"
          isLoading={ds.isLoading}
          higherIsBetter={false}
        />
        <KpiCard
          label="Pendentes em aberto"
          value={pendentesAtuais}
          subValue="Estado atual da fila"
          icon={<Inbox className="h-4 w-4" />}
          accent="text-foreground/70"
          isLoading={estado.isLoading}
        />
      </div>

      <Card title="Volume de OCs" subtitle={periodo.label}>
        <VolumeChart data={porDia} isLoading={ds.isLoading} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Solicitações por status" subtitle="Total acumulado">
          <StatusDonut data={breakdown.data ?? []} isLoading={breakdown.isLoading} />
        </Card>
        <Card
          title="Top clientes"
          subtitle={periodo.label}
          action={
            <Link
              to="/relatorios"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
            >
              Ver relatórios
              <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <TopList items={topClientesItems} isLoading={ds.isLoading} emptyMessage="Sem clientes no período." />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Top motoristas" subtitle={periodo.label}>
          <TopList items={topMotoristasItems} isLoading={ds.isLoading} emptyMessage="Sem motoristas no período." />
        </Card>
        <Card title="Top subcontratadas" subtitle={periodo.label}>
          <TopList items={topSubcontratadasItems} isLoading={ds.isLoading} emptyMessage="Sem subcontratadas no período." />
        </Card>
      </div>
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
            'rounded-md px-3 py-1 text-[12px] font-medium transition-colors',
            value === p.value
              ? 'bg-primary text-primary-foreground shadow-sm'
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
  value: number | null | undefined
  unit?: string
  subValue?: string
  previous?: number | null | undefined
  icon: React.ReactNode
  accent: string
  isLoading: boolean
  higherIsBetter?: boolean
}

function KpiCard({
  label, value, unit, subValue, previous, icon, accent, isLoading, higherIsBetter,
}: KpiCardProps) {
  const delta = computeDelta(value, previous)
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
          {label}
        </p>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-md border bg-muted/60', accent)}>
          {icon}
        </span>
      </div>
      {isLoading ? (
        <Skeleton className="mt-3 h-9 w-24" />
      ) : (
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-[28px] font-medium tabular-nums leading-none text-foreground">
            {value == null ? '—' : value}
          </span>
          {unit && value != null && (
            <span className="text-[14px] text-muted-foreground">{unit}</span>
          )}
        </div>
      )}
      {!isLoading && subValue && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">{subValue}</p>
      )}
      {!isLoading && delta != null && higherIsBetter !== undefined && (
        <DeltaPill delta={delta} higherIsBetter={higherIsBetter} />
      )}
    </div>
  )
}

function computeDelta(current: number | null | undefined, previous: number | null | undefined): {
  pct: number
  abs: number
  hasBaseline: boolean
} | null {
  if (current == null || previous == null) return null
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  const abs = current - previous
  if (previous === 0) {
    return { pct: current === 0 ? 0 : 100, abs, hasBaseline: false }
  }
  return { pct: ((current - previous) / previous) * 100, abs, hasBaseline: true }
}

function DeltaPill({
  delta,
  higherIsBetter,
}: {
  delta: { pct: number; abs: number; hasBaseline: boolean }
  higherIsBetter: boolean
}) {
  const isUp = delta.pct > 0.5
  const isDown = delta.pct < -0.5
  const isFlat = !isUp && !isDown
  const positive = isUp ? higherIsBetter : isDown ? !higherIsBetter : null
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus
  const cls =
    positive == null
      ? 'text-muted-foreground'
      : positive
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-red-600 dark:text-red-400'
  const sign = isUp ? '+' : ''
  return (
    <div className={cn('mt-3 flex items-center gap-1 text-[11px] font-medium', cls)}>
      <Icon className="h-3 w-3" />
      <span>
        {isFlat ? 'Sem variação' : `${sign}${delta.pct.toFixed(1)}%`}
      </span>
      <span className="text-muted-foreground">vs período anterior</span>
    </div>
  )
}

interface CardProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
}

function Card({ title, subtitle, action, children }: CardProps) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-[14px] font-medium text-foreground">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
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
      <div className="flex h-[240px] items-center justify-center text-[13px] text-muted-foreground">
        Sem dados no período.
      </div>
    )
  }
  const formatted = data.map((d) => ({
    ...d,
    label: format(new Date(d.dia), 'dd/MM', { locale: ptBR }),
  }))
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer>
        <LineChart data={formatted} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
            labelFormatter={(_, p) => {
              const item = p?.[0]?.payload as { dia: string } | undefined
              return item?.dia ? format(new Date(item.dia), "dd 'de' MMMM", { locale: ptBR }) : ''
            }}
            formatter={(value, name) => [
              `${value ?? 0}`,
              String(name) === 'total' ? 'Criadas' : 'Finalizadas',
            ]}
          />
          <Line type="monotone" dataKey="total" stroke={CHART_PRIMARY} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="finalizadas" stroke={CHART_SECONDARY} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full" style={{ backgroundColor: CHART_PRIMARY }} /> Criadas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full" style={{ backgroundColor: CHART_SECONDARY }} /> Finalizadas
        </span>
      </div>
    </div>
  )
}

function StatusDonut({ data, isLoading }: { data: StatusBreakdownItem[]; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-[220px] w-full" />
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-[13px] text-muted-foreground">
        Sem solicitações ainda.
      </div>
    )
  }
  const total = data.reduce((acc, d) => acc + d.count, 0)
  const chartData = data.map((d) => ({ name: STATUS_LABELS[d.status], value: d.count, status: d.status }))
  return (
    <div className="space-y-3">
      <div className="relative h-[180px]">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={75}
              paddingAngle={2}
              stroke="none"
            >
              {chartData.map((entry) => (
                <Cell key={entry.status} fill={STATUS_HEX[entry.status]} />
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
      <ul className="space-y-1">
        {chartData.slice(0, 5).map((d) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
          return (
            <li key={d.status} className="flex items-center justify-between text-[12px]">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_HEX[d.status] }} />
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


function TopList({
  items,
  isLoading,
  emptyMessage,
}: {
  items: TopItem[]
  isLoading: boolean
  emptyMessage: string
}) {
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
      <div className="flex h-[180px] items-center justify-center text-[13px] text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }
  const max = items[0]?.total ?? 1
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => {
        const pct = (it.total / max) * 100
        return (
          <li key={it.id} className="flex items-center gap-2 text-[12px]">
            <span className="w-4 text-right tabular-nums text-muted-foreground">{i + 1}.</span>
            <div className="relative min-w-0 flex-1 rounded bg-muted">
              <div className="h-6 rounded bg-primary/15" style={{ width: `${pct}%` }} />
              <span className="absolute inset-0 flex items-center px-2 text-foreground">
                <span className="truncate">{it.label}</span>
              </span>
            </div>
            <span className="w-8 text-right tabular-nums font-medium text-foreground">{it.total}</span>
          </li>
        )
      })}
    </ul>
  )
}