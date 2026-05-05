import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search as SearchIcon, Inbox, Eraser, ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { SolicitacaoStatusBadge } from '@/components/shared/SolicitacaoStatusBadge'
import { useDebounce } from '@/hooks/useDebounce'
import { useNovaSolicitacao } from '@/features/solicitacoes/NovaSolicitacaoProvider'
import { useCrudOptions } from '@/features/crud/useCrudOptions'
import {
  useSolicitacoesList,
  type ListFilters,
  type PeriodoFiltro,
  type SolicitacaoListRow,
} from '@/features/solicitacoes/useSolicitacoes'
import { STATUS_LABELS } from '@/features/solicitacoes/status'
import { formatNumeroOC } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { SolicitacaoStatus, SolicitacaoTipo, Tables } from '@/types/database.types'

type MaterialOpt = Pick<Tables<'materiais'>, 'id' | 'nome'>

const VALID_PERIODOS: PeriodoFiltro[] = ['todos', 'hoje', '7d', 'mes']
const VALID_TIPOS: (SolicitacaoTipo | 'todos')[] = ['todos', 'carregamento', 'retorno']
const VALID_STATUSES: SolicitacaoStatus[] = [
  'recebida', 'em_cadastro', 'instrucao_emitida', 'oc_gerada', 'oc_enviada', 'finalizada', 'cancelada',
]

export function SolicitacoesListPage() {
  const navigate = useNavigate()
  const { open: onNova } = useNovaSolicitacao()
  const [params, setParams] = useSearchParams()

  const search = params.get('search') ?? ''
  const debouncedSearch = useDebounce(search, 300)
  const statuses = React.useMemo<SolicitacaoStatus[]>(() => {
    const raw = params.get('status')
    if (!raw) return []
    return raw.split(',').filter((s): s is SolicitacaoStatus => VALID_STATUSES.includes(s as SolicitacaoStatus))
  }, [params])
  const periodo = (() => {
    const raw = params.get('periodo')
    return VALID_PERIODOS.includes(raw as PeriodoFiltro) ? (raw as PeriodoFiltro) : 'todos'
  })()
  const materialId = params.get('material') || null
  const tipo = (() => {
    const raw = params.get('tipo')
    return VALID_TIPOS.includes(raw as SolicitacaoTipo | 'todos') ? (raw as SolicitacaoTipo | 'todos') : 'todos'
  })()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const pageSize = 30

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

  const setSearch = (v: string) =>
    updateParams((n) => {
      if (v) n.set('search', v); else n.delete('search')
      n.delete('page')
    })
  const setStatuses = (v: SolicitacaoStatus[]) =>
    updateParams((n) => {
      if (v.length > 0) n.set('status', v.join(',')); else n.delete('status')
      n.delete('page')
    })
  const setPeriodo = (v: PeriodoFiltro) =>
    updateParams((n) => {
      if (v !== 'todos') n.set('periodo', v); else n.delete('periodo')
      n.delete('page')
    })
  const setMaterialId = (v: string | null) =>
    updateParams((n) => {
      if (v) n.set('material', v); else n.delete('material')
      n.delete('page')
    })
  const setTipo = (v: SolicitacaoTipo | 'todos') =>
    updateParams((n) => {
      if (v !== 'todos') n.set('tipo', v); else n.delete('tipo')
      n.delete('page')
    })
  const setPage = (p: number) =>
    updateParams((n) => {
      if (p > 1) n.set('page', String(p)); else n.delete('page')
    })

  const filters: ListFilters = {
    search: debouncedSearch,
    statuses,
    periodo,
    materialId,
    tipo,
    atendenteId: null,
    page,
    pageSize,
  }

  const list = useSolicitacoesList(filters)
  const materiais = useCrudOptions<MaterialOpt>({
    table: 'materiais', selectColumns: 'id, nome', orderBy: 'nome',
  })

  const totalPages = Math.max(1, Math.ceil((list.data?.count ?? 0) / pageSize))
  const hasFilters =
    search.trim() !== '' || statuses.length > 0 || periodo !== 'todos' || !!materialId || tipo !== 'todos'

  const clearFilters = () => {
    setSearch(''); setStatuses([]); setPeriodo('todos'); setMaterialId(null); setTipo('todos')
  }

  const toggleStatus = (s: SolicitacaoStatus) => {
    setStatuses(statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s])
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-medium text-foreground">Solicitações</h1>
          <p className="text-[12px] text-muted-foreground">
            {list.data?.count ?? 0} {list.data?.count === 1 ? 'registro' : 'registros'}
          </p>
        </div>
        <Button onClick={onNova} title="Ctrl+N">
          <Plus className="h-4 w-4" />
          Nova solicitação
          <kbd className="ml-1 hidden text-[10px] text-primary-foreground/70 md:inline">Ctrl+N</kbd>
        </Button>
      </div>

      <div className="space-y-3 rounded-lg border bg-background p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por número (#0287) ou solicitante"
              className="pl-9"
            />
          </div>
          <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="carregamento">Carregamento</SelectItem>
              <SelectItem value="retorno">Retorno</SelectItem>
            </SelectContent>
          </Select>
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoFiltro)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todo período</SelectItem>
              <SelectItem value="hoje">Hoje</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="mes">Mês atual</SelectItem>
            </SelectContent>
          </Select>
          <Select value={materialId ?? 'todos'} onValueChange={(v) => setMaterialId(v === 'todos' ? null : v)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os materiais</SelectItem>
              {(materiais.data ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <Eraser className="h-3.5 w-3.5" />
              Limpar
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {VALID_STATUSES.map((s) => {
            const active = statuses.includes(s)
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                {STATUS_LABELS[s]}
              </button>
            )
          })}
        </div>
      </div>

      {list.isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-background p-4">
              <Skeleton className="h-5 w-1/2 mb-3" />
              <Skeleton className="h-3 w-3/4 mb-2" />
              <Skeleton className="h-3 w-2/3 mb-2" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {!list.isLoading && (list.data?.data.length ?? 0) === 0 && (
        <div className="rounded-lg border bg-background py-2">
          <EmptyState
            icon={Inbox}
            title={hasFilters ? 'Nada encontrado com esses filtros' : 'Nenhuma solicitação ainda'}
            description={hasFilters ? 'Tente limpar alguns filtros.' : 'Que tal criar a primeira?'}
            action={
              hasFilters ? (
                <Button variant="outline" onClick={clearFilters}>Limpar filtros</Button>
              ) : (
                <Button onClick={onNova}>
                  <Plus className="h-4 w-4" /> Nova solicitação
                </Button>
              )
            }
          />
        </div>
      )}

      {!list.isLoading && (list.data?.data.length ?? 0) > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.data!.data.map((row) => (
            <SolicitacaoCard key={row.id} row={row} onOpen={() => navigate(`/solicitacoes/${row.id}`)} />
          ))}
        </div>
      )}

      {(list.data?.count ?? 0) > pageSize && (
        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
          <span>Página {page} de {totalPages} · {list.data?.count} registros</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
              Próxima <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function SolicitacaoCard({ row, onOpen }: { row: SolicitacaoListRow; onOpen: () => void }) {
  const created = row.created_at ? new Date(row.created_at) : null
  return (
    <div className="rounded-lg border bg-background p-4 transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-medium text-primary">{formatNumeroOC(row.numero_interno)}</span>
        <SolicitacaoStatusBadge status={row.status} />
      </div>
      <div className="mt-3 border-t pt-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
          <Field label="Motorista" value={row.motorista?.nome_completo} />
          <Field
            label="Veículo"
            value={[row.veiculo?.placa, row.carreta?.placa].filter(Boolean).join(' / ') || null}
          />
          <Field label="Cliente" value={row.cliente?.razao_social} />
          <Field label="Material" value={row.material?.nome} />
        </dl>
      </div>
      <div className="mt-3 flex items-center justify-between border-t pt-3 text-[11px] text-muted-foreground">
        <span>
          {created ? format(created, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—'}
          {row.numero_instrucao ? ` · Instr. ${row.numero_instrucao}` : ''}
        </span>
        <Button variant="outline" size="sm" onClick={onOpen}>Abrir</Button>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value ?? '—'}</dd>
    </div>
  )
}
