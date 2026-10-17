import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Spinner } from '@/components/shared/Spinner'
import { CrudListPage, useCrudListState, type ColumnDef } from '@/components/shared/CrudListPage'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useCrudList, useActiveCount, useUpsertRow, useToggleActive, useDeleteRow, useBulkToggleActive, useBulkDeleteRows } from '@/features/crud/useCrudQueries'
import { useAuth } from '@/hooks/useAuth'
import { canEditCadastrosOperacionais, canUseBulkActions } from '@/features/auth/permissions'
import { useCrudOptions } from '@/features/crud/useCrudOptions'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Combobox, type ComboboxOption } from '@/components/shared/Combobox'
import { isValidPlaca } from '@/lib/validators'
import { formatPlaca } from '@/lib/utils'
import type { Tables } from '@/types/database.types'
import { CadastroField } from '@/components/forms/CadastroField'
import { useDescartarAlteracoes } from '@/features/crud/useDescartarAlteracoes'

type Row = Tables<'carretas'>
type Subcontratada = Pick<Tables<'subcontratadas'>, 'id' | 'razao_social'>

const TIPOS = [
  'Caçamba 3 Eixos',
  'Caçamba 4 Eixos',
  'Bi-Trem Caçamba',
  '8 Eixos Caçamba',
  'Rodo-Trem Caçamba',
  'Graneleiro LS 3 Eixos',
  'Graneleiro LS 4 Eixos',
  'Bi-Trem Graneleiro',
  '8 Eixos Graneleiro',
  'Rodo-Trem Graneleiro',
  'Dolly',
] as const

const schema = z.object({
  placa: z.string().refine(isValidPlaca, 'Placa inválida'),
  tipo: z.string().optional(),
  subcontratada_id: z.string().nullable().optional(),
  observacoes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export default function CarretasPage() {
  const { profile } = useAuth()
  const canEdit = canEditCadastrosOperacionais(profile)
  const canBulk = canUseBulkActions(profile)
  const state = useCrudListState()
  const list = useCrudList('carretas', {
    search: state.debouncedSearch,
    showInactive: state.showInactive,
    page: state.page,
    pageSize: state.pageSize,
    searchColumns: ['placa', 'tipo', 'observacoes'],
    orderBy: 'placa',
    ascending: true,
  })
  const totalActive = useActiveCount('carretas')
  const upsert = useUpsertRow('carretas', { singular: 'Carreta', plural: 'Carretas', genero: 'f' })
  const toggle = useToggleActive('carretas', { singular: 'Carreta', plural: 'Carretas', genero: 'f' })
  const remove = useDeleteRow('carretas', { singular: 'Carreta', plural: 'Carretas', genero: 'f' })
  const bulkToggle = useBulkToggleActive('carretas', { singular: 'Carreta', plural: 'Carretas', genero: 'f' })
  const bulkDelete = useBulkDeleteRows('carretas', { singular: 'Carreta', plural: 'Carretas', genero: 'f' })

  const subOptions = useCrudOptions<Subcontratada>({
    table: 'subcontratadas',
    selectColumns: 'id, razao_social',
    orderBy: 'razao_social',
  })

  const subById = React.useMemo(() => {
    const map = new Map<string, string>()
    subOptions.data?.forEach((s) => map.set(s.id, s.razao_social))
    return map
  }, [subOptions.data])

  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)
  const [deleteRow, setDeleteRow] = React.useState<Row | null>(null)

  const columns: ColumnDef<Row>[] = [
    { header: 'Placa', accessor: (r) => r.placa },
    { header: 'Tipo', accessor: (r) => r.tipo ?? '—', className: 'text-muted-foreground' },
    {
      header: 'Subcontratada',
      accessor: (r) => (r.subcontratada_id ? subById.get(r.subcontratada_id) ?? '—' : '—'),
      className: 'text-muted-foreground',
    },
    {
      header: 'Observações',
      accessor: (r) =>
        r.observacoes ? (
          <span className="block max-w-[280px] truncate" title={r.observacoes}>
            {r.observacoes}
          </span>
        ) : (
          '—'
        ),
      className: 'text-muted-foreground',
    },
  ]

  return (
    <>
      <CrudListPage<Row>
        title="Carretas"
        newButtonLabel={canEdit ? 'Nova carreta' : undefined}
        onNew={canEdit ? () => { setEditing(null); setOpen(true) } : undefined}
        rows={list.data?.data}
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={() => { void list.refetch() }}
        totalActive={totalActive.data ?? 0}
        searchValue={state.search}
        onSearchChange={state.setSearch}
        searchPlaceholder="Buscar por placa ou tipo"
        showInactive={state.showInactive}
        onShowInactiveChange={state.setShowInactive}
        columns={columns}
        rowLabel={(r) => r.placa}
        onEdit={canEdit ? (r) => { setEditing(r); setOpen(true) } : undefined}
        onToggleActive={canEdit ? (r) => setConfirmRow(r) : undefined}
        onDelete={canEdit ? (r) => setDeleteRow(r) : undefined}
        emptyTitle="Nenhuma carreta cadastrada"
        emptyDescription="Cadastre as carretas que poderão ser indicadas nas OCs."
        page={state.page}
        pageSize={state.pageSize}
        totalCount={list.data?.count ?? 0}
        onPageChange={state.setPage}
        onBulkToggleActive={canBulk ? async (ids, ativo) => { await bulkToggle.mutateAsync({ ids, ativo }) } : undefined}
        onBulkDelete={canBulk ? async (ids) => { await bulkDelete.mutateAsync({ ids }) } : undefined}
      />

      <CarretaForm
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        subOptions={subOptions.data ?? []}
        subLoading={subOptions.isLoading}
        onSubmit={async (values) => {
          await upsert.mutateAsync({
            id: editing?.id,
            values: {
              placa: formatPlaca(values.placa),
              tipo: values.tipo || null,
              subcontratada_id: values.subcontratada_id || null,
              observacoes: values.observacoes || null,
            },
          })
          setOpen(false)
        }}
      />

      <ConfirmDialog
        open={!!confirmRow}
        onOpenChange={(o) => !o && setConfirmRow(null)}
        title={confirmRow?.ativo ? 'Desativar carreta?' : 'Reativar carreta?'}
        description={confirmRow?.ativo
          ? 'A carreta não aparecerá nas listas ativas. É possível reativá-la depois.'
          : 'A carreta voltará a aparecer nas listas ativas.'}
        confirmLabel={confirmRow?.ativo ? 'Desativar' : 'Reativar'}
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
        title="Excluir carreta?"
        description={
          deleteRow
            ? `O cadastro da placa "${deleteRow.placa}" será removido permanentemente. Essa ação não pode ser desfeita. Se houver solicitações vinculadas, a exclusão será bloqueada.`
            : ''
        }
        confirmLabel="Excluir"
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
  subOptions: Subcontratada[]
  subLoading: boolean
  onSubmit: (values: FormValues) => Promise<void>
}

function CarretaForm({ open, onOpenChange, editing, subOptions, subLoading, onSubmit }: FormProps) {
  const {
    handleSubmit,
    reset,
    setValue,
    watch,
    register,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (open) {
      reset({
        placa: editing?.placa ?? '',
        tipo: editing?.tipo ?? '',
        subcontratada_id: editing?.subcontratada_id ?? null,
        observacoes: editing?.observacoes ?? '',
      })
    }
  }, [open, editing, reset])

  const placa = watch('placa') ?? ''
  const tipo = watch('tipo') ?? ''
  const subId = watch('subcontratada_id') ?? null

  const options: ComboboxOption[] = subOptions.map((s) => ({
    value: s.id,
    label: s.razao_social,
  }))

  const guarda = useDescartarAlteracoes(isDirty, onOpenChange, isSubmitting)

  return (
    <>
    <Dialog open={open} onOpenChange={guarda.onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar carreta' : 'Nova carreta'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <CadastroField label="Placa" required id="placa" error={errors.placa?.message}>
                <Input
                  autoFocus
                  value={placa}
                  onChange={(e) => setValue('placa', formatPlaca(e.target.value), { shouldValidate: true, shouldDirty: true })}
                  placeholder="ABC1D23"
                />
              </CadastroField>
              <CadastroField label="Tipo" id="carreta-tipo">
                {(a11y) => (
                <Select
                  value={tipo || undefined}
                  onValueChange={(v) => setValue('tipo', v, { shouldValidate: true, shouldDirty: true })}
                >
                  <SelectTrigger {...a11y}>
                    <SelectValue placeholder="Selecionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                )}
              </CadastroField>
            </div>

            <CadastroField label="Subcontratada" id="subcontratada_id" error={errors.subcontratada_id?.message}>
              <Combobox
                options={options}
                value={subId}
                onChange={(v) => setValue('subcontratada_id', v, { shouldValidate: true, shouldDirty: true })}
                placeholder="Selecionar subcontratada"
                searchPlaceholder="Buscar subcontratada"
                emptyMessage="Nenhuma subcontratada ativa."
                loading={subLoading}
              />
            </CadastroField>

            <CadastroField label="Observações" id="observacoes">
              <Textarea rows={2} {...register('observacoes')} />
            </CadastroField>
          </DialogBody>
          <DialogFooter className="justify-end">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => guarda.onOpenChange(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {guarda.dialog}
    </>
  )
}
