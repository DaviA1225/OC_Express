import * as React from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Clock, Inbox, MonitorPlay, PackageCheck, Timer, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiTile } from '@/components/shared/KpiTile'
import { AtualizadoAs } from '@/components/painel/AtualizadoAs'
import { Bloco } from '@/components/painel/Bloco'
import { FiltrosAnalise } from '@/components/painel/FiltrosAnalise'
import { FunilEtapas } from '@/components/painel/FunilEtapas'
import { IdadeFila } from '@/components/painel/IdadeFila'
import { MaisAtrasadas } from '@/components/painel/MaisAtrasadas'
import { Pendencias } from '@/components/painel/Pendencias'
import { PorLocal } from '@/components/painel/PorLocal'
import { VazaoHora } from '@/components/painel/VazaoHora'
import { FaixaSimulacaoProducao, SeloSimulado } from '@/features/metricas/SeloSimulado'
import { DRILL_ATIVO, MSG_DRILL_INATIVO, drillTo, linkSolicitacoes } from '@/features/metricas/links'
import { LinkDrill } from '@/components/painel/LinkDrill'
import { diaOperacao, relogioOperacao } from '@/lib/datasOperacao'
import { fmtHoraMin, projetarRitmo, rotuloHorario } from '@/features/metricas/rotulos'
import { ETAPAS_FILA } from '@/features/metricas/sla'
import { useAgora } from '@/features/metricas/useAgora'
import { useFiltrosAnalise } from '@/features/metricas/useFiltrosAnalise'
import { useMetasSla } from '@/features/metricas/useMetasSla'
import { usePainelEstadoAtual, usePainelHoje } from '@/features/metricas/usePainel'
import type { FiltrosComuns, Percentis } from '@/features/metricas/tipos'
import { fmtDelta, fmtDur, fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'

const EXPEDIENTE_PADRAO = { expediente_inicio: '07:00', expediente_fim: '18:00' }

/**
 * Painel "Sala de Controle" (§3.1): o estado da operação AGORA — fila, SLA por
 * etapa, ritmo do dia e o que precisa de atenção. Cada número abre a lista de
 * Solicitações já filtrada (drill-down). Os números históricos vivem em
 * Relatórios.
 */
export default function DashboardPage() {
  const f = useFiltrosAnalise('painel')
  const filtros = f.filtros
  const estado = usePainelEstadoAtual(filtros)
  const hoje = usePainelHoje(filtros)
  const metas = useMetasSla()
  const agora = useAgora(30_000)

  const e = estado.data
  const h = hoje.data
  const expediente = metas.data?.metas ?? EXPEDIENTE_PADRAO
  const atualizar = () => {
    void estado.refetch()
    void hoje.refetch()
  }

  const tvHref = React.useMemo(() => {
    const q = new URLSearchParams()
    if (filtros.origem !== 'todas') q.set('o', filtros.origem)
    if (filtros.clienteId) q.set('cliente', filtros.clienteId)
    if (filtros.local) q.set('local', filtros.local)
    const s = q.toString()
    return s ? `/operacao/tv?${s}` : '/operacao/tv'
  }, [filtros])

  return (
    <div className="space-y-4">
      <FaixaSimulacaoProducao />
      <PageHeader
        title="Painel"
        meta={<SeloSimulado />}
        actions={
          <>
            <AtualizadoAs
              atualizadoEm={estado.dataUpdatedAt}
              atualizando={estado.isFetching || hoje.isFetching}
              erro={estado.isError || hoje.isError}
              onAtualizar={atualizar}
            />
            <Button asChild variant="outline" size="sm">
              <Link to={tvHref} target="_blank" rel="noopener" title="Abrir o Modo TV em outra aba">
                <MonitorPlay className="h-4 w-4" /> Modo TV
              </Link>
            </Button>
          </>
        }
        className="mb-2"
      />

      <FiltrosAnalise {...f} />

      {/* KPIs: 2 colunas no celular (o 5º ocupa a linha), 5 no desktop. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile
          label="Na fila"
          icon={Inbox}
          value={valor(estado.isLoading, estado.isError, e?.fila.total)}
          hint={e && <span className="tabular-nums">{fmtInt(e.fila.aguardando_finalizacao)} aguardando finalização</span>}
          to={e ? drillTo(linkSolicitacoes({ status: ETAPAS_FILA.join(','), ordem: 'antiga' }, filtros)) : undefined}
          title={DRILL_ATIVO ? undefined : MSG_DRILL_INATIVO}
        />
        <KpiTile
          label="Fora do SLA"
          icon={AlertTriangle}
          tone={e && e.fila.fora_sla > 0 ? 'alert' : 'default'}
          value={valor(estado.isLoading, estado.isError, e?.fila.fora_sla)}
          hint={e && <span className="tabular-nums">{fmtInt(e.fila.aviso)} em aviso</span>}
          to={e ? drillTo(linkSolicitacoes({ sla: 'fora', ordem: 'antiga' }, filtros)) : undefined}
          title={DRILL_ATIVO ? undefined : MSG_DRILL_INATIVO}
        />
        <KpiTile
          label="Finalizadas hoje"
          icon={PackageCheck}
          value={valor(hoje.isLoading, hoje.isError, h?.finalizadas)}
          delta={h ? deltaPct(h.finalizadas, h.finalizadas_ref, `vs. ontem até ${fmtHoraMin(agora).replace(':', 'h')}`, true) : undefined}
          hint={h && <Ritmo finalizadas={h.finalizadas} projecao={projetarRitmo(h, expediente, new Date(agora))} meta={metaVisivel(h.meta, filtros)} fim={expediente.expediente_fim} />}
          to={h ? drillTo(linkSolicitacoes({ status: 'finalizada', data: 'finalizada', de: diaOperacao(agora), ate: diaOperacao(agora) }, filtros)) : undefined}
          title={DRILL_ATIVO ? undefined : MSG_DRILL_INATIVO}
        />
        <KpiTile
          label="Lead time 7 dias"
          icon={Timer}
          value={hoje.isLoading ? <Esqueleto /> : hoje.isError ? '—' : <Lead p={h?.lead7d} />}
          delta={h && amostraOk(h.lead7d) && amostraOk(h.lead7d_ant) ? deltaPct(h.lead7d.p50 as number, h.lead7d_ant.p50 as number, 'vs. 7 dias anteriores', false) : undefined}
          hint={h && (amostraOk(h.lead7d) ? <span className="tabular-nums">P90 {fmtDur(h.lead7d.p90)} · n={fmtInt(h.lead7d.n)}</span> : 'amostra pequena')}
          to="/relatorios?aba=fluxo"
        />
        <KpiTile
          label="OCs vencendo"
          icon={Clock}
          className="col-span-2 md:col-span-1"
          value={valor(estado.isLoading, estado.isError, e?.validade.vencendo)}
          hint={
            e && (
              <span className={cn('tabular-nums', e.validade.vencidas > 0 && 'text-danger')}>
                {e.validade.vencidas > 0 && <TriangleAlert className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />}
                {fmtInt(e.validade.vencidas)} já {e.validade.vencidas === 1 ? 'vencida' : 'vencidas'}
              </span>
            )
          }
          to={e ? drillTo(linkSolicitacoes({ validade: 'vencendo' }, filtros)) : undefined}
          title={DRILL_ATIVO ? undefined : MSG_DRILL_INATIVO}
        />
      </div>

      {/* Blocos: no desktop a grade do wireframe; no celular a ordem da §3.1. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Bloco
          titulo="Funil por etapa"
          subtitulo="Quantas em cada etapa e quantas passaram do SLA dela"
          className="order-1 lg:order-none lg:col-span-3"
          carregando={estado.isLoading}
          erro={estado.isError}
          onRetry={() => void estado.refetch()}
          alturaEsqueleto={260}
        >
          {e && <FunilEtapas etapas={e.etapas} filtros={filtros} />}
        </Bloco>
        <Bloco
          titulo="Idade da fila"
          subtitulo="Tempo desde a entrada, de Recebida até OC gerada"
          className="order-5 lg:order-none lg:col-span-2"
          carregando={estado.isLoading}
          erro={estado.isError}
          onRetry={() => void estado.refetch()}
          alturaEsqueleto={220}
        >
          {e && <IdadeFila aging={e.aging} filtros={filtros} />}
        </Bloco>
        <Bloco
          titulo="Vazão por hora"
          subtitulo="Finalizadas hoje × média da mesma hora nas 4 últimas semanas"
          className="order-4 lg:order-none lg:col-span-3"
          carregando={hoje.isLoading}
          erro={hoje.isError}
          onRetry={() => void hoje.refetch()}
          alturaEsqueleto={260}
        >
          {h && <VazaoHora porHora={h.por_hora} filtros={filtros} horaAtual={relogioOperacao(agora).getHours()} />}
        </Bloco>
        <Bloco
          titulo="Pendências"
          subtitulo="O que depende de alguém agir"
          className="order-3 lg:order-none lg:col-span-2"
          carregando={estado.isLoading}
          erro={estado.isError}
          onRetry={() => void estado.refetch()}
        >
          {e && <Pendencias estado={e} filtros={filtros} />}
        </Bloco>
        <Bloco
          titulo="Mais atrasadas"
          subtitulo="As 10 com maior excesso sobre o SLA da etapa"
          className="order-2 lg:order-none lg:col-span-5"
          acao={
            e && e.fila.fora_sla > 0 ? (
              <LinkDrill to={linkSolicitacoes({ sla: 'fora', ordem: 'antiga' }, filtros)} className="shrink-0 text-body-sm font-medium text-primary-strong hover:underline">
                Ver todas ({fmtInt(e.fila.fora_sla)})
              </LinkDrill>
            ) : undefined
          }
          carregando={estado.isLoading}
          erro={estado.isError}
          onRetry={() => void estado.refetch()}
        >
          {e && <MaisAtrasadas atrasadas={e.atrasadas} geradoEm={e.gerado_em} agora={agora} limite={10} />}
        </Bloco>
        <Bloco
          titulo="Por local de carregamento"
          subtitulo="Fila e fora do SLA nos 6 maiores locais"
          className="order-6 lg:order-none lg:col-span-5"
          carregando={estado.isLoading}
          erro={estado.isError}
          onRetry={() => void estado.refetch()}
          alturaEsqueleto={120}
        >
          {e && <PorLocal locais={e.por_local} filtros={filtros} />}
        </Bloco>
      </div>
    </div>
  )
}

function Esqueleto() {
  return <Skeleton className="inline-block h-8 w-20 align-middle" />
}

function valor(carregando: boolean, erro: boolean, n: number | undefined): React.ReactNode {
  if (carregando) return <Esqueleto />
  if (erro || n == null) return '—'
  return fmtInt(n)
}

function amostraOk(p: Percentis | undefined): boolean {
  return !!p && p.n >= 5 && p.p50 != null
}

function Lead({ p }: { p: Percentis | undefined }) {
  if (!amostraOk(p)) return <>—</>
  return (
    <span>
      <span className="mr-1.5 text-body font-normal text-muted-foreground">P50</span>
      {fmtDur(p?.p50)}
    </span>
  )
}

function deltaPct(atual: number, anterior: number, comparador: string, subirEhBom: boolean) {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior)) return undefined
  const pct = anterior === 0 ? (atual === 0 ? 0 : 1) : (atual - anterior) / anterior
  const flat = Math.abs(pct) < 0.005
  return {
    valor: flat ? 'Sem variação' : fmtDelta(pct),
    comparador,
    direcao: flat ? ('flat' as const) : pct > 0 ? ('up' as const) : ('down' as const),
    subirEhBom,
  }
}

/** A meta é da operação inteira: com recorte de origem/cliente/local ela não se aplica. */
function metaVisivel(meta: number | null, f: FiltrosComuns): number | null {
  return f.origem === 'todas' && !f.clienteId && !f.local ? meta : null
}


/** P4/P5: sem meta, só "≈ N até 18h"; com meta, "31/45" + barra (laranja se o ritmo não chega). */
function Ritmo({ finalizadas, projecao, meta, fim }: { finalizadas: number; projecao: number; meta: number | null; fim: string }) {
  const ate = rotuloHorario(fim)
  if (meta == null || meta <= 0) {
    return <span className="tabular-nums">≈ {fmtInt(projecao)} até {ate}</span>
  }
  const abaixo = projecao < meta
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 tabular-nums">
        <span>
          {fmtInt(finalizadas)}/{fmtInt(meta)} da meta
        </span>
        <span className={cn(abaixo && 'font-medium text-primary-strong')}>≈ {fmtInt(projecao)} até {ate}</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-[2px] bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={meta}
        aria-valuenow={finalizadas}
        aria-label="Finalizadas em relação à meta do dia"
      >
        <div
          className={cn('barra-x h-full', abaixo ? 'bg-primary' : 'bg-chart-7')}
          style={{ width: `${Math.min(100, (finalizadas / meta) * 100)}%` }}
        />
      </div>
    </div>
  )
}
