import * as React from 'react'
import { Link } from 'react-router-dom'
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
  AlertTriangle,
  Inbox,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiTile } from '@/components/shared/KpiTile'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { axisProps, gridProps, seriesColor } from '@/components/charts/chartTheme'
import {
  useRelatorioDataset,
  calcKPIs,
  calcPorDia,
  parseDayKey,
  topClientes,
  topMotoristas,
  topSubcontratadas,
  periodoDeIntervalo,
  intervaloPadrao,
  previousPeriod,
  type PeriodoRelatorio,
  type TopItem,
} from '@/features/relatorios/useRelatorios'
import { IntervaloDatas } from '@/features/relatorios/IntervaloDatas'
import { useIntervaloPersistido } from '@/features/relatorios/useIntervaloPersistido'
import { useEstadoAtual, useStatusBreakdown, type StatusBreakdownItem } from '@/features/dashboard/useDashboard'
import { STATUS_LABELS, STATUS_COLOR_VAR } from '@/features/solicitacoes/status'
import { fmtDelta, fmtDurHoras, fmtInt, fmtPct } from '@/lib/format'
import type { SolicitacaoStatus } from '@/types/database.types'

// Intervalo inicial: só o dia de hoje, o mesmo recorte que o preset padrão
// anterior mostrava. "Limpar" volta para cá.
const INTERVALO_PADRAO = intervaloPadrao(1)

// Séries do volume: criadas no acento (chart-1), finalizadas em aço (chart-2).
const COR_CRIADAS = seriesColor(0)
const COR_FINALIZADAS = seriesColor(1)

// Ordem fixa do fluxo — a legenda do donut lista todos os status, mesmo os zerados.
const ORDEM_STATUS: SolicitacaoStatus[] = [
  'recebida',
  'em_cadastro',
  'instrucao_emitida',
  'oc_gerada',
  'oc_enviada',
  'finalizada',
  'cancelada',
]

export default function DashboardPage() {
  const { de, ate, deCampo, ateCampo, setIntervalo, limpar, noPadrao } = useIntervaloPersistido(
    'dashboard',
    INTERVALO_PADRAO,
  )
  const periodo = React.useMemo<PeriodoRelatorio>(() => periodoDeIntervalo(de, ate), [de, ate])
  const periodoAnterior = React.useMemo(() => previousPeriod(periodo), [periodo])

  const ds = useRelatorioDataset(periodo)
  const dsAnterior = useRelatorioDataset(periodoAnterior)
  const estado = useEstadoAtual()
  const breakdown = useStatusBreakdown()


  const kpis = ds.data ? calcKPIs(ds.data.rows) : null
  const kpisAnt = dsAnterior.data ? calcKPIs(dsAnterior.data.rows) : null
  const porDia = ds.data ? calcPorDia(ds.data.rows, periodo) : []
  const topClientesItems = ds.data ? topClientes(ds.data, 5) : []
  const topMotoristasItems = ds.data ? topMotoristas(ds.data, 5) : []
  const topSubcontratadasItems = ds.data ? topSubcontratadas(ds.data, 5) : []

  const atrasadas = estado.data?.atrasadas ?? 0
  const pendentesAtuais = estado.data?.pendentes ?? 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="Visão geral"
        description={periodo.label}
        actions={
          <IntervaloDatas
            idPrefix="dash"
            de={deCampo}
            ate={ateCampo}
            onChange={setIntervalo}
            mostrarLimpar={!noPadrao}
            onLimpar={limpar}
          />
        }
      />

      {/* Estado operacional — "agora" */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Kpi
          label="Pendentes em aberto"
          hint="Na fila: recebida, em emissão ou instrução emitida"
          value={pendentesAtuais}
          icon={Inbox}
          isLoading={estado.isLoading}
          isError={estado.isError}
          onRetry={() => { void estado.refetch() }}
          to="/solicitacoes?status=recebida,em_cadastro,instrucao_emitida"
        />
        <Kpi
          label="Atrasadas"
          hint={atrasadas > 0 ? 'Pendentes há mais de 8 horas, prioridade' : 'Nenhuma fora do prazo de 8 horas'}
          value={atrasadas}
          icon={AlertTriangle}
          isLoading={estado.isLoading}
          isError={estado.isError}
          onRetry={() => { void estado.refetch() }}
          to="/solicitacoes?atrasadas=1"
          alerta={atrasadas > 0}
        />
      </div>

      {/* Volume no período (contexto histórico) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi
          label="Total de OCs"
          hint="Solicitações criadas no período"
          value={kpis?.total}
          previous={kpisAnt?.total}
          icon={ClipboardList}
          isLoading={ds.isLoading}
          isError={ds.isError}
          onRetry={() => { void ds.refetch() }}
          to="/solicitacoes"
          higherIsBetter
        />
        <Kpi
          label="Finalizadas"
          hint={kpis ? `${fmtPct(kpis.taxaFinalizacao, { casas: 0 })} de conclusão` : undefined}
          value={kpis?.finalizadas}
          previous={kpisAnt?.finalizadas}
          icon={ClipboardCheck}
          isLoading={ds.isLoading}
          isError={ds.isError}
          onRetry={() => { void ds.refetch() }}
          to="/solicitacoes?status=finalizada"
          higherIsBetter
        />
        <Kpi
          label="Tempo médio"
          hint="Da criação até a finalização"
          value={kpis?.tempoMedioHoras ?? null}
          formatar={fmtDurHoras}
          previous={kpisAnt?.tempoMedioHoras ?? null}
          icon={Hourglass}
          isLoading={ds.isLoading}
          isError={ds.isError}
          onRetry={() => { void ds.refetch() }}
          to="/relatorios"
          higherIsBetter={false}
        />
      </div>

      <Card title="Volume de OCs" subtitle={periodo.label}>
        <VolumeChart data={porDia} isLoading={ds.isLoading} isError={ds.isError} onRetry={() => { void ds.refetch() }} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Solicitações por status" subtitle="Total acumulado">
          <StatusDonut data={breakdown.data ?? []} isLoading={breakdown.isLoading} isError={breakdown.isError} onRetry={() => { void breakdown.refetch() }} />
        </Card>
        <Card
          title="Top clientes"
          subtitle={periodo.label}
          action={<VerRelatoriosLink />}
        >
          <TopList items={topClientesItems} isLoading={ds.isLoading} isError={ds.isError} onRetry={() => { void ds.refetch() }} emptyMessage="Sem clientes no período." />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Top motoristas" subtitle={periodo.label} action={<VerRelatoriosLink />}>
          <TopList items={topMotoristasItems} isLoading={ds.isLoading} isError={ds.isError} onRetry={() => { void ds.refetch() }} emptyMessage="Sem motoristas no período." />
        </Card>
        <Card title="Top subcontratadas" subtitle={periodo.label} action={<VerRelatoriosLink />}>
          <TopList items={topSubcontratadasItems} isLoading={ds.isLoading} isError={ds.isError} onRetry={() => { void ds.refetch() }} emptyMessage="Sem subcontratadas no período." />
        </Card>
      </div>
    </div>
  )
}

function VerRelatoriosLink() {
  return (
    <Link
      to="/relatorios"
      className="inline-flex items-center gap-1 text-body-sm font-medium text-primary-strong hover:underline"
    >
      Ver relatórios
      <ArrowRight className="h-3 w-3" />
    </Link>
  )
}


interface KpiProps {
  label: string
  value: number | null | undefined
  /** Formatação do valor (padrão fmtInt). */
  formatar?: (n: number) => string
  hint?: string
  previous?: number | null | undefined
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  isLoading: boolean
  isError?: boolean
  onRetry?: () => void
  higherIsBetter?: boolean
  to?: string
  alerta?: boolean
}

// Adaptador do <KpiTile> para o Painel: carregamento, erro com retry, delta vs.
// período anterior e drill-down para a lista filtrada.
function Kpi({
  label, value, formatar = fmtInt, hint, previous, icon, isLoading,
  isError, onRetry, higherIsBetter, to, alerta,
}: KpiProps) {
  const delta = computeDelta(value, previous)
  const pronto = !isLoading && !isError
  const interativo = !!to && pronto

  return (
    <KpiTile
      label={label}
      icon={icon}
      tone={alerta && pronto ? 'alert' : 'default'}
      value={
        isLoading ? (
          <Skeleton className="inline-block h-8 w-24 align-middle" />
        ) : isError || value == null ? (
          '—'
        ) : (
          formatar(value)
        )
      }
      delta={
        pronto && delta != null && higherIsBetter !== undefined
          ? {
              valor: delta.flat ? 'Sem variação' : fmtDelta(delta.pct / 100),
              comparador: 'vs. período anterior',
              direcao: delta.flat ? 'flat' : delta.pct > 0 ? 'up' : 'down',
              subirEhBom: higherIsBetter,
            }
          : undefined
      }
      hint={isError ? <KpiError onRetry={onRetry} /> : pronto ? hint : undefined}
      to={interativo ? to : undefined}
    />
  )
}

function KpiError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 font-medium text-danger">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Erro ao carregar
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onRetry() }}
          className="mt-1 inline-flex items-center gap-1 text-meta font-medium text-primary-strong hover:underline"
        >
          <RefreshCw className="h-3 w-3" /> Tentar novamente
        </button>
      )}
    </div>
  )
}

function ChartError({ onRetry, height }: { onRetry?: () => void; height: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 text-center"
      style={{ height }}
    >
      <AlertTriangle className="h-5 w-5 text-danger" />
      <p className="text-body font-medium text-foreground">Não foi possível carregar</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 text-body-sm font-medium text-primary-strong hover:underline"
        >
          <RefreshCw className="h-3 w-3" /> Tentar novamente
        </button>
      )}
    </div>
  )
}

function computeDelta(current: number | null | undefined, previous: number | null | undefined): {
  pct: number
  flat: boolean
} | null {
  if (current == null || previous == null) return null
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  const pct = previous === 0 ? (current === 0 ? 0 : 100) : ((current - previous) / previous) * 100
  return { pct, flat: pct <= 0.5 && pct >= -0.5 }
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
          <h2 className="text-body-lg font-medium text-foreground">{title}</h2>
          {subtitle && <p className="text-meta text-muted-foreground">{subtitle}</p>}
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
  isError?: boolean
  onRetry?: () => void
}

function VolumeChart({ data, isLoading, isError, onRetry }: VolumeChartProps) {
  if (isLoading) return <Skeleton className="h-[260px] w-full" />
  if (isError) return <ChartError onRetry={onRetry} height={260} />
  if (data.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-body text-muted-foreground">
        Sem dados no período.
      </div>
    )
  }
  const formatted = data.map((d) => ({
    ...d,
    label: format(parseDayKey(d.dia), 'dd/MM', { locale: ptBR }),
  }))
  return (
    <div className="h-[260px] w-full" role="group" aria-label="Volume de OCs por dia no período">
      <p className="sr-only">
        Gráfico de linha com o número de OCs criadas e finalizadas por dia no período selecionado.
      </p>
      <ResponsiveContainer>
        <LineChart accessibilityLayer data={formatted} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
          <YAxis {...axisProps} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: 'var(--chart-grid)' }}
            content={(p) => (
              <ChartTooltip
                {...p}
                formatLabel={() => {
                  const item = p.payload?.[0]?.payload as { dia: string } | undefined
                  return item?.dia ? format(parseDayKey(item.dia), "dd 'de' MMMM", { locale: ptBR }) : ''
                }}
              />
            )}
          />
          <Line type="monotone" dataKey="total" name="Criadas" stroke={COR_CRIADAS} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="finalizadas" name="Finalizadas" stroke={COR_FINALIZADAS} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 flex items-center justify-center gap-4 text-meta text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3" style={{ backgroundColor: COR_CRIADAS }} /> Criadas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3" style={{ backgroundColor: COR_FINALIZADAS }} /> Finalizadas
        </span>
      </div>
    </div>
  )
}

function StatusDonut({ data, isLoading, isError, onRetry }: { data: StatusBreakdownItem[]; isLoading: boolean; isError?: boolean; onRetry?: () => void }) {
  if (isLoading) return <Skeleton className="h-[220px] w-full" />
  if (isError) return <ChartError onRetry={onRetry} height={220} />
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-body text-muted-foreground">
        Sem solicitações ainda.
      </div>
    )
  }
  const total = data.reduce((acc, d) => acc + d.count, 0)
  const porStatus = new Map(data.map((d) => [d.status, d.count]))
  // Todos os status na ordem do fluxo (zerados inclusive) — a legenda não esconde nenhum.
  const legenda = ORDEM_STATUS.map((s) => ({ name: STATUS_LABELS[s], value: porStatus.get(s) ?? 0, status: s }))
  const fatias = legenda.filter((d) => d.value > 0)
  return (
    <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[180px_1fr]">
      <div className="relative h-[180px]" role="img" aria-label="Distribuição de solicitações por status; detalhada na legenda">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={fatias}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={75}
              paddingAngle={1}
              stroke="hsl(var(--card))"
            >
              {fatias.map((entry) => (
                <Cell key={entry.status} fill={STATUS_COLOR_VAR[entry.status]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-meta text-muted-foreground">Total</span>
          <span className="font-display text-title font-medium tabular-nums text-foreground">{fmtInt(total)}</span>
        </div>
      </div>
      <ul className="space-y-1">
        {legenda.map((d) => (
          <li key={d.status} className="flex items-center justify-between text-body-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-[1px]" style={{ backgroundColor: STATUS_COLOR_VAR[d.status] }} />
              <span className="truncate text-foreground">{d.name}</span>
            </div>
            <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
              {fmtInt(d.value)} <span className="text-meta">({fmtPct(total > 0 ? d.value / total : 0, { casas: 0 })})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}


function TopList({
  items,
  isLoading,
  isError,
  onRetry,
  emptyMessage,
}: {
  items: TopItem[]
  isLoading: boolean
  isError?: boolean
  onRetry?: () => void
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
  if (isError) return <ChartError onRetry={onRetry} height={180} />
  if (items.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-body text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }
  const max = items[0]?.total ?? 1
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <RankRow key={it.id} posicao={i + 1} label={it.label} valor={fmtInt(it.total)} pct={(it.total / max) * 100} />
      ))}
    </ul>
  )
}

// Linha de ranking: posição tabular, rótulo, valor e barra sólida fina (chart-1,
// cantos 2px) — sem gradiente, sem troféu.
function RankRow({ posicao, label, valor, pct }: { posicao: number; label: string; valor: string; pct: number }) {
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 text-body-sm">
      <span className="text-right tabular-nums text-muted-foreground">{posicao}</span>
      <span className="truncate text-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums text-foreground">{valor}</span>
      <div className="col-start-2 h-1.5 rounded-[2px] bg-muted">
        <div className="h-full rounded-[2px] bg-chart-1" style={{ width: `${pct}%` }} />
      </div>
    </li>
  )
}
