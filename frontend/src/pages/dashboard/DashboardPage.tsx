import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import {
  ClipboardList,
  Hourglass,
  FileText,
  Send,
  ArrowRight,
  Inbox,
  RotateCcw,
  Building2,
} from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '@/hooks/useAuth'
import { Skeleton } from '@/components/ui/skeleton'
import { SolicitacaoStatusBadge } from '@/components/shared/SolicitacaoStatusBadge'
import {
  useDashboardCounts,
  useStatusBreakdown,
  useOldestPending,
  type StatusBreakdownItem,
} from '@/features/dashboard/useDashboard'
import { STATUS_LABELS } from '@/features/solicitacoes/status'
import { formatNumeroOC } from '@/lib/utils'
import type { SolicitacaoStatus } from '@/types/database.types'

const STATUS_HEX: Record<SolicitacaoStatus, string> = {
  recebida: '#94a3b8',
  em_cadastro: '#3b82f6',
  instrucao_emitida: '#f59e0b',
  oc_gerada: '#6366f1',
  oc_enviada: '#10b981',
  finalizada: '#059669',
  cancelada: '#ef4444',
}

export default function DashboardPage() {
  const { profile } = useAuth()
  const counts = useDashboardCounts()
  const breakdown = useStatusBreakdown()
  const oldest = useOldestPending(5)

  const saudacao = saudar()
  const nome = profile?.nome_completo?.split(' ')[0] ?? 'usuário'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-medium text-foreground">
          {saudacao}, {nome}.
        </h1>
        <p className="text-[13px] text-muted-foreground">
          Aqui está o resumo do dia.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Criadas hoje"
          value={counts.data?.criadasHoje}
          isLoading={counts.isLoading}
          icon={<ClipboardList className="h-4 w-4 text-blue-600" />}
          accent="bg-blue-50"
        />
        <Metric
          label="Pendentes (em aberto)"
          value={counts.data?.pendentes}
          isLoading={counts.isLoading}
          icon={<Hourglass className="h-4 w-4 text-amber-600" />}
          accent="bg-amber-50"
        />
        <Metric
          label="OCs geradas hoje"
          value={counts.data?.ocsGeradasHoje}
          isLoading={counts.isLoading}
          icon={<FileText className="h-4 w-4 text-indigo-600" />}
          accent="bg-indigo-50"
        />
        <Metric
          label="OCs enviadas hoje"
          value={counts.data?.ocsEnviadasHoje}
          isLoading={counts.isLoading}
          icon={<Send className="h-4 w-4 text-emerald-600" />}
          accent="bg-emerald-50"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_3fr]">
        <Card title="Solicitações por status" subtitle="Total acumulado">
          <StatusDonut data={breakdown.data ?? []} isLoading={breakdown.isLoading} />
        </Card>

        <Card
          title="Mais antigas pendentes"
          subtitle="Atender primeiro"
          action={
            <Link
              to="/solicitacoes"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
            >
              Ver todas
              <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <OldestList isLoading={oldest.isLoading} rows={oldest.data ?? []} />
        </Card>
      </div>

      <Card title="Atalhos rápidos">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Shortcut to="/solicitacoes" icon={<Inbox className="h-4 w-4" />} title="Solicitações" desc="Ver fila completa" />
          <Shortcut to="/cargas-retorno" icon={<RotateCcw className="h-4 w-4" />} title="Cargas de Retorno" desc="Cadastros de retorno" />
          <Shortcut to="/cadastros/clientes" icon={<Building2 className="h-4 w-4" />} title="Clientes" desc="Minério & retorno" />
        </div>
      </Card>
    </div>
  )
}

interface MetricProps {
  label: string
  value: number | undefined
  isLoading: boolean
  icon: React.ReactNode
  accent: string
}

function Metric({ label, value, isLoading, icon, accent }: MetricProps) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
          {label}
        </p>
        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${accent}`}>
          {icon}
        </span>
      </div>
      {isLoading ? (
        <Skeleton className="mt-2 h-8 w-16" />
      ) : (
        <p className="mt-1 text-[26px] font-medium tabular-nums text-foreground">
          {value ?? 0}
        </p>
      )}
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
    <section className="rounded-lg border bg-background">
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

function StatusDonut({ data, isLoading }: { data: StatusBreakdownItem[]; isLoading: boolean }) {
  if (isLoading) {
    return <Skeleton className="h-[220px] w-full" />
  }
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-[13px] text-muted-foreground">
        Sem solicitações ainda.
      </div>
    )
  }
  const total = data.reduce((acc, d) => acc + d.count, 0)
  const chartData = data.map((d) => ({
    name: STATUS_LABELS[d.status],
    value: d.count,
    status: d.status,
  }))

  return (
    <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[180px_1fr]">
      <div className="relative h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
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

      <ul className="space-y-1.5">
        {chartData.map((d) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
          return (
            <li key={d.status} className="flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: STATUS_HEX[d.status] }}
                />
                <span className="text-foreground">{d.name}</span>
              </div>
              <span className="text-muted-foreground tabular-nums">
                {d.value} <span className="text-[10px]">({pct}%)</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

interface OldestListProps {
  isLoading: boolean
  rows: ReturnType<typeof useOldestPending>['data'] extends infer T ? T : never
}

function OldestList({ isLoading, rows }: OldestListProps) {
  const navigate = useNavigate()
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }
  if (!rows || rows.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-[13px] text-muted-foreground">
        Nenhuma solicitação pendente. 🎉
      </div>
    )
  }
  return (
    <ul className="divide-y">
      {rows.map((r) => {
        const idade = formatDistanceToNowStrict(new Date(r.created_at), {
          locale: ptBR,
          addSuffix: false,
        })
        const titulo = r.cliente?.razao_social ?? r.material?.nome ?? r.solicitante_nome ?? 'Sem destino'
        return (
          <li
            key={r.id}
            className="flex cursor-pointer items-center gap-3 py-2.5 hover:bg-muted/50"
            onClick={() => navigate(`/solicitacoes/${r.id}`)}
          >
            <span className="text-[12px] font-medium tabular-nums text-muted-foreground">
              {formatNumeroOC(r.numero_interno)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground">{titulo}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {r.tipo === 'retorno' ? 'Retorno' : 'Carregamento'} · há {idade}
              </p>
            </div>
            <SolicitacaoStatusBadge status={r.status} />
          </li>
        )
      })}
    </ul>
  )
}

interface ShortcutProps {
  to: string
  icon: React.ReactNode
  title: string
  desc: string
}

function Shortcut({ to, icon, title, desc }: ShortcutProps) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-md border bg-background p-3 transition-colors hover:bg-muted"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-foreground/80 group-hover:bg-background">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-foreground">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{desc}</p>
      </div>
    </Link>
  )
}

function saudar() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}
