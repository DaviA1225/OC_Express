import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { CrudListPage, useCrudListState, type ColumnDef } from '@/components/shared/CrudListPage'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Combobox, type ComboboxOption } from '@/components/shared/Combobox'
import {
  useCrudList,
  useActiveCount,
  useUpsertRow,
  useToggleActive,
  useDeleteRow,
  useBulkToggleActive,
  useBulkDeleteRows,
} from '@/features/crud/useCrudQueries'
import { useCrudOptions } from '@/features/crud/useCrudOptions'
import { useAuth } from '@/hooks/useAuth'
import { canEditCargasRetorno, canUseBulkActions } from '@/features/auth/permissions'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Tables } from '@/types/database.types'

type Row = Tables<'cargas_retorno'>
type ClienteOpt = Pick<Tables<'clientes'>, 'id' | 'razao_social' | 'cidade' | 'uf'>

const schema = z.object({
  cliente_id: z.string().min(1, 'Selecione um cliente'),
  local_carregamento: z.string().min(1, 'Informe o local de carregamento'),
  observacoes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export default function CargasRetornoPage() {
  const { profile } = useAuth()
  const canEdit = canEditCargasRetorno(profile)
  const canBulk = canUseBulkActions(profile)
  const state = useCrudListState()
  const list = useCrudList('cargas_retorno', {
    search: state.debouncedSearch,
    showInactive: state.showInactive,
    page: state.page,
    pageSize: state.pageSize,
    searchColumns: ['local_carregamento', 'observacoes'],
    orderBy: 'local_carregamento',
    ascending: true,
  })
  const totalActive = useActiveCount('cargas_retorno')
  const upsert = useUpsertRow('cargas_retorno', 'Carga de retorno')
  const toggle = useToggleActive('cargas_retorno', 'Carga de retorno')
  const remove = useDeleteRow('cargas_retorno', 'Carga de retorno')
  const bulkToggle = useBulkToggleActive('cargas_retorno', 'Carga de retorno')
  const bulkDelete = useBulkDeleteRows('cargas_retorno', 'Carga de retorno')

  const clientes = useCrudOptions<ClienteOpt>({
    table: 'clientes',
    selectColumns: 'id, razao_social, cidade, uf',
    orderBy: 'razao_social',
    equals: { cliente_retorno: true },
  })

  const clienteById = React.useMemo(() => {
    const map = new Map<string, ClienteOpt>()
    for (const c of clientes.data ?? []) map.set(c.id, c)
    return map
  }, [clientes.data])

  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)
  const [deleteRow, setDeleteRow] = React.useState<Row | null>(null)

  const columns: ColumnDef<Row>[] = [
    {
      header: 'Cliente',
      accessor: (r) => clienteById.get(r.cliente_id)?.razao_social ?? '—',
    },
    {
      header: 'Local de carregamento',
      accessor: (r) => r.local_carregamento,
    },
    {
      header: 'Cidade/UF',
      accessor: (r) => {
        const c = clienteById.get(r.cliente_id)
        const cidade = c?.cidade ?? ''
        const uf = c?.uf ?? ''
        const txt = [cidade, uf].filter(Boolean).join('/')
        return txt || '—'
      },
      className: 'text-muted-foreground',
    },
    {
      header: 'Observações',
      accessor: (r) => (
        <span className="line-clamp-1 max-w-[280px]" title={r.observacoes ?? ''}>
          {r.observacoes ?? '—'}
        </span>
      ),
      className: 'text-muted-foreground',
    },
  ]

  return (
    <>
      <CrudListPage<Row>
        title="Cargas de Retorno"
        newButtonLabel={canEdit ? 'Nova carga de retorno' : undefined}
        onNew={canEdit ? () => { setEditing(null); setOpen(true) } : undefined}
        rows={list.data?.data}
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={() => { void list.refetch() }}
        totalActive={totalActive.data ?? 0}
        searchValue={state.search}
        onSearchChange={state.setSearch}
        searchPlaceholder="Buscar por local ou observação"
        showInactive={state.showInactive}
        onShowInactiveChange={state.setShowInactive}
        columns={columns}
        rowLabel={(r) => `${clienteById.get(r.cliente_id)?.razao_social ?? 'Cliente'} — ${r.local_carregamento}`}
        onEdit={canEdit ? (r) => { setEditing(r); setOpen(true) } : undefined}
        onToggleActive={canEdit ? (r) => setConfirmRow(r) : undefined}
        onDelete={canEdit ? (r) => setDeleteRow(r) : undefined}
        onBulkToggleActive={canBulk ? async (ids, ativo) => { await bulkToggle.mutateAsync({ ids, ativo }) } : undefined}
        onBulkDelete={canBulk ? async (ids) => { await bulkDelete.mutateAsync({ ids }) } : undefined}
        emptyTitle="Nenhuma carga de retorno cadastrada"
        emptyDescription="Cadastre pares cliente + local de carregamento que serão usados em solicitações tipo retorno."
        page={state.page}
        pageSize={state.pageSize}
        totalCount={list.data?.count ?? 0}
        onPageChange={state.setPage}
      />

      <CargaRetornoForm
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        clienteOptions={clientes.data ?? []}
        clientesLoading={clientes.isLoading}
        onSubmit={async (values) => {
          await upsert.mutateAsync({
            id: editing?.id,
            values: {
              cliente_id: values.cliente_id,
              local_carregamento: values.local_carregamento.trim(),
              observacoes: values.observacoes?.trim() ? values.observacoes.trim() : null,
            },
          })
          setOpen(false)
        }}
      />

      <ConfirmDialog
        open={!!confirmRow}
        onOpenChange={(o) => !o && setConfirmRow(null)}
        title={confirmRow?.ativo ? 'Desativar carga de retorno?' : 'Reativar carga de retorno?'}
        description={confirmRow?.ativo
          ? 'A carga não aparecerá mais nas opções de novas solicitações de retorno. Você pode reativá-la depois.'
          : 'A carga voltará a aparecer nas opções de novas solicitações de retorno.'}
        confirmLabel={confirmRow?.ativo ? 'Sim, desativar' : 'Sim, reativar'}
        destructive={confirmRow?.ativo}
        onConfirm={async () => {
          if (confirmRow) {
            await toggle.mutateAsync({ id: confirmRow.id, ativo: !confirmRow.ativo })
            setConfirmRow(null)
          }
        }}
      />

      <ConfirmDialog
        open={!!deleteRow}
        onOpenChange={(o) => !o && setDeleteRow(null)}
        title="Excluir carga de retorno?"
        description={
          deleteRow
            ? `O cadastro de "${deleteRow.local_carregamento}" será removido permanentemente. Essa ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Sim, excluir"
        destructive
        onConfirm={async () => {
          if (deleteRow) {
            await remove.mutateAsync({ id: deleteRow.id })
            setDeleteRow(null)
          }
        }}
      />
    </>
  )
}

interface FormProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: Row | null
  clienteOptions: ClienteOpt[]
  clientesLoading: boolean
  onSubmit: (values: FormValues) => Promise<void>
}

function CargaRetornoForm({ open, onOpenChange, editing, clienteOptions, clientesLoading, onSubmit }: FormProps) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (open) {
      reset({
        cliente_id: editing?.cliente_id ?? '',
        local_carregamento: editing?.local_carregamento ?? '',
        observacoes: editing?.observacoes ?? '',
      })
    }
  }, [open, editing, reset])

  const clienteId = watch('cliente_id') ?? ''

  const cliOpts: ComboboxOption[] = clienteOptions.map((c) => ({
    value: c.id,
    label: c.razao_social,
    hint: [c.cidade, c.uf].filter(Boolean).join('/') || undefined,
  }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar carga de retorno' : 'Nova carga de retorno'}</DialogTitle>
            <DialogDescription>
              Pares de cliente + local que serão sugeridos ao criar solicitações tipo retorno.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cliente_id">Cliente *</Label>
              <Combobox
                options={cliOpts}
                value={clienteId || null}
                onChange={(v) => setValue('cliente_id', v ?? '', { shouldValidate: true })}
                placeholder="Selecionar cliente"
                searchPlaceholder="Buscar cliente…"
                emptyMessage="Nenhum cliente encontrado."
                loading={clientesLoading}
                allowClear={false}
              />
              {errors.cliente_id && (
                <p className="text-[11px] text-destructive">{errors.cliente_id.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="local_carregamento">Local de carregamento *</Label>
              <Input
                id="local_carregamento"
                {...register('local_carregamento')}
                placeholder="Ex.: Pátio do cliente, Filial Corumbá…"
              />
              {errors.local_carregamento && (
                <p className="text-[11px] text-destructive">{errors.local_carregamento.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                rows={3}
                {...register('observacoes')}
                placeholder="Detalhes do horário, contato no local, restrições…"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <span className="text-[11px] text-muted-foreground/80">
              Enter para salvar · Esc para cancelar
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
