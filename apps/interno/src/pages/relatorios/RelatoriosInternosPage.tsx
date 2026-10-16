import * as React from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ClipboardList,
  Handshake,
  CheckCircle2,
  AlarmClock,
  Download,
  TriangleAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiTile } from '@/components/shared/KpiTile'
import { Spinner } from '@/components/shared/Spinner'
import { SolicitacaoStatusBadge } from '@/components/shared/SolicitacaoStatusBadge'
import { labelPerfil } from '@/features/auth/perfis'
import { fmtInt } from '@/lib/format'
import {
  periodoDeIntervalo,
  intervaloPadrao,
  type PeriodoRelatorio,
} from '@/features/relatorios/useRelatorios'
import { IntervaloDatas } from '@/features/relatorios/IntervaloDatas'
import { useIntervaloPersistido } from '@/features/relatorios/useIntervaloPersistido'
import {
  useRelatorioInterno,
  formatHoras,
  formatHorasCsv,
  type ProdutividadeUsuario,
} from '@/features/relatorios/useRelatoriosInternos'
import type { SolicitacaoStatus } from '@/types/database.types'
import { buildCsv, downloadCsv, type CsvColumn } from '@/lib/csv'
import { cn } from '@/lib/utils'

// Mesmo intervalo inicial da tela de Relatórios: últimos 30 dias.
const INTERVALO_PADRAO = intervaloPadrao(30)

// A partir deste tempo aberto, a solicitação parada vira alerta vermelho.
const PARADA_ALERTA_HORAS = 24

export default function RelatoriosInternosPage() {
  const { de, ate, deCampo, ateCampo, setIntervalo, limpar, noPadrao } = useIntervaloPersistido(
    'relatorios-internos',
    INTERVALO_PADRAO,
  )
  const periodo = React.useMemo<PeriodoRelatorio>(() => periodoDeIntervalo(de, ate), [de, ate])

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
        { header: 'Tempo médio p/ finalizar', accessor: (u) => formatHorasCsv(u.tempoMedioConclusaoH) },
        { header: 'Parada mais longa (aberta)', accessor: (u) => formatHorasCsv(u.paradaMaisLongaH) },
      ]
      const csv = buildCsv(usuarios, cols)
      const ts = new Date()
      const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}_${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}`
      downloadCsv(`relatorio_interno_${de}_a_${ate}_${stamp}.csv`, csv)
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
    <div className="space-y-4">
      <PageHeader
        title="Produtividade da equipe"
        description={periodo.label}
        actions={
          <>
          <IntervaloDatas
            idPrefix="rel-int"
            de={deCampo}
            ate={ateCampo}
            onChange={setIntervalo}
            mostrarLimpar={!noPadrao}
            onLimpar={limpar}
          />
          <Button
            type="button"
            variant="outline"
            onClick={exportCsv}
            disabled={exporting || q.isLoading || !data}
            title="Exportar produtividade em CSV"
          >
            {exporting ? <Spinner /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">Exportar</span>
          </Button>
          </>
        }
      />

      <p className="rounded-lg border bg-card px-4 py-3 text-body-sm text-muted-foreground">
        Considera as solicitações <strong>criadas no período</strong>. Cada coluna conta em quantas solicitações a
        pessoa executou aquela etapa (<em>Em emissão</em>, <em>Gerou OC</em>, <em>Enviou OC</em>, <em>Finalizou</em>),
        sem contar em dobro reaberturas. <em>Em aberto</em> = solicitações de parceiro que ela pôs em emissão e ainda
        não fecharam. Atribuição reconstruída do registro de auditoria (quem executou cada ação).
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile label="Solicitações no período" value={kpiValor(q.isLoading, totais?.solicitacoesNoPeriodo)} icon={ClipboardList} />
        <KpiTile label="De parceiros" value={kpiValor(q.isLoading, totais?.deParceiro)} icon={Handshake} />
        <KpiTile label="Finalizadas" value={kpiValor(q.isLoading, totais?.finalizadas)} icon={CheckCircle2} />
        <KpiTile label="Ainda abertas" value={kpiValor(q.isLoading, totais?.abertas)} icon={AlarmClock} />
        <KpiTile
          label="Recebidas sem ninguém pegar"
          value={kpiValor(q.isLoading, totais?.recebidasNaoIniciadas)}
          icon={TriangleAlert}
          tone={!q.isLoading && (totais?.recebidasNaoIniciadas ?? 0) > 0 ? 'alert' : 'default'}
        />
      </div>

      {q.isError && (
        <div className="rounded-lg border border-danger-border bg-danger-subtle px-4 py-3 text-body text-danger">
          Falha ao carregar o relatório. Tente recarregar a página.
        </div>
      )}

      <Card title="Produtividade por atendente" subtitle="Quantas solicitações cada um tocou em cada etapa, o tempo médio para finalizar e o que ficou parado, ordenado por finalizações">
        <ProdutividadeTable usuarios={usuarios} isLoading={q.isLoading} />
      </Card>

      <Card
        title="Paradas na mão de alguém"
        subtitle="Solicitações de parceiro pegas e ainda não finalizadas, da mais parada para a menos"
      >
        <ParadasList abertas={abertas} isLoading={q.isLoading} />
      </Card>
    </div>
  )
}

// Valor do <KpiTile>: esqueleto enquanto carrega, inteiro pt-BR depois.
function kpiValor(isLoading: boolean, n: number | undefined): React.ReactNode {
  return isLoading ? <Skeleton className="inline-block h-8 w-16 align-middle" /> : fmtInt(n ?? 0)
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="border-b px-4 py-3">
        <h2 className="text-body-lg font-medium text-foreground">{title}</h2>
        {subtitle && <p className="text-meta text-muted-foreground">{subtitle}</p>}
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
      <div className="flex h-[120px] items-center justify-center text-body text-muted-foreground">
        Nenhuma atividade da equipe no período.
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-body-sm">
        <thead>
          <tr className="border-b bg-muted text-left text-meta text-muted-foreground">
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
            return (
              <tr key={u.userId} className="border-b last:border-0 transition-colors duration-fast hover:bg-row-hover">
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('font-medium text-foreground', !u.ativo && 'text-muted-foreground line-through')}>
                      {u.nome}
                    </span>
                    <span className="text-meta text-muted-foreground">{labelPerfil(u.perfil)}</span>
                  </div>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{u.criou}</td>
                <td className="px-2 py-2 text-right tabular-nums">{u.emEmissao}</td>
                <td className="px-2 py-2 text-right tabular-nums">{u.gerouOC}</td>
                <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{u.enviouOC}</td>
                <td className="px-2 py-2 text-right tabular-nums font-medium text-success">{u.finalizou}</td>
                <td className={cn('px-2 py-2 text-right tabular-nums', u.emAbertoNaMao > 0 ? (enrolando ? 'font-semibold text-danger' : 'font-medium text-warning') : 'text-muted-foreground')}>
                  {u.emAbertoNaMao}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{formatHoras(u.tempoMedioConclusaoH)}</td>
                <td className={cn('px-2 py-2 text-right tabular-nums', (u.paradaMaisLongaH ?? 0) >= PARADA_ALERTA_HORAS ? 'font-medium text-danger' : 'text-muted-foreground')}>
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
      <div className="flex h-[100px] items-center justify-center text-body text-muted-foreground">
        Nenhuma solicitação de parceiro parada.
      </div>
    )
  }
  return (
    <ul className="divide-y">
      {abertas.map((a) => {
        const critico = a.paradaHoras >= PARADA_ALERTA_HORAS
        return (
          <li key={a.solicitacaoId} className="flex items-center gap-3 py-2 text-body-sm">
            <Link
              to={`/solicitacoes/${a.solicitacaoId}`}
              className="w-16 shrink-0 font-medium text-primary-strong hover:underline tabular-nums"
            >
              #{String(a.numero_interno).padStart(4, '0')}
            </Link>
            <span className="min-w-0 flex-1 truncate text-foreground">
              {a.parceiroNome ?? 'Parceiro —'}
              <SolicitacaoStatusBadge status={a.status} className="ml-2" />
            </span>
            <span className="shrink-0 text-muted-foreground">
              com <span className="font-medium text-foreground">{a.ownerNome}</span>
            </span>
            <span className={cn('w-20 shrink-0 text-right tabular-nums', critico ? 'font-semibold text-danger' : 'text-muted-foreground')}>
              {critico && <TriangleAlert className="mr-1 inline h-3 w-3" />}
              {formatHoras(a.paradaHoras)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
