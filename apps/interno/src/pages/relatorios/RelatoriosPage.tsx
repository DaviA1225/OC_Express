import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Ban, CheckCheck, ChevronDown, Download, Inbox, PackageCheck, RefreshCw, ShieldCheck, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiTile } from '@/components/shared/KpiTile'
import { Spinner } from '@/components/shared/Spinner'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { TempoEtapaChart } from '@/components/charts/TempoEtapaChart'
import { animacaoSerie, axisProps, gridProps } from '@/components/charts/chartTheme'
import { Bloco, Vazio } from '@/components/painel/Bloco'
import { FiltrosAnalise } from '@/components/painel/FiltrosAnalise'
import { IntervaloDatas } from '@/features/relatorios/IntervaloDatas'
import { useIntervaloPersistido } from '@/features/relatorios/useIntervaloPersistido'
import { intervaloPadrao, rotuloIntervalo } from '@/features/relatorios/intervalo'
import { exportarDados, exportarResumo, exportarSerie } from '@/features/relatorios/exportacao'
import { FaixaSimulacaoProducao, SeloSimulado } from '@/features/metricas/SeloSimulado'
import {
  buscarRelatorioRanking,
  buscarRelatorioResumo,
  buscarRelatorioSerie,
  buscarRelatorioTempoEtapas,
} from '@/features/metricas/fonte'
import { DRILL_ATIVO, MSG_DRILL_INATIVO, drillTo, linkSolicitacoes } from '@/features/metricas/links'
import { useAgora } from '@/features/metricas/useAgora'
import { LinkDrill } from '@/components/painel/LinkDrill'
import { granularidadePara, isoDia, lerBalde, textoComparador } from '@/features/metricas/periodo'
import { mapaSla } from '@/features/metricas/sla'
import { useFiltrosAnalise } from '@/features/metricas/useFiltrosAnalise'
import { useMetasSla } from '@/features/metricas/useMetasSla'
import {
  useMapaCalor,
  useOpcoesClientes,
  useRelatorioRanking,
  useRelatorioResumo,
  useRelatorioSerie,
  useRelatorioTempoEtapas,
} from '@/features/metricas/useRelatorioMetricas'
import type {
  DimensaoRanking,
  FiltrosPeriodo,
  Granularidade,
  MapaCalorCelula,
  RankingLinha,
  ResumoBloco,
  SerieLinha,
} from '@/features/metricas/tipos'
import { fmtDec, fmtDelta, fmtDur, fmtInt, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TabelaOrdenavel, type Coluna } from './TabelaOrdenavel'

// Intervalo inicial: os últimos 30 dias. "Limpar" volta para cá.
const INTERVALO_PADRAO = intervaloPadrao(30)

type Aba = 'geral' | 'fluxo' | 'clientes' | 'parceiros'
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'geral', rotulo: 'Visão geral' },
  { id: 'fluxo', rotulo: 'Fluxo e SLA' },
  { id: 'clientes', rotulo: 'Clientes e cadastros' },
  { id: 'parceiros', rotulo: 'Parceiros' },
]

const DIMENSOES: { id: DimensaoRanking; rotulo: string; param?: string }[] = [
  { id: 'cliente', rotulo: 'Clientes', param: 'cliente' },
  { id: 'material', rotulo: 'Materiais', param: 'material' },
  { id: 'local', rotulo: 'Locais', param: 'local' },
  { id: 'motorista', rotulo: 'Motoristas' },
  { id: 'veiculo', rotulo: 'Veículos' },
  { id: 'subcontratada', rotulo: 'Subcontratadas' },
]

/**
 * Relatórios (§3.2): análise de um período, com as métricas do dicionário
 * (§1.2). Abas na URL (`?aba=`), filtros comuns (`o`, `cliente`, `local`) e
 * comparação com o período anterior até o mesmo horário.
 */
export default function RelatoriosPage() {
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()
  const intervalo = useIntervaloPersistido('relatorios', INTERVALO_PADRAO)
  const f = useFiltrosAnalise('relatorios')
  const p = React.useMemo<FiltrosPeriodo>(() => ({ de: intervalo.de, ate: intervalo.ate, ...f.filtros }), [intervalo.de, intervalo.ate, f.filtros])
  const gran = granularidadePara(p)
  const clientes = useOpcoesClientes()

  const mostrarParceiros = p.origem !== 'interno'
  const abaUrl = params.get('aba') as Aba | null
  const aba: Aba = ABAS.some((a) => a.id === abaUrl) && !(abaUrl === 'parceiros' && !mostrarParceiros) ? (abaUrl as Aba) : 'geral'
  const abasVisiveis = ABAS.filter((a) => a.id !== 'parceiros' || mostrarParceiros)
  const setAba = (a: Aba) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('aba', a)
      return next
    }, { replace: true })

  const resumo = useRelatorioResumo(p)
  const [exportando, setExportando] = React.useState(false)

  const rotuloCliente = p.clienteId ? clientes.data?.find((c) => c.id === p.clienteId)?.nome ?? null : null

  const exportar = async (tipo: 'resumo' | 'dados' | 'serie') => {
    setExportando(true)
    try {
      const busca = <T,>(key: unknown[], fn: () => Promise<T>) => qc.fetchQuery({ queryKey: key, queryFn: fn, staleTime: 5 * 60_000 })
      const k = [p.de, p.ate, p.origem, p.clienteId, p.local]
      if (tipo === 'serie') {
        const serie = await busca(['metricas', 'serie', gran, ...k], () => buscarRelatorioSerie(p, gran))
        exportarSerie(p, gran, serie)
      } else if (tipo === 'dados') {
        const r = await exportarDados(p)
        if (r.truncado) toast.warning(`Exportadas só as primeiras ${fmtInt(r.linhas)} solicitações (teto de 50 mil). Reduza o período para exportar tudo.`)
        else toast.success(`${fmtInt(r.linhas)} solicitações exportadas`)
        return
      } else {
        const dims: DimensaoRanking[] = ['cliente', 'motorista', 'veiculo', 'subcontratada', 'material']
        const [res, serie, etapas, parceiros, ...rankings] = await Promise.all([
          busca(['metricas', 'resumo', ...k], () => buscarRelatorioResumo(p)),
          busca(['metricas', 'serie', gran, ...k], () => buscarRelatorioSerie(p, gran)),
          busca(['metricas', 'tempo-etapas', ...k], () => buscarRelatorioTempoEtapas(p)),
          mostrarParceiros ? busca(['metricas', 'ranking', 'parceiro', ...k], () => buscarRelatorioRanking(p, 'parceiro')) : Promise.resolve(null),
          ...dims.map((d) => busca(['metricas', 'ranking', d, ...k], () => buscarRelatorioRanking(p, d))),
        ])
        exportarResumo({
          filtros: p,
          rotuloCliente,
          resumo: res,
          serie,
          granularidade: gran,
          etapas,
          parceiros,
          rankings: dims.map((d, i) => ({ titulo: `Top ${DIMENSOES.find((x) => x.id === d)?.rotulo.toLowerCase()}`, linhas: rankings[i] })),
        })
      }
      toast.success('Relatório exportado')
    } catch (err) {
      toast.error('Falha ao exportar')
      console.error(err)
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="space-y-4">
      <FaixaSimulacaoProducao />
      <PageHeader
        title="Relatórios"
        meta={<SeloSimulado />}
        description={rotuloIntervalo(intervalo.de, intervalo.ate)}
        actions={
          <>
            <IntervaloDatas
              idPrefix="rel"
              de={intervalo.deCampo}
              ate={intervalo.ateCampo}
              onChange={intervalo.setIntervalo}
              mostrarLimpar={!intervalo.noPadrao}
              onLimpar={intervalo.limpar}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void qc.invalidateQueries({ queryKey: ['metricas'] })}
              title="Atualizar os números"
              aria-label="Atualizar os números"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" disabled={exportando}>
                  {exportando ? <Spinner /> : <Download className="h-4 w-4" />}
                  <span className="hidden sm:inline">Exportar</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onSelect={() => void exportar('resumo')}>
                  <div>
                    <p className="text-body text-foreground">Resumo (CSV)</p>
                    <p className="text-meta text-muted-foreground">Indicadores, série, etapas e rankings</p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void exportar('dados')}>
                  <div>
                    <p className="text-body text-foreground">Dados por solicitação (CSV)</p>
                    <p className="text-meta text-muted-foreground">Uma linha por solicitação, com minutos por etapa</p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void exportar('serie')}>
                  <div>
                    <p className="text-body text-foreground">Série (CSV)</p>
                    <p className="text-meta text-muted-foreground">Entradas e finalizadas por {gran}</p>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        className="mb-2"
      />

      <FiltrosAnalise {...f} />

      <div
        role="tablist"
        aria-label="Seções do relatório"
        className="flex gap-1 overflow-x-auto border-b"
        onKeyDown={(ev) => {
          // Padrão de abas (WAI-ARIA): setas, Home e End movem o foco e ativam.
          const ids = abasVisiveis.map((a) => a.id)
          const i = ids.indexOf(aba)
          const alvo =
            ev.key === 'ArrowRight' ? ids[(i + 1) % ids.length]
            : ev.key === 'ArrowLeft' ? ids[(i - 1 + ids.length) % ids.length]
            : ev.key === 'Home' ? ids[0]
            : ev.key === 'End' ? ids[ids.length - 1]
            : null
          if (!alvo) return
          ev.preventDefault()
          setAba(alvo)
          document.getElementById(`aba-${alvo}`)?.focus()
        }}
      >
        {abasVisiveis.map((a) => (
          <button
            key={a.id}
            id={`aba-${a.id}`}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            aria-controls={`painel-${a.id}`}
            tabIndex={aba === a.id ? 0 : -1}
            onClick={() => setAba(a.id)}
            className={cn(
              'relative -mb-px whitespace-nowrap border-b-2 px-3 py-2 text-body font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              aba === a.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`} tabIndex={0} className="focus-visible:outline-none">
        {aba === 'geral' && <VisaoGeral p={p} gran={gran} resumo={resumo} onIrFluxo={() => setAba('fluxo')} />}
        {aba === 'fluxo' && <FluxoSla p={p} resumo={resumo} />}
        {aba === 'clientes' && <Cadastros p={p} />}
        {aba === 'parceiros' && <Parceiros p={p} />}
      </div>
    </div>
  )
}

// ── Visão geral ─────────────────────────────────────────────────────────────

type ResumoQuery = ReturnType<typeof useRelatorioResumo>

function deltaNum(atual: number, ant: number, comparador: string, subirEhBom: boolean) {
  const pct = ant === 0 ? (atual === 0 ? 0 : 1) : (atual - ant) / ant
  const flat = Math.abs(pct) < 0.005
  return { valor: flat ? 'Sem variação' : fmtDelta(pct), comparador, direcao: flat ? ('flat' as const) : pct > 0 ? ('up' as const) : ('down' as const), subirEhBom }
}

/** Variação de uma fração em pontos percentuais: 0,82 → 0,85 = "+3,0 p.p.". */
function deltaPp(atual: number | null, ant: number | null, comparador: string, subirEhBom: boolean) {
  if (atual == null || ant == null) return undefined
  const pp = (atual - ant) * 100
  const flat = Math.abs(pp) < 0.05
  const sinal = pp > 0 ? '+' : pp < 0 ? '−' : ''
  return {
    valor: flat ? 'Sem variação' : `${sinal}${fmtDec(Math.abs(pp), 1)} p.p.`,
    comparador,
    direcao: flat ? ('flat' as const) : pp > 0 ? ('up' as const) : ('down' as const),
    subirEhBom,
  }
}

function Kpis({ p, resumo, onIrFluxo }: { p: FiltrosPeriodo; resumo: ResumoQuery; onIrFluxo: () => void }) {
  const agoraMs = useAgora(60_000)
  const comp = textoComparador(p, new Date(agoraMs))
  const a = resumo.data?.atual
  const b = resumo.data?.anterior
  const esq = <Skeleton className="inline-block h-8 w-20 align-middle" />
  const v = (fn: (x: ResumoBloco) => React.ReactNode) => (resumo.isLoading ? esq : a ? fn(a) : '—')
  const per = { de: p.de, ate: p.ate }
  const leadOk = !!a && a.lead.n >= 5 && a.lead.p50 != null
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        label="Entradas"
        icon={Inbox}
        value={v((x) => fmtInt(x.entradas))}
        delta={a && b ? deltaNum(a.entradas, b.entradas, comp, true) : undefined}
        to={drillTo(linkSolicitacoes({ data: 'criada', ...per }, p))}
        title={DRILL_ATIVO ? undefined : MSG_DRILL_INATIVO}
      />
      <KpiTile
        label="Finalizadas"
        icon={PackageCheck}
        value={v((x) => fmtInt(x.finalizadas))}
        delta={a && b ? deltaNum(a.finalizadas, b.finalizadas, comp, true) : undefined}
        hint="Finalizadas no período, qualquer que seja a data de entrada"
        to={drillTo(linkSolicitacoes({ status: 'finalizada', data: 'finalizada', ...per }, p))}
        title={DRILL_ATIVO ? undefined : MSG_DRILL_INATIVO}
      />
      <KpiTile
        label="Canceladas"
        icon={Ban}
        value={v((x) => fmtInt(x.canceladas))}
        delta={a && b ? deltaNum(a.canceladas, b.canceladas, comp, false) : undefined}
        hint={a && <span className="tabular-nums">{fmtPct(a.cancelamento_pct)} das entradas</span>}
        to={drillTo(linkSolicitacoes({ data: 'cancelada', ...per }, p))}
        title={DRILL_ATIVO ? undefined : MSG_DRILL_INATIVO}
      />
      <KpiTile
          label="Concluídas em 48 h"
          icon={CheckCheck}
          className="h-full"
          value={v((x) => (x.conclusao48_n > 0 ? fmtPct(x.conclusao48_pct) : '—'))}
          delta={a && b ? deltaPp(a.conclusao48_pct, b.conclusao48_pct, comp, true) : undefined}
          hint={
            a && (
              <span className="tabular-nums">
                {a.conclusao48_n > 0 ? `De ${fmtInt(a.conclusao48_n)} entradas com 48 h ou mais de idade` : 'Nenhuma entrada com 48 h ainda'}; finalizadas em até 48 h após a entrada; canceladas fora do cálculo
              </span>
            )
          }
          to={drillTo(linkSolicitacoes({ drill: 'conclusao48', ...per }, p))}
          title={DRILL_ATIVO ? undefined : MSG_DRILL_INATIVO}
        />
      <KpiTile
        label="Lead time"
        icon={Timer}
        value={resumo.isLoading ? esq : leadOk ? <span><span className="mr-1.5 text-body font-normal text-muted-foreground">P50</span>{fmtDur(a?.lead.p50)}</span> : '—'}
        delta={leadOk && b && b.lead.n >= 5 && b.lead.p50 != null ? deltaNum(a.lead.p50 as number, b.lead.p50, comp, false) : undefined}
        hint={a && (leadOk ? <span className="tabular-nums">P90 {fmtDur(a.lead.p90)} · n={fmtInt(a.lead.n)}</span> : 'amostra pequena')}
        onClick={onIrFluxo}
      />
      <KpiTile
        label="Dentro do SLA"
        icon={ShieldCheck}
        value={v((x) => fmtPct(x.dentro_sla_pct))}
        delta={a && b ? deltaPp(a.dentro_sla_pct, b.dentro_sla_pct, comp, true) : undefined}
        hint="Finalizadas sem nenhuma etapa acima do alerta"
        to={drillTo(linkSolicitacoes({ drill: 'sla_estourou', ...per }, p))}
        title={DRILL_ATIVO ? undefined : MSG_DRILL_INATIVO}
      />
    </div>
  )
}

function VisaoGeral({ p, gran, resumo, onIrFluxo }: { p: FiltrosPeriodo; gran: Granularidade; resumo: ResumoQuery; onIrFluxo: () => void }) {
  const serie = useRelatorioSerie(p, gran)
  const origens = useRelatorioRanking(p, 'origem')
  return (
    <div className="space-y-4">
      {resumo.isError ? (
        <Bloco titulo="Indicadores" erro onRetry={() => void resumo.refetch()}>{null}</Bloco>
      ) : (
        <Kpis p={p} resumo={resumo} onIrFluxo={onIrFluxo} />
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Bloco
          titulo="Entradas × finalizadas"
          subtitulo={`Por ${gran}; tracejado = período anterior.${DRILL_ATIVO ? ' Clique num ponto para ver a lista.' : ''}`}
          className="xl:col-span-2"
          carregando={serie.isLoading}
          erro={serie.isError}
          onRetry={() => void serie.refetch()}
          alturaEsqueleto={280}
        >
          {serie.data && <GraficoSerie serie={serie.data} gran={gran} p={p} />}
        </Bloco>
        <Bloco
          titulo="Interno × parceiro"
          subtitulo="Entradas e finalizadas por origem"
          carregando={origens.isLoading}
          erro={origens.isError}
          onRetry={() => void origens.refetch()}
        >
          {origens.data && <PorOrigem linhas={origens.data} p={p} />}
        </Bloco>
      </div>
    </div>
  )
}

function rotuloEixo(balde: string, gran: Granularidade): string {
  const d = lerBalde(balde)
  if (gran === 'hora') return `${d.getHours()}h`
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function GraficoSerie({ serie, gran, p }: { serie: SerieLinha[]; gran: Granularidade; p: FiltrosPeriodo }) {
  const navigate = useNavigate()
  if (serie.every((s) => s.entradas === 0 && s.finalizadas === 0 && s.entradas_ant === 0)) {
    return <Vazio altura={260}>Sem movimento no período.</Vazio>
  }
  const dados = serie.map((s) => ({ ...s, rotulo: rotuloEixo(s.balde, gran) }))
  const abrir = (i: number) => {
    const s = serie[i]
    if (!s) return
    const d = lerBalde(s.balde)
    const dia = isoDia(d)
    if (gran === 'semana') {
      const ate = isoDia(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6))
      navigate(linkSolicitacoes({ data: 'criada', de: dia < p.de ? p.de : dia, ate: ate > p.ate ? p.ate : ate }, p))
    } else {
      navigate(linkSolicitacoes({ data: 'criada', de: dia, ate: dia, hora: gran === 'hora' ? d.getHours() : undefined }, p))
    }
  }
  return (
    <div>
      <p className="sr-only">
        Série de entradas e finalizadas por {gran}. Totais: {fmtInt(serie.reduce((a, s) => a + s.entradas, 0))} entradas e{' '}
        {fmtInt(serie.reduce((a, s) => a + s.finalizadas, 0))} finalizadas.
      </p>
      <div className="h-[280px]" aria-hidden>
        <ResponsiveContainer>
          <LineChart
            data={dados}
            margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
            onClick={(e) => {
              if (!DRILL_ATIVO) return
              const i = Number((e as { activeIndex?: number | string | null } | null)?.activeIndex)
              if (Number.isInteger(i)) abrir(i)
            }}
            className={DRILL_ATIVO ? 'cursor-pointer' : undefined}
          >
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="rotulo" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
            <YAxis {...axisProps} allowDecimals={false} />
            <Tooltip cursor={{ stroke: 'var(--chart-grid)' }} content={<ChartTooltip />} />
            <Line dataKey="entradas" name="Entradas" stroke="var(--chart-2)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} {...animacaoSerie} />
            <Line dataKey="finalizadas" name="Finalizadas" stroke="var(--chart-4)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} {...animacaoSerie} />
            <Line dataKey="entradas_ant" name="Entradas (anterior)" stroke="var(--chart-2)" strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="6 4" dot={false} activeDot={false} {...animacaoSerie} />
            <Line dataKey="finalizadas_ant" name="Finalizadas (anterior)" stroke="var(--chart-4)" strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="6 4" dot={false} activeDot={false} {...animacaoSerie} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-meta text-muted-foreground">
        <Legenda cor="var(--chart-2)" rotulo="Entradas" />
        <Legenda cor="var(--chart-4)" rotulo="Finalizadas" />
        <Legenda cor="var(--chart-ref)" rotulo="Período anterior (mesma cor, tracejado)" tracejado />
      </div>
    </div>
  )
}

function Legenda({ cor, rotulo, tracejado }: { cor: string; rotulo: string; tracejado?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={cn('w-3', tracejado ? 'h-0 border-t-2 border-dashed' : 'h-0.5')} style={tracejado ? { borderColor: cor } : { backgroundColor: cor }} />
      {rotulo}
    </span>
  )
}

function PorOrigem({ linhas, p }: { linhas: RankingLinha[]; p: FiltrosPeriodo }) {
  const total = linhas.reduce((a, l) => a + l.entradas, 0)
  if (total === 0) return <Vazio>Sem entradas no período.</Vazio>
  return (
    <ul className="space-y-4">
      {linhas.map((l, i) => (
        <li key={l.chave}>
          <LinkDrill
            to={linkSolicitacoes({ origem: l.chave, data: 'criada', de: p.de, ate: p.ate }, { ...p, origem: 'todas' })}
            className="-mx-2 block rounded-md px-2 py-1 transition-[transform,background-color] duration-fast ease-out hover:-translate-y-0.5 hover:bg-row-hover"
          >
            <div className="flex items-baseline justify-between text-body">
              <span className="text-foreground">{l.rotulo}</span>
              <span className="tabular-nums">
                <span className="font-medium text-foreground">{fmtInt(l.entradas)}</span>
                <span className="ml-1 text-meta text-muted-foreground">({fmtPct(l.entradas / total, { casas: 0 })})</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-[2px] bg-muted" aria-hidden>
              <div className="barra-x h-full rounded-[2px] bg-chart-7" style={{ width: `${(l.entradas / total) * 100}%`, '--ordem': i } as React.CSSProperties} />
            </div>
            <p className="mt-1 text-meta text-muted-foreground tabular-nums">
              {fmtInt(l.finalizadas)} finalizadas · lead P50 {fmtDur(l.lead_p50_min)}
            </p>
          </LinkDrill>
        </li>
      ))}
    </ul>
  )
}

// ── Fluxo e SLA ─────────────────────────────────────────────────────────────

function FluxoSla({ p, resumo }: { p: FiltrosPeriodo; resumo: ResumoQuery }) {
  const etapas = useRelatorioTempoEtapas(p)
  const mapa = useMapaCalor(p)
  const metas = useMetasSla()
  const sla = metas.data ? mapaSla(metas.data.etapas) : undefined
  const a = resumo.data?.atual
  const alvoP90 = metas.data?.metas.meta_lead_time_p90_min ?? null
  return (
    <div className="space-y-4">
      <Bloco
        titulo="Tempo por etapa"
        subtitulo="P50 e P90 das passagens que saíram de cada etapa no período (reaberturas contam separado). O detalhe por solicitação está no CSV de dados."
        carregando={etapas.isLoading}
        erro={etapas.isError}
        onRetry={() => void etapas.refetch()}
        alturaEsqueleto={220}
      >
        {etapas.data && <TempoEtapaChart linhas={etapas.data} sla={sla} />}
      </Bloco>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Bloco titulo="Lead time" subtitulo="Da entrada à finalização, nas finalizadas do período" carregando={resumo.isLoading} erro={resumo.isError} onRetry={() => void resumo.refetch()} alturaEsqueleto={140}>
          {a && (a.lead.n < 5 || a.lead.p50 == null ? (
            <Vazio>Amostra pequena (n={fmtInt(a.lead.n)}).</Vazio>
          ) : (
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-meta font-medium text-muted-foreground">P50</dt>
                <dd className="font-display text-kpi font-medium tabular-nums text-foreground">{fmtDur(a.lead.p50)}</dd>
              </div>
              <div>
                <dt className="text-meta font-medium text-muted-foreground">P90</dt>
                <dd className={cn('font-display text-kpi font-medium tabular-nums', alvoP90 != null && (a.lead.p90 ?? 0) > alvoP90 ? 'text-primary-strong' : 'text-foreground')}>
                  {fmtDur(a.lead.p90)}
                </dd>
              </div>
              <div className="col-span-2 text-body-sm text-muted-foreground tabular-nums">
                n={fmtInt(a.lead.n)}
                {alvoP90 != null && ` · alvo do P90: ${fmtDur(alvoP90)}`}
                {resumo.data?.anterior.lead.p50 != null && ` · período anterior: P50 ${fmtDur(resumo.data.anterior.lead.p50)}`}
              </div>
            </dl>
          ))}
        </Bloco>
        <Bloco
          titulo="Entradas por dia da semana e hora"
          subtitulo="Onde a demanda se concentra"
          className="xl:col-span-2"
          carregando={mapa.isLoading}
          erro={mapa.isError}
          onRetry={() => void mapa.refetch()}
          alturaEsqueleto={200}
        >
          {mapa.data && <MapaCalor celulas={mapa.data} />}
        </Bloco>
      </div>
    </div>
  )
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function MapaCalor({ celulas }: { celulas: MapaCalorCelula[] }) {
  const max = Math.max(0, ...celulas.map((c) => c.entradas))
  if (max === 0) return <Vazio>Sem entradas no período.</Vazio>
  const horas = Array.from({ length: 17 }, (_v, i) => i + 5) // 5h–21h
  const valor = (dow: number, hora: number) => celulas.find((c) => c.dow === dow && c.hora === hora)?.entradas ?? 0
  const ordem = [1, 2, 3, 4, 5, 6, 0]
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-[2px] text-meta" aria-label="Entradas por dia da semana e hora">
        <thead>
          <tr>
            <th scope="col" className="w-10" />
            {horas.map((h) => (
              <th key={h} scope="col" className="font-normal text-muted-foreground tabular-nums">{h}h</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordem.map((dow) => (
            <tr key={dow}>
              <th scope="row" className="pr-1 text-left font-normal text-muted-foreground">{DIAS_SEMANA[dow]}</th>
              {horas.map((h) => {
                const v = valor(dow, h)
                return (
                  <td key={h} className="h-6 rounded-[2px] bg-muted p-0" title={`${DIAS_SEMANA[dow]} ${h}h: ${fmtInt(v)} entradas`}>
                    <div className="celula-surgir h-full w-full rounded-[2px] bg-chart-2" style={{ opacity: v === 0 ? 0 : 0.12 + 0.88 * (v / max), '--ordem': h - horas[0] } as React.CSSProperties} />
                    <span className="sr-only">{fmtInt(v)}</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-meta text-muted-foreground">Cor mais intensa = mais entradas (máximo {fmtInt(max)} numa célula).</p>
    </div>
  )
}

// ── Clientes e cadastros ────────────────────────────────────────────────────

function Cadastros({ p }: { p: FiltrosPeriodo }) {
  const [dim, setDim] = React.useState<DimensaoRanking>('cliente')
  const q = useRelatorioRanking(p, dim)
  const def = DIMENSOES.find((d) => d.id === dim) ?? DIMENSOES[0]
  const total = (q.data ?? []).reduce((a, l) => a + l.entradas, 0)
  const colunas: Coluna<RankingLinha>[] = [
    {
      chave: 'rotulo',
      rotulo: def.rotulo.replace(/s$/, ''),
      valor: (l) => l.rotulo,
      render: (l) =>
        def.param ? (
          <LinkDrill
            to={linkSolicitacoes({ [def.param]: l.chave, data: 'criada', de: p.de, ate: p.ate }, p)}
            className="text-foreground hover:text-primary-strong hover:underline"
          >
            {l.rotulo}
          </LinkDrill>
        ) : (
          <span className="text-foreground">{l.rotulo}</span>
        ),
    },
    { chave: 'entradas', rotulo: 'Entradas', alinhar: 'direita', valor: (l) => l.entradas, render: (l) => fmtInt(l.entradas) },
    {
      chave: 'participacao',
      rotulo: 'Participação',
      alinhar: 'direita',
      valor: (l) => (total > 0 ? l.entradas / total : 0),
      render: (l) => <span className="text-muted-foreground">{fmtPct(total > 0 ? l.entradas / total : null)}</span>,
    },
    { chave: 'finalizadas', rotulo: 'Finalizadas', alinhar: 'direita', valor: (l) => l.finalizadas, render: (l) => fmtInt(l.finalizadas) },
    { chave: 'lead', rotulo: 'Lead time P50', titulo: 'Mediana da entrada à finalização', alinhar: 'direita', valor: (l) => l.lead_p50_min, render: (l) => fmtDur(l.lead_p50_min) },
  ]
  return (
    <Bloco
      titulo="Rankings"
      subtitulo="Entradas, finalizadas e lead time por cadastro. Clique no cabeçalho para ordenar."
      acao={
        <div role="radiogroup" aria-label="Dimensão" className="hidden flex-wrap gap-1 md:flex">
          {DIMENSOES.map((d) => (
            <BotaoDim key={d.id} ativo={dim === d.id} onClick={() => setDim(d.id)}>{d.rotulo}</BotaoDim>
          ))}
        </div>
      }
      carregando={q.isLoading}
      erro={q.isError}
      onRetry={() => void q.refetch()}
      alturaEsqueleto={320}
    >
      <div role="radiogroup" aria-label="Dimensão" className="mb-3 flex flex-wrap gap-1 md:hidden">
        {DIMENSOES.map((d) => (
          <BotaoDim key={d.id} ativo={dim === d.id} onClick={() => setDim(d.id)}>{d.rotulo}</BotaoDim>
        ))}
      </div>
      {q.data && q.data.length === 0 ? (
        <Vazio>Nada no período.</Vazio>
      ) : (
        q.data && (
          <TabelaOrdenavel
            key={dim}
            rotulo={`Ranking de ${def.rotulo.toLowerCase()}`}
            colunas={colunas}
            linhas={q.data}
            chaveLinha={(l) => l.chave}
            ordemInicial={{ coluna: 'entradas', dir: 'desc' }}
          />
        )
      )}
    </Bloco>
  )
}

function BotaoDim({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativo}
      onClick={onClick}
      className={cn(
        'rounded-control border px-2.5 py-1 text-body-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        ativo ? 'border-primary/40 bg-primary/[0.08] text-primary-strong' : 'border-border text-muted-foreground hover:bg-row-hover hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

// ── Parceiros ───────────────────────────────────────────────────────────────

function Parceiros({ p }: { p: FiltrosPeriodo }) {
  const q = useRelatorioRanking(p, 'parceiro')
  const total = (q.data ?? []).reduce((a, l) => a + l.entradas, 0)
  const colunas: Coluna<RankingLinha>[] = [
    {
      chave: 'rotulo',
      rotulo: 'Parceiro',
      valor: (l) => l.rotulo,
      render: (l) => (
        <LinkDrill
          to={linkSolicitacoes({ origem: 'parceiro', parceiro: l.chave, data: 'criada', de: p.de, ate: p.ate }, { ...p, origem: 'todas' })}
          className="text-foreground hover:text-primary-strong hover:underline"
        >
          {l.rotulo}
        </LinkDrill>
      ),
    },
    { chave: 'entradas', rotulo: 'Enviadas', alinhar: 'direita', valor: (l) => l.entradas, render: (l) => fmtInt(l.entradas) },
    {
      chave: 'participacao',
      rotulo: 'Participação',
      alinhar: 'direita',
      valor: (l) => (total > 0 ? l.entradas / total : 0),
      render: (l) => <span className="text-muted-foreground">{fmtPct(total > 0 ? l.entradas / total : null)}</span>,
    },
    { chave: 'finalizadas', rotulo: 'Finalizadas', alinhar: 'direita', valor: (l) => l.finalizadas, render: (l) => fmtInt(l.finalizadas) },
    {
      chave: 'emissao_p50',
      rotulo: 'Emissão P50',
      titulo: 'Da 1ª entrada em "Em emissão" até a finalização (mediana)',
      alinhar: 'direita',
      valor: (l) => l.emissao_p50_min,
      render: (l) => fmtDur(l.emissao_p50_min),
    },
    { chave: 'emissao_p90', rotulo: 'Emissão P90', alinhar: 'direita', valor: (l) => l.emissao_p90_min, render: (l) => fmtDur(l.emissao_p90_min) },
  ]
  return (
    <Bloco
      titulo="Parceiros"
      subtitulo="Solicitações enviadas por parceiro e o tempo de emissão (da 1ª entrada em “Em emissão” até a finalização)"
      carregando={q.isLoading}
      erro={q.isError}
      onRetry={() => void q.refetch()}
      alturaEsqueleto={240}
    >
      {q.data && q.data.length === 0 ? (
        <Vazio>Nenhuma solicitação de parceiro no período.</Vazio>
      ) : (
        q.data && (
          <TabelaOrdenavel
            rotulo="Ranking de parceiros"
            colunas={colunas}
            linhas={q.data}
            chaveLinha={(l) => l.chave}
            ordemInicial={{ coluna: 'entradas', dir: 'desc' }}
          />
        )
      )}
    </Bloco>
  )
}
