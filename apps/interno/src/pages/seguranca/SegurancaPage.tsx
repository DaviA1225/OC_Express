import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AlertTriangle, ChevronLeft, ChevronRight, ChevronDown,
  Eraser, Inbox, LogIn, LogOut, FileText, X, KeyRound,
  ShieldAlert,
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
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Segurança</h1>
        <p className="text-[12px] text-muted-foreground">
          Eventos de autenticação e atividade do Portal de Parceiros.
        </p>
      </div>

      {/* Cartão de destaque: falhas nas últimas 24h */}
      <DestaqueFalhas24h count={falhas24h.data ?? null} loading={falhas24h.isLoading} />

      {/* Filtros */}
      <div className="space-y-3 rounded-lg border bg-background p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-[0.5px] text-muted-foreground">Período</Label>
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
      <div className="rounded-lg border bg-background">
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
                    description={hasFilters ? 'Ajuste os filtros acima.' : 'Ainda não há atividade registrada no portal.'}
                  />
                </TableCell>
              </TableRow>
            )}
            {!list.isLoading && (list.data?.data ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-[12px] text-muted-foreground">
                  {format(new Date(row.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                </TableCell>
                <TableCell><TipoBadge tipo={row.tipo_evento} /></TableCell>
                <TableCell className="text-[12px] text-foreground">
                  {row.parceiro_razao_social ?? (row.tipo_evento === 'portal_login_falha'
                    ? <span className="text-muted-foreground">—</span>
                    : <span className="text-muted-foreground">Desconhecido</span>)}
                </TableCell>
                <TableCell className="text-[12px]">
                  {row.parceiro_usuario_nome ?? (row.email_tentado
                    ? <span className="text-muted-foreground">{row.email_tentado}</span>
                    : <span className="text-muted-foreground">—</span>)}
                </TableCell>
                <TableCell className="text-[12px] text-muted-foreground">
                  <DetalhesCell row={row} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {(list.data?.count ?? 0) > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-[12px] text-muted-foreground">
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
        alarmante ? 'border-amber-300 bg-amber-50' : 'border-border bg-background',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
          alarmante ? 'bg-amber-200 text-amber-900' : 'bg-muted text-muted-foreground',
        )}
      >
        {alarmante ? <AlertTriangle className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
      </span>
      <div className="flex-1">
        <p className="text-[13px] font-medium text-foreground">
          {loading ? '—' : count} tentativa(s) de login falhada(s) nas últimas 24 horas
        </p>
        <p className="text-[11px] text-muted-foreground">
          {alarmante
            ? 'Volume elevado — vale conferir se vem do mesmo email ou parceiro.'
            : 'Conta inclui tentativas com qualquer email, mesmo sem cadastro.'}
        </p>
      </div>
    </div>
  )
}

function PeriodoSelect({ value, onChange }: { value: Periodo; onChange: (v: Periodo) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Periodo)}
        className="h-9 appearance-none rounded-md border bg-background pl-3 pr-8 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring"
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
      <Label className="text-[11px] uppercase tracking-[0.5px] text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = value.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              className={cn(
                'rounded-full border px-3 py-1 text-[12px] transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground/80 hover:bg-muted',
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
  portal_login: { className: 'bg-emerald-100 text-emerald-800', icon: <LogIn className="h-3 w-3" /> },
  portal_login_falha: { className: 'bg-red-100 text-red-800', icon: <AlertTriangle className="h-3 w-3" /> },
  portal_logout: { className: 'bg-slate-100 text-slate-700', icon: <LogOut className="h-3 w-3" /> },
  portal_solicitacao_criada: { className: 'bg-blue-100 text-blue-800', icon: <FileText className="h-3 w-3" /> },
  portal_solicitacao_cancelada: { className: 'bg-amber-100 text-amber-800', icon: <X className="h-3 w-3" /> },
  portal_senha_alterada: { className: 'bg-purple-100 text-purple-800', icon: <KeyRound className="h-3 w-3" /> },
}

function TipoBadge({ tipo }: { tipo: TipoEventoPortal }) {
  const m = TIPO_VISUAL[tipo]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', m.className)}>
      {m.icon}
      {TIPO_EVENTO_LABELS[tipo]}
    </span>
  )
}

function DetalhesCell({ row }: { row: EventoPortalRowResolved }) {
  return (
    <div className="flex flex-col gap-0.5">
      {row.solicitacao_id && (
        <Link
          to={`/solicitacoes/${row.solicitacao_id}`}
          className="text-[12px] font-medium text-primary hover:underline"
        >
          {row.numero_interno_solicitacao
            ? `Solicitação #${String(row.numero_interno_solicitacao).padStart(4, '0')}`
            : 'Abrir solicitação'}
        </Link>
      )}
      {row.user_agent && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="line-clamp-1 cursor-help text-[11px] text-muted-foreground">
              {shortUserAgent(row.user_agent)}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-[420px] break-all">
            {row.user_agent}
          </TooltipContent>
        </Tooltip>
      )}
      {row.ip && (
        <span className="text-[11px] text-muted-foreground">IP: {row.ip}</span>
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
