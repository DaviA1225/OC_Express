import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Expand, Minimize, Pause, Play } from 'lucide-react'
import { BlocoErro } from '@/components/painel/Bloco'
import { FunilEtapas } from '@/components/painel/FunilEtapas'
import { IdadeFila } from '@/components/painel/IdadeFila'
import { MaisAtrasadas } from '@/components/painel/MaisAtrasadas'
import { Pendencias } from '@/components/painel/Pendencias'
import { VazaoHora } from '@/components/painel/VazaoHora'
import { FaixaSimulacaoProducao, SeloSimulado } from '@/features/metricas/SeloSimulado'
import { fmtHoraMin, projetarRitmo, rotuloHorario, rotuloOrigem } from '@/features/metricas/rotulos'
import { useAgora } from '@/features/metricas/useAgora'
import { useFiltrosAnalise } from '@/features/metricas/useFiltrosAnalise'
import { useMetasSla } from '@/features/metricas/useMetasSla'
import { usePainelEstadoAtual, usePainelHoje } from '@/features/metricas/usePainel'
import { useOpcoesClientes } from '@/features/metricas/useRelatorioMetricas'
import type { PainelEstadoAtual, PainelHoje } from '@/features/metricas/tipos'
import { relogioOperacao } from '@/lib/datasOperacao'
import { fmtDelta, fmtDur, fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'

const PAINEIS = ['Fila e SLA', 'Ritmo do dia', 'Atenção'] as const
const ROTACAO_MS = 20_000
const EXPEDIENTE_PADRAO = { expediente_inicio: '07:00', expediente_fim: '18:00' }

/**
 * Modo TV (§3.3): fora do AppLayout, escuro forçado, 3 painéis em rotação de
 * 20 s (←/→ trocam, espaço pausa, `?painel=1..3` fixa), só polling de 60 s,
 * "dado de há Xs" e Wake Lock. Aceita os filtros do Painel na URL.
 */
export default function TvPage() {
  useEscuroForcado()
  const [params, setParams] = useSearchParams()
  const { filtros } = useFiltrosAnalise('tv')
  const estado = usePainelEstadoAtual(filtros, 'tv')
  const hoje = usePainelHoje(filtros, 'tv')
  const metas = useMetasSla({ periodico: true })
  const clientes = useOpcoesClientes()
  // Painéis andam a cada 30 s (minutos na etapa, ritmo); só o relógio e o
  // "dado de há Xs" re-renderizam por segundo, nos próprios componentes.
  const agora = useAgora(30_000)
  const wakeLock = useWakeLock()
  const telaCheia = useTelaCheia()

  const fixo = lerPainel(params.get('painel'))
  const [indice, setIndice] = React.useState(0)
  const [pausado, setPausado] = React.useState(false)
  const atual = fixo ?? indice

  const irPara = React.useCallback(
    (n: number) => {
      const alvo = (n + PAINEIS.length) % PAINEIS.length
      setIndice(alvo)
      if (fixo != null) {
        setParams((prev) => {
          const next = new URLSearchParams(prev)
          next.set('painel', String(alvo + 1))
          return next
        }, { replace: true })
      }
    },
    [fixo, setParams],
  )

  // Rotação: reinicia a contagem a cada troca (manual ou automática).
  React.useEffect(() => {
    if (fixo != null || pausado) return
    const t = window.setTimeout(() => setIndice((i) => (i + 1) % PAINEIS.length), ROTACAO_MS)
    return () => window.clearTimeout(t)
  }, [fixo, pausado, indice])

  React.useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'ArrowRight') irPara(atual + 1)
      else if (ev.key === 'ArrowLeft') irPara(atual - 1)
      else if (ev.key === ' ') {
        ev.preventDefault()
        setPausado((p) => !p)
      } else return
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [atual, irPara])

  // "Dado de há Xs": idade do dado mais antigo entre as duas consultas.
  const atualizadoEm = Math.min(estado.dataUpdatedAt || Infinity, hoje.dataUpdatedAt || Infinity)

  const recorte = [
    filtros.origem === 'todas' ? 'Todas as origens' : rotuloOrigem(filtros.origem),
    filtros.clienteId ? clientes.data?.find((c) => c.id === filtros.clienteId)?.nome ?? 'Cliente' : null,
    filtros.local,
  ].filter(Boolean).join(' · ')

  const expediente = metas.data?.metas ?? EXPEDIENTE_PADRAO
  const semFiltro = filtros.origem === 'todas' && !filtros.clienteId && !filtros.local

  return (
    <div className="dark flex min-h-screen flex-col bg-canvas text-foreground">
      <FaixaSimulacaoProducao />
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b bg-header px-6 py-3 text-header-foreground">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/favicon.svg" alt="" aria-hidden className="h-7 w-7 shrink-0" />
          <div className="min-w-0">
            <p className="tv-titulo truncate">Operação SisLog</p>
            <p className="tv-meta truncate text-muted-foreground">{recorte}</p>
          </div>
          <SeloSimulado />
        </div>
        <nav aria-label="Painéis" className="flex items-center gap-1">
          {PAINEIS.map((p, i) => (
            <button
              key={p}
              type="button"
              onClick={() => irPara(i)}
              aria-current={i === atual ? 'true' : undefined}
              className={cn(
                'tv-meta rounded-control px-3 py-1 transition-colors duration-fast',
                i === atual ? 'bg-accent font-medium text-foreground shadow-[inset_0_-2px_0_hsl(var(--primary))]' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {i + 1}. {p}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <Relogio />
          <IdadeDado atualizadoEm={atualizadoEm} />
          <button
            type="button"
            onClick={() => setPausado((p) => !p)}
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast hover:bg-accent hover:text-foreground"
            aria-label={pausado ? 'Retomar rotação' : 'Pausar rotação'}
            title={pausado ? 'Retomar rotação (espaço)' : 'Pausar rotação (espaço)'}
            disabled={fixo != null}
          >
            {pausado || fixo != null ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </button>
          {telaCheia.suportado && (
            <button
              type="button"
              onClick={telaCheia.alternar}
              className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast hover:bg-accent hover:text-foreground"
              aria-label={telaCheia.ativa ? 'Sair da tela cheia' : 'Tela cheia'}
              title={telaCheia.ativa ? 'Sair da tela cheia' : 'Tela cheia'}
            >
              {telaCheia.ativa ? <Minimize className="h-5 w-5" /> : <Expand className="h-5 w-5" />}
            </button>
          )}
        </div>
      </header>

      <FaixaSemAtualizacao atualizadoEm={atualizadoEm} />

      <main key={atual} className="surgir flex-1 p-6">
        {atual === 0 && (
          <PainelFila estado={estado.data} erro={estado.isError && !estado.data} onRetry={() => void estado.refetch()} />
        )}
        {atual === 1 && (
          <PainelRitmo
            hoje={hoje.data}
            erro={hoje.isError && !hoje.data}
            onRetry={() => void hoje.refetch()}
            projecao={hoje.data ? projetarRitmo(hoje.data, expediente, new Date(agora)) : 0}
            fim={expediente.expediente_fim}
            agora={agora}
            mostrarMeta={semFiltro}
          />
        )}
        {atual === 2 && (
          <PainelAtencao estado={estado.data} erro={estado.isError && !estado.data} onRetry={() => void estado.refetch()} agora={agora} />
        )}
      </main>

      <footer className="tv-meta flex flex-wrap items-center justify-between gap-2 border-t px-6 py-2 text-muted-foreground">
        <span>
          {fixo != null ? 'Painel fixo' : pausado ? 'Rotação pausada' : `Troca a cada ${ROTACAO_MS / 1000} s`} · ← → trocam · espaço pausa
        </span>
        {wakeLock === 'sem-suporte' && <span>Mantenha a tela ligada nas configurações da TV.</span>}
        {/* Até o PR-B1 não existe o perfil `painel_tv`: a TV roda na conta de uma
            pessoa e cai pelo limite de inatividade. REMOVER este aviso no B1,
            quando a conta dedicada (sessão sem expiração) entrar. */}
        <span>Sessão pessoal: expira após 50 min sem interação</span>
        <Link to="/dashboard" className="hover:text-foreground hover:underline">
          Sair do modo TV
        </Link>
      </footer>
    </div>
  )
}

// ── Relógio e idade do dado (re-renderizam por segundo, isolados) ───────────

function nivelIdade(idadeS: number | null): 'neutro' | 'aviso' | 'perigo' {
  return idadeS == null ? 'neutro' : idadeS > 300 ? 'perigo' : idadeS > 120 ? 'aviso' : 'neutro'
}

function idadeEmS(atualizadoEm: number, agora: number): number | null {
  return Number.isFinite(atualizadoEm) ? Math.max(0, Math.round((agora - atualizadoEm) / 1000)) : null
}

function Relogio() {
  const agora = useAgora(1000)
  return <span className="tv-titulo tabular-nums">{fmtHoraMin(agora)}</span>
}

/** Neutro até 2 min, atenção até 5 min, perigo acima. */
function IdadeDado({ atualizadoEm }: { atualizadoEm: number }) {
  const agora = useAgora(1000)
  const idadeS = idadeEmS(atualizadoEm, agora)
  const nivel = nivelIdade(idadeS)
  return (
    <span
      className={cn(
        'tv-meta tabular-nums',
        nivel === 'perigo' ? 'font-medium text-danger' : nivel === 'aviso' ? 'text-warning' : 'text-muted-foreground',
      )}
    >
      {idadeS == null ? 'carregando…' : `dado de há ${fmtIdade(idadeS)}`}
    </span>
  )
}

function FaixaSemAtualizacao({ atualizadoEm }: { atualizadoEm: number }) {
  const agora = useAgora(1000)
  if (nivelIdade(idadeEmS(atualizadoEm, agora)) !== 'perigo') return null
  return (
    <div role="alert" className="tv-texto border-b border-danger-border bg-danger-subtle px-6 py-2 font-medium text-danger">
      Sem atualização desde {fmtHoraMin(atualizadoEm)} — confira a conexão desta TV.
    </div>
  )
}

function lerPainel(v: string | null): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= PAINEIS.length ? n - 1 : null
}

function fmtIdade(s: number): string {
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m} min` : fmtDur(m)
}

// ── Painéis ─────────────────────────────────────────────────────────────────

function Carregando() {
  return <div className="tv-texto flex h-[60vh] items-center justify-center text-muted-foreground">Carregando…</div>
}

function Numero({ rotulo, valor, apoio, alerta }: { rotulo: string; valor: string; apoio?: React.ReactNode; alerta?: boolean }) {
  return (
    <div className={cn('rounded-lg border bg-card p-5', alerta && 'border-danger-border')}>
      <p className="tv-texto text-muted-foreground">{rotulo}</p>
      <p className={cn('tv-kpi mt-2', alerta ? 'text-danger' : 'text-foreground')}>{valor}</p>
      {apoio && <p className="tv-texto mt-2 text-muted-foreground">{apoio}</p>}
    </div>
  )
}

function Secao({ titulo, children, className }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border bg-card p-5', className)}>
      <h2 className="tv-titulo mb-4 text-foreground">{titulo}</h2>
      {children}
    </section>
  )
}

function PainelFila({ estado, erro, onRetry }: { estado?: PainelEstadoAtual; erro: boolean; onRetry: () => void }) {
  if (erro) return <BlocoErro onRetry={onRetry} altura={400} />
  if (!estado) return <Carregando />
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
        <Numero rotulo="Na fila" valor={fmtInt(estado.fila.total)} apoio="De Recebida até OC gerada" />
        <Numero rotulo="Fora do SLA" valor={fmtInt(estado.fila.fora_sla)} alerta={estado.fila.fora_sla > 0} apoio="Passaram do alerta da etapa" />
        <Numero rotulo="Em aviso" valor={fmtInt(estado.fila.aviso)} apoio="Perto do limite" />
        <Numero rotulo="Aguardando finalização" valor={fmtInt(estado.fila.aguardando_finalizacao)} apoio="OC enviada ao motorista" />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Secao titulo="Funil por etapa" className="xl:col-span-3">
          <FunilEtapas etapas={estado.etapas} tv />
        </Secao>
        <Secao titulo="Idade da fila" className="xl:col-span-2">
          <IdadeFila aging={estado.aging} tv />
        </Secao>
      </div>
    </div>
  )
}

function PainelRitmo({
  hoje, erro, onRetry, projecao, fim, agora, mostrarMeta,
}: {
  hoje?: PainelHoje
  erro: boolean
  onRetry: () => void
  projecao: number
  fim: string
  agora: number
  mostrarMeta: boolean
}) {
  if (erro) return <BlocoErro onRetry={onRetry} altura={400} />
  if (!hoje) return <Carregando />
  const meta = mostrarMeta ? hoje.meta : null
  const delta = hoje.finalizadas_ref > 0 ? (hoje.finalizadas - hoje.finalizadas_ref) / hoje.finalizadas_ref : null
  const abaixo = meta != null && projecao < meta
  const leadOk = hoje.lead7d.n >= 5 && hoje.lead7d.p50 != null
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="rounded-lg border bg-card p-5 xl:col-span-2">
          <p className="tv-texto text-muted-foreground">Finalizadas hoje</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <span className="tv-kpi text-foreground">{fmtInt(hoje.finalizadas)}</span>
            {meta != null && <span className="tv-kpi-sm text-muted-foreground">de {fmtInt(meta)}</span>}
            <span className="tv-texto text-muted-foreground tabular-nums">
              {delta == null ? 'sem base de ontem' : `${fmtDelta(delta)} vs. ontem até ${fmtHoraMin(agora).replace(':', 'h')}`}
            </span>
          </div>
          {meta != null && (
            <div className="mt-4 h-4 overflow-hidden rounded-[2px] bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={meta} aria-valuenow={hoje.finalizadas} aria-label="Finalizadas em relação à meta">
              <div className={cn('barra-x h-full', abaixo ? 'bg-primary' : 'bg-chart-7')} style={{ width: `${Math.min(100, (hoje.finalizadas / meta) * 100)}%` }} />
            </div>
          )}
          <p className={cn('tv-texto mt-3 tabular-nums', abaixo ? 'font-medium text-primary-strong' : 'text-muted-foreground')}>
            No ritmo das últimas 2 h: ≈ {fmtInt(projecao)} até {rotuloHorario(fim)}
            {abaixo && ' — abaixo da meta'}
          </p>
        </div>
        <Numero
          rotulo="Lead time 7 dias (P50)"
          valor={leadOk ? fmtDur(hoje.lead7d.p50) : '—'}
          apoio={leadOk ? `P90 ${fmtDur(hoje.lead7d.p90)} · n=${fmtInt(hoje.lead7d.n)}` : 'amostra pequena'}
        />
      </div>
      <Secao titulo="Vazão por hora">
        <VazaoHora porHora={hoje.por_hora} tv horaAtual={relogioOperacao(agora).getHours()} />
      </Secao>
    </div>
  )
}

function PainelAtencao({ estado, erro, onRetry, agora }: { estado?: PainelEstadoAtual; erro: boolean; onRetry: () => void; agora: number }) {
  if (erro) return <BlocoErro onRetry={onRetry} altura={400} />
  if (!estado) return <Carregando />
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <Secao titulo={`Mais atrasadas (${fmtInt(estado.fila.fora_sla)} fora do SLA)`} className="xl:col-span-2">
        <MaisAtrasadas atrasadas={estado.atrasadas} geradoEm={estado.gerado_em} agora={agora} limite={12} tv />
      </Secao>
      <Secao titulo="Pendências">
        <Pendencias estado={estado} filtros={{ origem: 'todas', clienteId: null, local: null }} tv />
      </Secao>
    </div>
  )
}

// ── Navegador: tema, Wake Lock e tela cheia ─────────────────────────────────

/** A TV é sempre escura; devolve o tema anterior ao sair. */
function useEscuroForcado() {
  React.useLayoutEffect(() => {
    const raiz = document.documentElement
    const tinha = raiz.classList.contains('dark')
    raiz.classList.add('dark')
    return () => {
      if (!tinha) raiz.classList.remove('dark')
    }
  }, [])
}

type EstadoWakeLock = 'ativo' | 'inativo' | 'sem-suporte'

/**
 * Mantém a tela ligada. O navegador solta o lock quando a aba fica oculta, então
 * ele é pedido de novo no `visibilitychange`. Sem suporte (navegador nativo de
 * Smart TV), falha em silêncio e a tela mostra um aviso.
 */
function useWakeLock(): EstadoWakeLock {
  const suportado = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  const [estado, setEstado] = React.useState<EstadoWakeLock>(suportado ? 'inativo' : 'sem-suporte')
  React.useEffect(() => {
    if (!suportado) return
    let sentinela: WakeLockSentinel | null = null
    let vivo = true
    const pedir = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const s = await navigator.wakeLock.request('screen')
        // Desmontou enquanto o pedido estava em voo: solta na hora.
        if (!vivo) {
          void s.release().catch(() => undefined)
          return
        }
        sentinela = s
        setEstado('ativo')
        sentinela.addEventListener('release', () => {
          if (vivo) setEstado('inativo')
        })
      } catch {
        if (vivo) setEstado('inativo')
      }
    }
    void pedir()
    const onVis = () => void pedir()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', onVis)
      void sentinela?.release().catch(() => undefined)
    }
  }, [suportado])
  return estado
}

function useTelaCheia() {
  const suportado = typeof document !== 'undefined' && !!document.fullscreenEnabled
  const [ativa, setAtiva] = React.useState(false)
  React.useEffect(() => {
    const onChange = () => setAtiva(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      // Sair da TV (ou trocar de rota) não pode deixar o navegador preso em tela cheia.
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
  }, [])
  const alternar = React.useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void document.documentElement.requestFullscreen().catch(() => undefined)
  }, [])
  return { suportado, ativa, alternar }
}
