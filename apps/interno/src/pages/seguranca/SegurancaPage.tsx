import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AlertTriangle, ChevronLeft, ChevronRight, ChevronDown,
  Eraser, Inbox, LogIn, LogOut, FileText, FilePen, X, KeyRound,
  ShieldAlert, UserPlus, UserMinus, Circle, CalendarClock, RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/layout/PageHeader'
import { cn } from '@/lib/utils'
import {
  useEventosPortal,
  useParceirosParaFiltro,
  useLoginFalhasUltimas24h,
  TIPO_EVENTO_LABELS,
  TIPOS_EVENTO,
  type EventosPortalFilters,
  type EventoPortalRowResolved,
} from '@/features/seguranca/useEventosPortal'
import type { TipoEventoPortal } from '@/types/database.types'

const PAGE_SIZE = 30

type Periodo = 'hoje' | '7d' | '30d' | 'mes' | 'todos'

const PERIODO_LABELS: Record<Periodo, string> = {
  hoje: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  mes: 'Mês atual',
  todos: 'Todos os períodos',
}

function startOfTodayISO(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
}
function nDaysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
}
function startOfMonthISO(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}
function periodoToDesde(p: Periodo): string | null {
  switch (p) {
    case 'hoje': return startOfTodayISO()
    case '7d': return nDaysAgoISO(7)
    case '30d': return nDaysAgoISO(30)
    case 'mes': return startOfMonthISO()
    default: return null
  }
}

const VALID_PERIODOS: Periodo[] = ['hoje', '7d', '30d', 'mes', 'todos']

export default function SegurancaPage() {
  const [params, setParams] = useSearchParams()

  const periodo = (() => {
    const raw = params.get('periodo')
    return VALID_PERIODOS.includes(raw as Periodo) ? (raw as Periodo) : '7d'
  })()
  const tipos = React.useMemo<TipoEventoPortal[]>(() => {
    const raw = params.get('tipos')
    if (!raw) return []
    return raw.split(',').filter((t): t is TipoEventoPortal => TIPOS_EVENTO.includes(t as TipoEventoPortal))
  }, [params])
  const parceiroIds = React.useMemo<string[]>(() => {
    const raw = params.get('parceiros')
    return raw ? raw.split(',') : []
  }, [params])
  const page = Math.max(1, Number(params.get('page')) || 1)

  const parceirosFiltro = useParceirosParaFiltro()
  const falhas24h = useLoginFalhasUltimas24h()

  const updateParams = React.useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          mutate(next)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const setPeriodo = (v: Periodo) =>
    updateParams((n) => {
      if (v !== '7d') n.set('periodo', v); else n.delete('periodo')
      n.delete('page')
    })
  const setTipos = (v: TipoEventoPortal[]) =>
    updateParams((n) => {
      if (v.length > 0) n.set('tipos', v.join(',')); else n.delete('tipos')
      n.delete('page')
    })
  const setParceiroIds = (v: string[]) =>
    updateParams((n) => {
      if (v.length > 0) n.set('parceiros', v.join(',')); else n.delete('parceiros')
      n.delete('page')
    })
  const setPage = (p: number) =>
    updateParams((n) => {
      if (p > 1) n.set('page', String(p)); else n.delete('page')
    })

  const filters: EventosPortalFilters = {
    tipos,
    parceiroIds,
    periodo: { desde: periodoToDesde(periodo), ate: null },
    page,
    pageSize: PAGE_SIZE,
  }
  const list = useEventosPortal(filters)
  const totalPages = Math.max(1, Math.ceil((list.data?.count ?? 0) / PAGE_SIZE))
  const hasFilters = tipos.length > 0 || parceiroIds.length > 0 || periodo !== '7d'

  const clearFilters = () =>
    updateParams((n) => {
      n.delete('tipos')
      n.delete('parceiros')
      n.delete('periodo')
      n.delete('page')
    })

  const toggleArr = <T,>(arr: T[], setArr: (v: T[]) => void, item: T) => {
    setArr(arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item])
  }

  return (
    <div className="space-y-4">
      <PageHeader
        className="mb-0"
        title="Segurança"
        description="Eventos de autenticação e atividade do Portal de Parceiros."
      />

      {/* Cartão de destaque: falhas nas últimas 24h */}
      <DestaqueFalhas24h count={falhas24h.data ?? null} loading={falhas24h.isLoading} />

      {/* Filtros */}
      <div className="space-y-3 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="periodo-seguranca" className="text-body-sm text-muted-foreground">Período</Label>
            <PeriodoSelect value={periodo} onChange={setPeriodo} />
          </div>
          <div className="ml-auto">
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <Eraser className="h-3.5 w-3.5" />
                Limpar filtros
              </Button>
            )}
          </div>
        </div>

        <FilterChips
          label="Tipo de evento"
          options={TIPOS_EVENTO.map((t) => ({ value: t, label: TIPO_EVENTO_LABELS[t] }))}
          value={tipos}
          onToggle={(v) => toggleArr(tipos, setTipos, v as TipoEventoPortal)}
        />

        {(parceirosFiltro.data ?? []).length > 0 && (
          <FilterChips
            label="Parceiro"
            options={(parceirosFiltro.data ?? []).map((p) => ({ value: p.id, label: p.razao_social }))}
            value={parceiroIds}
            onToggle={(v) => toggleArr(parceiroIds, setParceiroIds, v)}
          />
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Data/hora</TableHead>
              <TableHead className="w-[170px]">Evento</TableHead>
              <TableHead>Parceiro</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead className="w-[260px]">Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell>
              </TableRow>
            ))}
            {!list.isLoading && (list.data?.data.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-12">
                  <EmptyState
                    icon={Inbox}
                    title="Nenhum evento encontrado"
                    description={hasFilters ? 'Nenhum registro para os filtros aplicados.' : 'Ainda não há atividade registrada no portal.'}
                  />
                </TableCell>
              </TableRow>
            )}
            {!list.isLoading && (list.data?.data ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-body-sm text-muted-foreground">
                  {format(new Date(row.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                </TableCell>
                <TableCell><TipoBadge tipo={row.tipo_evento} /></TableCell>
                <TableCell className="text-body-sm text-foreground">
                  {row.parceiro_razao_social ?? (row.tipo_evento === 'portal_login_falha'
                    ? <span className="text-muted-foreground">—</span>
                    : <span className="text-muted-foreground">Desconhecido</span>)}
                </TableCell>
                <TableCell className="text-body-sm">
                  {row.parceiro_usuario_nome ?? (row.email_tentado
                    ? <span className="text-muted-foreground">{row.email_tentado}</span>
                    : <span className="text-muted-foreground">—</span>)}
                </TableCell>
                <TableCell className="text-body-sm text-muted-foreground">
                  <DetalhesCell row={row} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {(list.data?.count ?? 0) > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-body-sm text-muted-foreground">
            <span>
              Página {page} de {totalPages} · {list.data?.count} eventos
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
                Próxima
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DestaqueFalhas24h({ count, loading }: { count: number | null; loading: boolean }) {
  const alarmante = (count ?? 0) >= 5
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border p-3',
        alarmante ? 'border-warning-border bg-warning-subtle' : 'border-border bg-card',
      )}
    >
      {alarmante
        ? <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        : <ShieldAlert className="h-4 w-4 shrink-0 text-tertiary" aria-hidden />}
      <div className="flex-1">
        <p className="text-body font-medium text-foreground">
          {loading ? '—' : count} {count === 1 ? 'tentativa de login com falha' : 'tentativas de login com falha'} nas últimas 24 horas
        </p>
        <p className="text-body-sm text-muted-foreground">
          {alarmante
            ? 'Volume elevado, vale conferir se vem do mesmo e-mail ou parceiro.'
            : 'Conta inclui tentativas com qualquer e-mail, mesmo sem cadastro.'}
        </p>
      </div>
    </div>
  )
}

function PeriodoSelect({ value, onChange }: { value: Periodo; onChange: (v: Periodo) => void }) {
  return (
    <div className="relative">
      <select
        id="periodo-seguranca"
        value={value}
        onChange={(e) => onChange(e.target.value as Periodo)}
        className="h-9 appearance-none rounded-md border border-input bg-card pl-3 pr-8 text-body text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {VALID_PERIODOS.map((p) => (
          <option key={p} value={p}>{PERIODO_LABELS[p]}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

interface FilterChipsProps {
  label: string
  options: { value: string; label: string }[]
  value: string[]
  onToggle: (v: string) => void
}
function FilterChips({ label, options, value, onToggle }: FilterChipsProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-body-sm text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {options.map((o) => {
          const active = value.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              aria-pressed={active}
              className={cn(
                'rounded-[2px] border px-2.5 py-1 text-body-sm transition-colors duration-fast',
                active
                  ? 'border-primary bg-primary/[0.08] font-medium text-foreground'
                  : 'border-input bg-card text-foreground hover:bg-row-hover',
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const TIPO_VISUAL: Record<TipoEventoPortal, { className: string; icon: React.ReactNode }> = {
  portal_login: { className: 'bg-success-subtle text-success', icon: <LogIn className="h-3 w-3" /> },
  portal_login_falha: { className: 'bg-danger-subtle text-danger', icon: <AlertTriangle className="h-3 w-3" /> },
  portal_logout: { className: 'bg-muted text-muted-foreground', icon: <LogOut className="h-3 w-3" /> },
  portal_solicitacao_criada: { className: 'cat-steel', icon: <FileText className="h-3 w-3" /> },
  portal_solicitacao_editada: { className: 'cat-ink', icon: <FilePen className="h-3 w-3" /> },
  portal_solicitacao_cancelada: { className: 'bg-warning-subtle text-warning', icon: <X className="h-3 w-3" /> },
  portal_senha_alterada: { className: 'cat-clay', icon: <KeyRound className="h-3 w-3" /> },
  portal_usuario_convidado: { className: 'cat-sage', icon: <UserPlus className="h-3 w-3" /> },
  portal_usuario_excluido: { className: 'bg-danger-subtle text-danger', icon: <UserMinus className="h-3 w-3" /> },
  portal_agendamento_solicitado: { className: 'cat-brass', icon: <CalendarClock className="h-3 w-3" /> },
  portal_agendamento_cancelado: { className: 'bg-warning-subtle text-warning', icon: <X className="h-3 w-3" /> },
  portal_agendamento_reagendado: { className: 'cat-clay', icon: <RotateCcw className="h-3 w-3" /> },
}

const TIPO_VISUAL_FALLBACK = { className: 'bg-muted text-muted-foreground', icon: <Circle className="h-3 w-3" /> }

function TipoBadge({ tipo }: { tipo: TipoEventoPortal }) {
  const m = TIPO_VISUAL[tipo] ?? TIPO_VISUAL_FALLBACK
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-[2px] px-1.5 py-0.5 text-meta font-medium', m.className)}>
      {m.icon}
      {TIPO_EVENTO_LABELS[tipo] ?? tipo}
    </span>
  )
}

function DetalhesCell({ row }: { row: EventoPortalRowResolved }) {
  return (
    <div className="flex flex-col gap-0.5">
      {row.solicitacao_id && (
        <Link
          to={`/solicitacoes/${row.solicitacao_id}`}
          className="text-body-sm font-medium text-primary-strong hover:underline"
        >
          {row.numero_interno_solicitacao
            ? `Solicitação #${String(row.numero_interno_solicitacao).padStart(4, '0')}`
            : 'Abrir solicitação'}
        </Link>
      )}
      {row.user_agent && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="line-clamp-1 cursor-help text-meta text-muted-foreground">
              {shortUserAgent(row.user_agent)}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-[420px] break-all">
            {row.user_agent}
          </TooltipContent>
        </Tooltip>
      )}
      {row.ip && (
        <span className="text-meta text-muted-foreground">IP: {row.ip}</span>
      )}
    </div>
  )
}

function shortUserAgent(ua: string): string {
  // Heuristica simples — pega o "principal" navegador/SO
  const m = ua.match(/(Chrome|Edge|Safari|Firefox)\/[\d.]+/)
  const os = ua.match(/\((.*?)\)/)?.[1]?.split(';')[0]
  return [m?.[0], os].filter(Boolean).join(' · ') || ua.slice(0, 60)
}
