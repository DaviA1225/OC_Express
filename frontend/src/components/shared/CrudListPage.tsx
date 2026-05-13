import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search as SearchIcon, ChevronLeft, ChevronRight, Inbox, Lock, Pencil, Power, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { EmptyState } from './EmptyState'
import { ConfirmDialog } from './ConfirmDialog'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'

export interface ColumnDef<T> {
  header: string
  accessor: (row: T) => React.ReactNode
  className?: string
}

export interface CrudListPageProps<T extends { id: string; ativo: boolean }> {
  title: string
  newButtonLabel?: string
  onNew?: () => void
  rows: T[] | undefined
  isLoading: boolean
  totalActive: number
  searchValue: string
  onSearchChange: (v: string) => void
  searchPlaceholder?: string
  showInactive: boolean
  onShowInactiveChange: (v: boolean) => void
  columns: ColumnDef<T>[]
  rowLabel?: (row: T) => string
  onEdit?: (row: T) => void
  onToggleActive?: (row: T) => void
  onDelete?: (row: T) => void
  emptyTitle?: string
  emptyDescription?: string
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  totalCount: number
  onBulkToggleActive?: (ids: string[], ativo: boolean) => Promise<void>
  onBulkDelete?: (ids: string[]) => Promise<void>
}

export function CrudListPage<T extends { id: string; ativo: boolean }>(props: CrudListPageProps<T>) {
  const {
    title,
    newButtonLabel,
    onNew,
    rows,
    isLoading,
    totalActive,
    searchValue,
    onSearchChange,
    searchPlaceholder,
    showInactive,
    onShowInactiveChange,
    columns,
    onEdit,
    onToggleActive,
    onDelete,
    rowLabel,
    emptyTitle = 'Nada encontrado',
    emptyDescription = 'Ajuste os filtros ou crie um novo registro.',
    page,
    pageSize,
    onPageChange,
    totalCount,
    onBulkToggleActive,
    onBulkDelete,
  } = props

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const hasActions = !!(onEdit || onToggleActive || onDelete)
  const selectable = !!(onBulkToggleActive || onBulkDelete)

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkPending, setBulkPending] = React.useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false)

  const visibleIds = React.useMemo(() => (rows ?? []).map((r) => r.id), [rows])
  const visibleKey = visibleIds.join(',')
  const [lastVisibleKey, setLastVisibleKey] = React.useState(visibleKey)
  if (lastVisibleKey !== visibleKey) {
    setLastVisibleKey(visibleKey)
    if (selectedIds.size > 0) {
      const next = new Set<string>()
      for (const id of selectedIds) if (visibleIds.includes(id)) next.add(id)
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
  const toggleAllVisible = () => {
    if (allVisibleSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(visibleIds))
  }
  const clearSelection = () => setSelectedIds(new Set())

  const runBulk = async (fn: () => Promise<void>) => {
    setBulkPending(true)
    try {
      await fn()
      clearSelection()
    } finally {
      setBulkPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="text-[12px] text-muted-foreground">
            {totalActive} {totalActive === 1 ? 'ativo' : 'ativos'}
          </p>
        </div>
        {onNew && newButtonLabel && (
          <Button onClick={onNew}>
            <Plus className="h-4 w-4" />
            {newButtonLabel}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3">
        <div className="relative flex-1 min-w-[220px]" data-page-search>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder ?? 'Buscar…'}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="show-inactive"
            checked={showInactive}
            onCheckedChange={onShowInactiveChange}
          />
          <Label htmlFor="show-inactive" className="text-[12px] text-muted-foreground">
            Mostrar inativos
          </Label>
        </div>
      </div>

      {selectable && selectedIds.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 shadow-sm backdrop-blur">
          <span className="text-[13px] font-medium text-foreground">
            {selectedIds.size} {selectedIds.size === 1 ? 'selecionado' : 'selecionados'}
          </span>
          <span className="mx-1 h-4 w-px bg-border" />
          {onBulkToggleActive && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkPending}
                onClick={() => runBulk(() => onBulkToggleActive(Array.from(selectedIds), true))}
              >
                Reativar
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkPending}
                onClick={() => runBulk(() => onBulkToggleActive(Array.from(selectedIds), false))}
              >
                Desativar
              </Button>
            </>
          )}
          {onBulkDelete && (
            <Button
              size="sm"
              variant="ghost"
              disabled={bulkPending}
              onClick={() => setConfirmBulkDelete(true)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          )}
          <span className="ml-auto" />
          <Button size="sm" variant="ghost" disabled={bulkPending} onClick={clearSelection}>
            Limpar seleção
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleAllVisible}
                    aria-label="Selecionar página"
                  />
                </TableHead>
              )}
              {columns.map((c, i) => (
                <TableHead key={i} className={c.className}>{c.header}</TableHead>
              ))}
              {hasActions && (
                <TableHead className={cn(onDelete ? 'w-[150px]' : 'w-[110px]')}>Ações</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    {selectable && <TableCell><Skeleton className="h-4 w-4" /></TableCell>}
                    {columns.map((_c, ci) => (
                      <TableCell key={ci}><Skeleton className="h-4 w-3/4" /></TableCell>
                    ))}
                    {hasActions && <TableCell><Skeleton className="h-4 w-16" /></TableCell>}
                  </TableRow>
                ))}
              </>
            )}

            {!isLoading && rows && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (hasActions ? 1 : 0) + (selectable ? 1 : 0)}
                  className="py-0"
                >
                  <EmptyState
                    icon={Inbox}
                    title={emptyTitle}
                    description={emptyDescription}
                  />
                </TableCell>
              </TableRow>
            )}

            {!isLoading && rows?.map((row) => (
              <TableRow
                key={row.id}
                className={cn(!row.ativo && 'opacity-60', selectedIds.has(row.id) && 'bg-primary/5')}
              >
                {selectable && (
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(row.id)}
                      onCheckedChange={() => toggleId(row.id)}
                      aria-label={`Selecionar ${rowLabel?.(row) ?? ''}`}
                    />
                  </TableCell>
                )}
                {columns.map((c, i) => (
                  <TableCell key={i} className={c.className}>
                    {i === 0 && !row.ativo && (
                      <Lock className="mr-1 inline h-3 w-3 text-destructive" />
                    )}
                    {c.accessor(row)}
                  </TableCell>
                ))}
                {hasActions && (
                  <TableCell>
                    <div className="flex items-center justify-start gap-1">
                      {onEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(row)}
                          aria-label={`Editar ${rowLabel?.(row) ?? ''}`}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {onToggleActive && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onToggleActive(row)}
                          aria-label={row.ativo ? 'Desativar' : 'Reativar'}
                          title={row.ativo ? 'Desativar' : 'Reativar'}
                        >
                          <Power className={cn('h-4 w-4', row.ativo ? 'text-foreground' : 'text-success')} />
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(row)}
                          aria-label={`Excluir ${rowLabel?.(row) ?? ''}`}
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalCount > pageSize && (
        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
          <span>
            Página {page} de {totalPages} · {totalCount} registros
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`Excluir ${selectedIds.size} ${selectedIds.size === 1 ? 'registro' : 'registros'}?`}
        description="Os cadastros selecionados serão removidos permanentemente. Essa ação não pode ser desfeita. Registros em uso por solicitações terão a exclusão bloqueada."
        confirmLabel="Sim, excluir"
        destructive
        onConfirm={async () => {
          if (onBulkDelete) {
            await runBulk(() => onBulkDelete(Array.from(selectedIds)))
          }
          setConfirmBulkDelete(false)
        }}
      />
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCrudListState(initialPageSize = 20) {
  const [params, setParams] = useSearchParams()
  const search = params.get('search') ?? ''
  const showInactive = params.get('inactive') === '1'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const debouncedSearch = useDebounce(search, 300)

  const setSearch = React.useCallback((v: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v) next.set('search', v)
        else next.delete('search')
        next.delete('page')
        return next
      },
      { replace: true },
    )
  }, [setParams])

  const setShowInactive = React.useCallback((v: boolean) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v) next.set('inactive', '1')
        else next.delete('inactive')
        next.delete('page')
        return next
      },
      { replace: true },
    )
  }, [setParams])

  const setPage = React.useCallback((p: number) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (p > 1) next.set('page', String(p))
        else next.delete('page')
        return next
      },
      { replace: true },
    )
  }, [setParams])

  return {
    search,
    setSearch,
    debouncedSearch,
    showInactive,
    setShowInactive,
    page,
    setPage,
    pageSize: initialPageSize,
  }
}
