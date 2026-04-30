import * as React from 'react'
import { Plus, Search as SearchIcon, ChevronLeft, ChevronRight, Inbox, Lock, Pencil, Power, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
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
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'

export interface ColumnDef<T> {
  header: string
  accessor: (row: T) => React.ReactNode
  className?: string
}

export interface CrudListPageProps<T extends { id: string; ativo: boolean }> {
  title: string
  newButtonLabel: string
  onNew: () => void
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
  onEdit: (row: T) => void
  onToggleActive: (row: T) => void
  onDelete?: (row: T) => void
  emptyTitle?: string
  emptyDescription?: string
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  totalCount: number
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
  } = props

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-medium text-foreground">{title}</h1>
          <p className="text-[12px] text-muted-foreground">
            {totalActive} {totalActive === 1 ? 'ativo' : 'ativos'}
          </p>
        </div>
        <Button onClick={onNew}>
          <Plus className="h-4 w-4" />
          {newButtonLabel}
        </Button>
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

      <div className="overflow-hidden rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c, i) => (
                <TableHead key={i} className={c.className}>{c.header}</TableHead>
              ))}
              <TableHead className={cn(onDelete ? 'w-[150px]' : 'w-[110px]')}>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    {columns.map((_c, ci) => (
                      <TableCell key={ci}><Skeleton className="h-4 w-3/4" /></TableCell>
                    ))}
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  </TableRow>
                ))}
              </>
            )}

            {!isLoading && rows && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="py-0">
                  <EmptyState
                    icon={Inbox}
                    title={emptyTitle}
                    description={emptyDescription}
                  />
                </TableCell>
              </TableRow>
            )}

            {!isLoading && rows?.map((row) => (
              <TableRow key={row.id} className={cn(!row.ativo && 'opacity-60')}>
                {columns.map((c, i) => (
                  <TableCell key={i} className={c.className}>
                    {i === 0 && !row.ativo && (
                      <Lock className="mr-1 inline h-3 w-3 text-destructive" />
                    )}
                    {c.accessor(row)}
                  </TableCell>
                ))}
                <TableCell>
                  <div className="flex items-center justify-start gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(row)}
                      aria-label={`Editar ${rowLabel?.(row) ?? ''}`}
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onToggleActive(row)}
                      aria-label={row.ativo ? 'Desativar' : 'Reativar'}
                      title={row.ativo ? 'Desativar' : 'Reativar'}
                    >
                      <Power className={cn('h-4 w-4', row.ativo ? 'text-foreground' : 'text-success')} />
                    </Button>
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
    </div>
  )
}

export function useCrudListState(initialPageSize = 20) {
  const [search, setSearch] = React.useState('')
  const [showInactive, setShowInactive] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const debouncedSearch = useDebounce(search, 300)

  React.useEffect(() => {
    setPage(1)
  }, [debouncedSearch, showInactive])

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
