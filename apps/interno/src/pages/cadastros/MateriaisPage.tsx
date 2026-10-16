import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Spinner } from '@/components/shared/Spinner'
import { CrudListPage, RotuloSituacao, useCrudListState, type ColumnDef } from '@/components/shared/CrudListPage'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useCrudList, useActiveCount, useUpsertRow, useToggleActive, useDeleteRow, useBulkToggleActive, useBulkDeleteRows } from '@/features/crud/useCrudQueries'
import { useAuth } from '@/hooks/useAuth'
import { canEditMateriais, canUseBulkActions } from '@/features/auth/permissions'
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
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { isValidCnpj } from '@/lib/validators'
import { formatCnpj } from '@/lib/utils'
import type { Tables } from '@/types/database.types'
import { CadastroField } from '@/components/forms/CadastroField'
import { useDescartarAlteracoes } from '@/features/crud/useDescartarAlteracoes'

type Row = Tables<'materiais'>

const schema = z.object({
  nome: z.string().min(1, 'Informe o nome'),
  cnpj_filial: z.string().refine(isValidCnpj, 'CNPJ inválido'),
  filial: z.string().min(2, 'Informe a filial'),
  origem_padrao: z.string().optional(),
  destino_padrao: z.string().optional(),
  observacoes_padrao: z.string().optional(),
  requer_instrucao: z.boolean(),
})
type FormValues = z.infer<typeof schema>

export default function MateriaisPage() {
  const { profile } = useAuth()
  const canEdit = canEditMateriais(profile)
  const canBulk = canUseBulkActions(profile)
  const state = useCrudListState()
  const list = useCrudList('materiais', {
    search: state.debouncedSearch,
    showInactive: state.showInactive,
    page: state.page,
    pageSize: state.pageSize,
    searchColumns: ['nome', 'filial', 'origem_padrao', 'destino_padrao'],
    orderBy: 'nome',
    ascending: true,
  })
  const totalActive = useActiveCount('materiais')
  const upsert = useUpsertRow('materiais', { singular: 'Material', plural: 'Materiais', genero: 'm' })
  const toggle = useToggleActive('materiais', { singular: 'Material', plural: 'Materiais', genero: 'm' })
  const remove = useDeleteRow('materiais', { singular: 'Material', plural: 'Materiais', genero: 'm' })
  const bulkToggle = useBulkToggleActive('materiais', { singular: 'Material', plural: 'Materiais', genero: 'm' })
  const bulkDelete = useBulkDeleteRows('materiais', { singular: 'Material', plural: 'Materiais', genero: 'm' })

  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)
  const [deleteRow, setDeleteRow] = React.useState<Row | null>(null)

  const columns: ColumnDef<Row>[] = [
    { header: 'Nome', accessor: (r) => r.nome },
    { header: 'Filial', accessor: (r) => r.filial, className: 'text-muted-foreground' },
    { header: 'Origem padrão', accessor: (r) => r.origem_padrao ?? '—', className: 'text-muted-foreground' },
    { header: 'Destino padrão', accessor: (r) => r.destino_padrao ?? '—', className: 'text-muted-foreground' },
    {
      header: 'Instrução',
      accessor: (r) => (
        <span title={r.requer_instrucao ? 'Exige nº de instrução antes de gerar a OC' : 'Não exige instrução, gera OC direto'}>
          <RotuloSituacao tom={r.requer_instrucao ? 'aviso' : 'neutro'}>
            {r.requer_instrucao ? 'Exige' : 'Dispensa'}
          </RotuloSituacao>
        </span>
      ),
    },
  ]

  return (
    <>
      <CrudListPage<Row>
        title="Materiais"
        newButtonLabel={canEdit ? 'Novo material' : undefined}
        onNew={canEdit ? () => { setEditing(null); setOpen(true) } : undefined}
        rows={list.data?.data}
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={() => { void list.refetch() }}
        totalActive={totalActive.data ?? 0}
        searchValue={state.search}
        onSearchChange={state.setSearch}
        searchPlaceholder="Buscar por nome, filial, origem ou destino"
        showInactive={state.showInactive}
        onShowInactiveChange={state.setShowInactive}
        columns={columns}
        rowLabel={(r) => r.nome}
        onEdit={canEdit ? (r) => { setEditing(r); setOpen(true) } : undefined}
        onToggleActive={canEdit ? (r) => setConfirmRow(r) : undefined}
        onDelete={canEdit ? (r) => setDeleteRow(r) : undefined}
        onBulkToggleActive={canBulk ? async (ids, ativo) => { await bulkToggle.mutateAsync({ ids, ativo }) } : undefined}
        onBulkDelete={canBulk ? async (ids) => { await bulkDelete.mutateAsync({ ids }) } : undefined}
        emptyTitle="Nenhum material cadastrado"
        emptyDescription="Cadastre os materiais transportados (minério, pedra etc.)."
        page={state.page}
        pageSize={state.pageSize}
        totalCount={list.data?.count ?? 0}
        onPageChange={state.setPage}
      />

      <MaterialForm
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSubmit={async (values) => {
          await upsert.mutateAsync({
            id: editing?.id,
            values: {
              nome: values.nome.trim(),
              cnpj_filial: formatCnpj(values.cnpj_filial),
              filial: values.filial.trim(),
              origem_padrao: values.origem_padrao || null,
              destino_padrao: values.destino_padrao || null,
              observacoes_padrao: values.observacoes_padrao || null,
              requer_instrucao: values.requer_instrucao,
            },
          })
          setOpen(false)
        }}
      />

      <ConfirmDialog
        open={!!confirmRow}
        onOpenChange={(o) => !o && setConfirmRow(null)}
        title={confirmRow?.ativo ? 'Desativar material?' : 'Reativar material?'}
        description={confirmRow?.ativo
          ? 'O material não aparecerá nas listas ativas. É possível reativá-lo depois.'
          : 'O material voltará a aparecer nas listas ativas.'}
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
        title="Excluir material?"
        description={
          deleteRow
            ? `O cadastro de "${deleteRow.nome}" será removido permanentemente. Essa ação não pode ser desfeita. Se houver solicitações vinculadas, a exclusão será bloqueada.`
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
  onSubmit: (values: FormValues) => Promise<void>
}

function MaterialForm({ open, onOpenChange, editing, onSubmit }: FormProps) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (open) {
      reset({
        nome: editing?.nome ?? '',
        cnpj_filial: editing?.cnpj_filial ?? '',
        filial: editing?.filial ?? '',
        origem_padrao: editing?.origem_padrao ?? '',
        destino_padrao: editing?.destino_padrao ?? '',
        observacoes_padrao: editing?.observacoes_padrao ?? '',
        requer_instrucao: editing?.requer_instrucao ?? true,
      })
    }
  }, [open, editing, reset])

  const cnpj = watch('cnpj_filial') ?? ''
  const obs = watch('observacoes_padrao') ?? ''
  const requerInstrucao = watch('requer_instrucao')

  const guarda = useDescartarAlteracoes(isDirty, onOpenChange, isSubmitting)

  return (
    <>
    <Dialog open={open} onOpenChange={guarda.onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar material' : 'Novo material'}</DialogTitle>
            <DialogDescription>
              As observações padrão aparecem na OC.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-[1.4fr_1fr] gap-3">
              <CadastroField label="Nome" required id="nome" error={errors.nome?.message}>
                <Input autoFocus {...register('nome')} placeholder="MINÉRIO, PEDRA, AREIA…" />
              </CadastroField>
              <CadastroField label="CNPJ da filial" required id="cnpj_filial" error={errors.cnpj_filial?.message}>
                <Input
                  value={cnpj}
                  onChange={(e) => setValue('cnpj_filial', formatCnpj(e.target.value), { shouldValidate: true, shouldDirty: true })}
                  placeholder="00.000.000/0000-00"
                />
              </CadastroField>
            </div>

            <CadastroField label="Filial" required id="filial" error={errors.filial?.message}>
              <Input {...register('filial')} placeholder="MIRANDA - MS" />
            </CadastroField>

            <div className="grid grid-cols-2 gap-3">
              <CadastroField label="Origem padrão" id="origem_padrao">
                <Input {...register('origem_padrao')} placeholder="TERENOS - MS" />
              </CadastroField>
              <CadastroField label="Destino padrão" id="destino_padrao">
                <Input {...register('destino_padrao')} placeholder="CORUMBÁ - MS" />
              </CadastroField>
            </div>

            <div className="space-y-1.5">
              <CadastroField label="Observações padrão" id="observacoes_padrao">
                <Textarea
                  rows={3}
                  {...register('observacoes_padrao')}
                  placeholder="1° Obrigatório: Uso de EPIs (capacete, calça, colete e botina). Caçambas limpas."
                />
              </CadastroField>
              {obs.trim() && (
                <div className="rounded-md border bg-muted px-3 py-2">
                  <p className="mb-1 text-meta text-muted-foreground">
                    Pré-visualização no PDF
                  </p>
                  <pre className="whitespace-pre-wrap font-mono text-meta text-foreground">
                    {obs}
                  </pre>
                </div>
              )}
            </div>

            <div className="rounded-md border px-3 py-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <Checkbox
                  checked={!!requerInstrucao}
                  onCheckedChange={(v) => setValue('requer_instrucao', v === true, { shouldValidate: true, shouldDirty: true })}
                  className="mt-0.5"
                />
                <span className="space-y-0.5">
                  <span className="block text-body font-medium leading-none">
                    Exige nº de instrução para gerar a OC
                  </span>
                  <span className="block text-body-sm text-muted-foreground">
                    Marque se a OC desse material precisa de instrução ou número de pedido.
                  </span>
                </span>
              </label>
            </div>
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
