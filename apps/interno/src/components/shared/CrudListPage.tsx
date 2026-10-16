import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search as SearchIcon, ChevronLeft, ChevronRight, Inbox, Lock, Pencil, Power, Trash2, AlertTriangle, RotateCcw } from 'lucide-react'
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
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from './EmptyState'
import { ConfirmDialog } from './ConfirmDialog'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'

const ROTULO_TONS = {
  neutro: 'bg-muted text-muted-foreground',
  sucesso: 'bg-success-subtle text-success',
  aviso: 'bg-warning-subtle text-warning',
  perigo: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
} as const

/**
 * Rótulo retangular de situação/tag dos cadastros (Ativo, Inativo, Liberado…).
 * Retângulo 2px, texto 11px — nunca pílula colorida.
 */
export function RotuloSituacao({
  tom = 'neutro',
  className,
  children,
}: {
  tom?: keyof typeof ROTULO_TONS
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-[2px] px-1.5 py-0.5 text-meta font-medium',
        ROTULO_TONS[tom],
        className,
      )}
    >
      {children}
    </span>
  )
}

export interface ColumnDef<T> {
  header: string
  accessor: (row: T) => React.ReactNode
  className?: string
}

export interface CrudListPageProps<T extends { id: string; ativo: boolean }> {
  title: string
  /** Uma linha de contexto sob o título (opcional). */
  description?: string
  newButtonLabel?: string
  onNew?: () => void
  headerActions?: React.ReactNode
  rows: T[] | undefined
  isLoading: boolean
  isError?: boolean
  onRetry?: () => void
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
  /** Renderiza botões custom ANTES dos ícones padrão (edit/toggle/delete).
   *  Útil pra ações que dependem da linha mas não se encaixam no CRUD padrão
   *  (ex: navegar pra sub-rota). Cada elemento deve cuidar do próprio aria-label. */
  rowActions?: (row: T) => React.ReactNode
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
    description,
    newButtonLabel,
    onNew,
    headerActions,
    rows,
    isLoading,
    isError,
    onRetry,
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
    rowActions,
    rowLabel,
    emptyTitle = 'Nada encontrado',
    emptyDescription = 'Nenhum registro para os filtros aplicados.',
    page,
    pageSize,
    onPageChange,
    totalCount,
    onBulkToggleActive,
    onBulkDelete,
  } = props

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const hasActions = !!(onEdit || onToggleActive || onDelete || rowActions)
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
      <PageHeader
        className="mb-0"
        title={title}
        description={description}
        meta={
          <span className="text-body-sm tabular-nums text-muted-foreground">
            {searchValue.trim()
              ? `${totalCount} ${totalCount === 1 ? 'resultado' : 'resultados'}`
              : `${totalActive} ${totalActive === 1 ? 'ativo' : 'ativos'}`}
          </span>
        }
        actions={
          headerActions || (onNew && newButtonLabel) ? (
            <>
              {headerActions}
              {onNew && newButtonLabel && (
                <Button onClick={onNew}>
                  <Plus className="h-4 w-4" />
                  {newButtonLabel}
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
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
          <Label htmlFor="show-inactive" className="text-body-sm text-muted-foreground">
            Mostrar inativos
          </Label>
        </div>
      </div>

      {selectable && selectedIds.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-popover px-3 py-2 shadow-overlay">
          <span className="text-body font-medium text-foreground">
            {selectedIds.size} {selectedIds.size === 1 ? 'selecionado' : 'selecionados'}
          </span>
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
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

      <div className="overflow-hidden rounded-lg border bg-card">
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

            {!isLoading && isError && (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (hasActions ? 1 : 0) + (selectable ? 1 : 0)}
                  className="py-0"
                >
                  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                    <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
                    <p className="text-body-lg font-semibold text-foreground">Não foi possível carregar</p>
                    <p className="max-w-sm text-body text-muted-foreground">
                      Houve um erro ao buscar os registros. Verifique a conexão e tente novamente.
                    </p>
                    {onRetry && (
                      <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
                        <RotateCcw className="h-4 w-4" /> Tentar novamente
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !isError && rows && rows.length === 0 && (
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

            {!isLoading && !isError && rows?.map((row) => (
              <TableRow
                key={row.id}
                data-state={selectedIds.has(row.id) ? 'selected' : undefined}
                className={cn(!row.ativo && 'text-muted-foreground')}
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
                      <Lock className="mr-1 inline h-3 w-3 text-tertiary" aria-label="Inativo" />
                    )}
                    {c.accessor(row)}
                  </TableCell>
                ))}
                {hasActions && (
                  <TableCell>
                    <div className="flex items-center justify-start gap-1">
                      {rowActions?.(row)}
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
        <div className="flex items-center justify-between text-body-sm text-muted-foreground">
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
        confirmLabel="Excluir"
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
