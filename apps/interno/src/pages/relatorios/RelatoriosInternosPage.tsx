import * as React from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  ClipboardList,
  Handshake,
  CheckCircle2,
  AlarmClock,
  Download,
  Loader2,
  TriangleAlert,
  Trophy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  periodoFromPreset,
  type PeriodoPreset,
  type PeriodoRelatorio,
} from '@/features/relatorios/useRelatorios'
import {
  useRelatorioInterno,
  formatHoras,
  type ProdutividadeUsuario,
} from '@/features/relatorios/useRelatoriosInternos'
import { STATUS_LABELS } from '@/features/solicitacoes/status'
import type { SolicitacaoStatus } from '@/types/database.types'
import { buildCsv, downloadCsv, type CsvColumn } from '@/lib/csv'
import { cn } from '@/lib/utils'

const PRESETS: { value: PeriodoPreset; label: string }[] = [
  { value: 'mes', label: 'Mês corrente' },
  { value: 'mes_anterior', label: 'Mês anterior' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
]
const VALID_PRESETS = PRESETS.map((p) => p.value)

// A partir deste tempo aberto, a solicitação parada vira alerta vermelho.
const PARADA_ALERTA_HORAS = 24

export default function RelatoriosInternosPage() {
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

  const q = useRelatorioInterno(periodo)
  const data = q.data
  const usuarios = data?.usuarios ?? []
  const abertas = data?.abertasParadas ?? []

  const [exporting, setExporting] = React.useState(false)
  const exportCsv = () => {
    if (!data) return
    setExporting(true)
    try {
      const cols: CsvColumn<ProdutividadeUsuario>[] = [
        { header: 'Usuário', accessor: (u) => u.nome },
        { header: 'Perfil', accessor: (u) => u.perfil },
        { header: 'Ativo', accessor: (u) => u.ativo },
        { header: 'Solicitou (criou)', accessor: (u) => u.criou },
        { header: 'Pôs em emissão', accessor: (u) => u.emEmissao },
        { header: 'Gerou OC', accessor: (u) => u.gerouOC },
        { header: 'Enviou OC', accessor: (u) => u.enviouOC },
        { header: 'Finalizou', accessor: (u) => u.finalizou },
        { header: 'Em aberto na mão (parceiro)', accessor: (u) => u.emAbertoNaMao },
        { header: 'Tempo médio p/ finalizar', accessor: (u) => formatHoras(u.tempoMedioConclusaoH) },
        { header: 'Parada mais longa (aberta)', accessor: (u) => formatHoras(u.paradaMaisLongaH) },
      ]
      const csv = buildCsv(usuarios, cols)
      const ts = new Date()
      const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}_${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}`
      downloadCsv(`relatorio_interno_${preset}_${stamp}.csv`, csv)
      toast.success('Relatório exportado')
    } catch (err) {
      toast.error('Falha ao exportar')
      console.error(err)
    } finally {
      setExporting(false)
    }
  }

  const totais = data?.totais

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Relatórios Internos</h1>
          <p className="text-[12px] text-muted-foreground">
            Produtividade da equipe · {periodo.label} ·{' '}
            {format(new Date(periodo.desde), 'dd/MM/yyyy', { locale: ptBR })}
            {' a '}
            {format(addDays(new Date(periodo.ate), -1), 'dd/MM/yyyy', { locale: ptBR })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodoTabs value={preset} onChange={setPreset} />
          <Button
            type="button"
            variant="outline"
            onClick={exportCsv}
            disabled={exporting || q.isLoading || !data}
            title="Exportar produtividade em CSV"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">Exportar</span>
          </Button>
        </div>
      </div>

      <p className="rounded-md border bg-muted/50 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
        Considera as solicitações <strong>criadas no período</strong>. Cada coluna conta em quantas solicitações a
        pessoa executou aquela etapa (<em>Em emissão</em>, <em>Gerou OC</em>, <em>Enviou OC</em>, <em>Finalizou</em>),
        sem contar em dobro reaberturas. <em>Em aberto</em> = solicitações de parceiro que ela pôs em emissão e ainda
        não fecharam. Atribuição reconstruída do registro de auditoria (quem executou cada ação).
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Solicitações no período" value={totais?.solicitacoesNoPeriodo ?? 0} icon={<ClipboardList className="h-4 w-4 text-muted-foreground" />} accent="bg-muted/60" isLoading={q.isLoading} />
        <KpiCard label="De parceiros" value={totais?.deParceiro ?? 0} icon={<Handshake className="h-4 w-4 text-muted-foreground" />} accent="bg-muted/60" isLoading={q.isLoading} />
        <KpiCard label="Finalizadas" value={totais?.finalizadas ?? 0} icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />} accent="bg-muted/60" isLoading={q.isLoading} />
        <KpiCard label="Ainda abertas" value={totais?.abertas ?? 0} icon={<AlarmClock className="h-4 w-4 text-muted-foreground" />} accent="bg-muted/60" isLoading={q.isLoading} />
        <KpiCard label="Recebidas sem ninguém pegar" value={totais?.recebidasNaoIniciadas ?? 0} icon={<TriangleAlert className="h-4 w-4 text-red-600 dark:text-red-400" />} accent="bg-red-50 dark:bg-red-950/40" isLoading={q.isLoading} highlight={(totais?.recebidasNaoIniciadas ?? 0) > 0} />
      </div>

      {q.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
          Falha ao carregar o relatório. Tente recarregar a página.
        </div>
      )}

      <Card title="Produtividade por atendente" subtitle="Quantas solicitações cada um tocou em cada etapa, o tempo médio para finalizar e o que ficou parado — ordenado por finalizações">
        <ProdutividadeTable usuarios={usuarios} isLoading={q.isLoading} />
      </Card>

      <Card
        title="Paradas na mão de alguém"
        subtitle="Solicitações de parceiro pegas e ainda não finalizadas — da mais parada para a menos"
      >
        <ParadasList abertas={abertas} isLoading={q.isLoading} />
      </Card>
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
  highlight?: boolean
}

function KpiCard({ label, value, icon, accent, isLoading, highlight }: KpiCardProps) {
  return (
    <div className={cn('rounded-lg border bg-card p-4', highlight && 'border-red-300 bg-red-50/40')}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">{label}</p>
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-md', accent)}>{icon}</span>
      </div>
      {isLoading ? (
        <Skeleton className="mt-2 h-8 w-16" />
      ) : (
        <p className="mt-1 text-[24px] font-medium tabular-nums text-foreground">{value}</p>
      )}
    </div>
  )
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
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

function ProdutividadeTable({ usuarios, isLoading }: { usuarios: ProdutividadeUsuario[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    )
  }
  if (usuarios.length === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center text-[13px] text-muted-foreground">
        Nenhuma atividade da equipe no período.
      </div>
    )
  }
  const melhorFinalizador = usuarios.reduce((m, u) => (u.finalizou > m ? u.finalizou : m), 0)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b text-left text-[11px] uppercase tracking-[0.4px] text-muted-foreground">
            <th className="px-2 py-2 font-medium">Atendente</th>
            <th className="px-2 py-2 text-right font-medium" title="Solicitações que ele mesmo criou">Solicitou</th>
            <th className="px-2 py-2 text-right font-medium" title="Solicitações que ele colocou Em emissão">Em emissão</th>
            <th className="px-2 py-2 text-right font-medium" title="Solicitações em que ele gerou a OC">Gerou OC</th>
            <th className="px-2 py-2 text-right font-medium" title="Solicitações em que ele marcou OC enviada">Enviou OC</th>
            <th className="px-2 py-2 text-right font-medium" title="Solicitações que ele finalizou">Finalizou</th>
            <th className="px-2 py-2 text-right font-medium" title="De parceiro: pôs em emissão e seguem abertas (não fecharam)">Em aberto</th>
            <th className="px-2 py-2 text-right font-medium" title="Tempo médio de Em emissão até Finalizada">Tempo médio</th>
            <th className="px-2 py-2 text-right font-medium" title="Maior tempo que uma que ele iniciou está parada e aberta">Parada+ longa</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => {
            const enrolando = u.emAbertoNaMao > 0 && u.finalizou < u.emAbertoNaMao
            const topFinalizador = u.finalizou > 0 && u.finalizou === melhorFinalizador
            return (
              <tr key={u.userId} className="border-b last:border-0 hover:bg-muted/40">
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1.5">
                    {topFinalizador && <Trophy className="h-3.5 w-3.5 text-amber-500" aria-label="Maior número de finalizações" />}
                    <span className={cn('font-medium text-foreground', !u.ativo && 'text-muted-foreground line-through')}>
                      {u.nome}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.4px] text-muted-foreground">{u.perfil}</span>
                  </div>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{u.criou}</td>
                <td className="px-2 py-2 text-right tabular-nums">{u.emEmissao}</td>
                <td className="px-2 py-2 text-right tabular-nums">{u.gerouOC}</td>
                <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{u.enviouOC}</td>
                <td className="px-2 py-2 text-right tabular-nums font-medium text-emerald-700">{u.finalizou}</td>
                <td className={cn('px-2 py-2 text-right tabular-nums', u.emAbertoNaMao > 0 ? (enrolando ? 'font-semibold text-red-700' : 'font-medium text-amber-700') : 'text-muted-foreground')}>
                  {u.emAbertoNaMao}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{formatHoras(u.tempoMedioConclusaoH)}</td>
                <td className={cn('px-2 py-2 text-right tabular-nums', (u.paradaMaisLongaH ?? 0) >= PARADA_ALERTA_HORAS ? 'font-medium text-red-700' : 'text-muted-foreground')}>
                  {formatHoras(u.paradaMaisLongaH)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ParadasList({
  abertas,
  isLoading,
}: {
  abertas: {
    solicitacaoId: string
    numero_interno: number
    status: SolicitacaoStatus
    parceiroNome: string | null
    ownerNome: string
    paradaHoras: number
  }[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    )
  }
  if (abertas.length === 0) {
    return (
      <div className="flex h-[100px] items-center justify-center text-[13px] text-muted-foreground">
        Nenhuma solicitação de parceiro parada na mão de alguém. 👏
      </div>
    )
  }
  return (
    <ul className="divide-y">
      {abertas.map((a) => {
        const critico = a.paradaHoras >= PARADA_ALERTA_HORAS
        return (
          <li key={a.solicitacaoId} className="flex items-center gap-3 py-2 text-[12px]">
            <Link
              to={`/solicitacoes/${a.solicitacaoId}`}
              className="w-16 shrink-0 font-medium text-primary-strong hover:underline tabular-nums"
            >
              #{String(a.numero_interno).padStart(4, '0')}
            </Link>
            <span className="min-w-0 flex-1 truncate text-foreground">
              {a.parceiroNome ?? 'Parceiro —'}
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {STATUS_LABELS[a.status]}
              </span>
            </span>
            <span className="shrink-0 text-muted-foreground">
              com <span className="font-medium text-foreground">{a.ownerNome}</span>
            </span>
            <span className={cn('w-20 shrink-0 text-right tabular-nums', critico ? 'font-semibold text-red-700' : 'text-muted-foreground')}>
              {critico && <TriangleAlert className="mr-1 inline h-3 w-3" />}
              {formatHoras(a.paradaHoras)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
