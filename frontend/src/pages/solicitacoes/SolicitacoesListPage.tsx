import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search as SearchIcon, Inbox, Eraser, ChevronLeft, ChevronRight, X, CheckSquare, Square, Download, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { SolicitacaoStatusBadge } from '@/components/shared/SolicitacaoStatusBadge'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuth } from '@/hooks/useAuth'
import { canEditSolicitacoes, canUseBulkActions } from '@/features/auth/permissions'
import { useNovaSolicitacao } from '@/features/solicitacoes/NovaSolicitacaoProvider'
import { useCrudOptions } from '@/features/crud/useCrudOptions'
import {
  useSolicitacoesList,
  useBulkTransitStatus,
  useBulkDeleteSolicitacoes,
  fetchSolicitacoesParaExport,
  type ListFilters,
  type PeriodoFiltro,
  type SolicitacaoListRow,
} from '@/features/solicitacoes/useSolicitacoes'
import { buildCsv, downloadCsv, type CsvColumn } from '@/lib/csv'
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
  const { profile } = useAuth()
  const canEdit = canEditSolicitacoes(profile)
  const canBulk = canUseBulkActions(profile)
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
  const bulkTransit = useBulkTransitStatus()
  const bulkDelete = useBulkDeleteSolicitacoes()

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = React.useState<{ status: SolicitacaoStatus; label: string } | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false)

  const visibleIds = React.useMemo(
    () => (list.data?.data ?? []).map((r) => r.id),
    [list.data],
  )

  const [lastVisible, setLastVisible] = React.useState<string>('')
  const visibleKey = visibleIds.join(',')
  if (lastVisible !== visibleKey) {
    setLastVisible(visibleKey)
    if (selectedIds.size > 0) {
      const next = new Set<string>()
      for (const id of selectedIds) {
        if (visibleIds.includes(id)) next.add(id)
      }
      if (next.size !== selectedIds.size) setSelectedIds(next)
    }
  }

  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  const toggleId = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(visibleIds))
    }
  }

  const clearSelection = () => setSelectedIds(new Set())

  const [exporting, setExporting] = React.useState(false)

  const exportCsv = async () => {
    setExporting(true)
    try {
      const rows = await fetchSolicitacoesParaExport({
        search: debouncedSearch,
        statuses,
        periodo,
        materialId,
        tipo,
        atendenteId: null,
      })
      if (rows.length === 0) {
        toast.info('Nenhuma solicitação para exportar com os filtros atuais.')
        return
      }
      const cols: CsvColumn<SolicitacaoListRow>[] = [
        { header: 'Número', accessor: (r) => `#${String(r.numero_interno).padStart(4, '0')}` },
        { header: 'Status', accessor: (r) => r.status },
        { header: 'Tipo', accessor: (r) => r.tipo },
        { header: 'Solicitante', accessor: (r) => r.solicitante_nome },
        { header: 'Telefone solicitante', accessor: (r) => r.solicitante_telefone },
        { header: 'Motorista', accessor: (r) => r.motorista?.nome_completo },
        { header: 'CPF motorista', accessor: (r) => r.motorista?.cpf },
        { header: 'Cavalo', accessor: (r) => r.veiculo?.placa },
        { header: 'Carreta', accessor: (r) => r.carreta?.placa },
        { header: 'Subcontratada', accessor: (r) => r.subcontratada?.razao_social },
        { header: 'Cliente', accessor: (r) => r.cliente?.razao_social },
        { header: 'Cidade/UF', accessor: (r) => [r.cliente?.cidade, r.cliente?.uf].filter(Boolean).join('/') },
        { header: 'Material', accessor: (r) => r.material?.nome },
        { header: 'Subtipo', accessor: (r) => r.material_subtipo },
        { header: 'Local de carregamento', accessor: (r) => r.local_carregamento },
        { header: 'Validade início', accessor: (r) => r.validade_inicio },
        { header: 'Validade fim', accessor: (r) => r.validade_fim },
        { header: 'Nº instrução', accessor: (r) => r.numero_instrucao },
        { header: 'Observações', accessor: (r) => r.observacoes },
        { header: 'PDF', accessor: (r) => r.pdf_url },
        { header: 'Criada em', accessor: (r) => r.created_at },
        { header: 'Enviada em', accessor: (r) => r.enviada_em },
        { header: 'Finalizada em', accessor: (r) => r.finalizada_em },
      ]
      const csv = buildCsv(rows, cols)
      const ts = new Date()
      const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}_${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}`
      downloadCsv(`solicitacoes_${stamp}.csv`, csv)
      toast.success(`${rows.length} ${rows.length === 1 ? 'registro exportado' : 'registros exportados'}`)
    } catch (err) {
      toast.error('Falha ao exportar. Tente novamente.')
      console.error('export csv error', err)
    } finally {
      setExporting(false)
    }
  }

  const runBulkTransit = async (status: SolicitacaoStatus) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const extra =
      status === 'finalizada'
        ? { finalizada_em: new Date().toISOString() }
        : status === 'oc_enviada'
        ? { enviada_em: new Date().toISOString() }
        : undefined
    await bulkTransit.mutateAsync({ ids, status, extra })
    clearSelection()
  }

  const runBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    await bulkDelete.mutateAsync({ ids })
    clearSelection()
  }

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
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={exportCsv}
            disabled={exporting || list.isLoading}
            title="Exportar resultados filtrados em CSV"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">Exportar CSV</span>
          </Button>
          {canEdit && (
            <Button onClick={onNova} title="Ctrl+N">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nova solicitação</span>
              <span className="sm:hidden">Nova</span>
              <kbd className="ml-1 hidden text-[10px] text-primary-foreground/70 md:inline">Ctrl+N</kbd>
            </Button>
          )}
        </div>
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
        <>
          {canBulk && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={toggleAll}
                className="text-muted-foreground"
              >
                {allVisibleSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                {allVisibleSelected ? 'Desmarcar página' : 'Selecionar página'}
              </Button>
              {selectedIds.size > 0 && (
                <span className="text-[12px] text-muted-foreground">
                  {selectedIds.size} {selectedIds.size === 1 ? 'selecionada' : 'selecionadas'}
                </span>
              )}
            </div>
          )}

          {canBulk && selectedIds.size > 0 && (
            <BulkActionsBar
              count={selectedIds.size}
              isPending={bulkTransit.isPending || bulkDelete.isPending}
              onClear={clearSelection}
              onAdvanceEmCadastro={() => runBulkTransit('em_cadastro')}
              onMarkEnviada={() => runBulkTransit('oc_enviada')}
              onMarkFinalizada={() => runBulkTransit('finalizada')}
              onCancelarRequest={() =>
                setBulkConfirm({ status: 'cancelada', label: 'Cancelar' })
              }
              onDeleteRequest={() => setDeleteConfirmOpen(true)}
            />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.data!.data.map((row) => (
              <SolicitacaoCard
                key={row.id}
                row={row}
                selectable={canBulk}
                selected={selectedIds.has(row.id)}
                onToggleSelect={() => toggleId(row.id)}
                onOpen={() => navigate(`/solicitacoes/${row.id}`)}
              />
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!bulkConfirm}
        onOpenChange={(o) => !o && setBulkConfirm(null)}
        title={`${bulkConfirm?.label} ${selectedIds.size} ${selectedIds.size === 1 ? 'solicitação' : 'solicitações'}?`}
        description="Esta ação afeta todos os registros selecionados. Você pode duplicá-las depois caso precise refazer."
        confirmLabel={`Sim, ${bulkConfirm?.label.toLowerCase()}`}
        destructive
        onConfirm={async () => {
          if (bulkConfirm) {
            await runBulkTransit(bulkConfirm.status)
            setBulkConfirm(null)
          }
        }}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`Excluir ${selectedIds.size} ${selectedIds.size === 1 ? 'solicitação' : 'solicitações'}?`}
        description="Esta ação é irreversível. Os registros selecionados e seus dados associados serão removidos permanentemente."
        confirmLabel="Sim, excluir"
        destructive
        onConfirm={async () => {
          await runBulkDelete()
          setDeleteConfirmOpen(false)
        }}
      />

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

interface CardProps {
  row: SolicitacaoListRow
  selectable: boolean
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
}

function SolicitacaoCard({ row, selectable, selected, onToggleSelect, onOpen }: CardProps) {
  const created = row.created_at ? new Date(row.created_at) : null
  return (
    <div
      className={cn(
        'rounded-lg border bg-background p-4 transition-colors hover:border-primary/40',
        selectable && selected && 'border-primary bg-primary/5',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {selectable && (
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            aria-label={`Selecionar ${formatNumeroOC(row.numero_interno)}`}
          />
          )}
          <span className="text-[14px] font-medium text-primary shrink-0">{formatNumeroOC(row.numero_interno)}</span>
          {row.solicitante_nome && (
            <span className="truncate text-[13px] text-muted-foreground" title={row.solicitante_nome}>
              · Solicitante: <span className="text-foreground">{row.solicitante_nome}</span>
            </span>
          )}
        </div>
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

interface BulkActionsBarProps {
  count: number
  isPending: boolean
  onClear: () => void
  onAdvanceEmCadastro: () => void
  onMarkEnviada: () => void
  onMarkFinalizada: () => void
  onCancelarRequest: () => void
  onDeleteRequest: () => void
}

function BulkActionsBar({
  count,
  isPending,
  onClear,
  onAdvanceEmCadastro,
  onMarkEnviada,
  onMarkFinalizada,
  onCancelarRequest,
  onDeleteRequest,
}: BulkActionsBarProps) {
  return (
    <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 shadow-sm backdrop-blur">
      <span className="text-[13px] font-medium text-foreground">
        {count} {count === 1 ? 'selecionada' : 'selecionadas'}
      </span>
      <span className="mx-1 h-4 w-px bg-border" />
      <Button size="sm" variant="outline" disabled={isPending} onClick={onAdvanceEmCadastro}>
        Marcar em emissão
      </Button>
      <Button size="sm" variant="outline" disabled={isPending} onClick={onMarkEnviada}>
        Marcar enviada
      </Button>
      <Button size="sm" variant="outline" disabled={isPending} onClick={onMarkFinalizada}>
        Finalizar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={onCancelarRequest}
        className="text-destructive hover:text-destructive"
      >
        <X className="h-4 w-4" />
        Cancelar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={onDeleteRequest}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
        Excluir
      </Button>
      <span className="ml-auto" />
      <Button size="sm" variant="ghost" disabled={isPending} onClick={onClear}>
        Limpar seleção
      </Button>
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
