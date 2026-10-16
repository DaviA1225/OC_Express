import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CrudListPage, useCrudListState, type ColumnDef } from '@/components/shared/CrudListPage'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import {
  useParceiroCrudList,
  useParceiroActiveCount,
  useUpsertParceiroRow,
  useToggleParceiroActive,
  useDeleteParceiroRow,
} from '@/features/cadastros/useParceiroCrud'
import { useAuth } from '@/hooks/useAuth'
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isValidDocumento, tipoPessoa } from '@sislog/shared/validators'
import { formatDocumento } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Tables } from '@sislog/shared/types'
import { Spinner } from '@/components/shared/Spinner'
import { CadastroField } from '@/components/forms/CadastroField'
import { useDescartarAlteracoes } from '@/features/cadastros/useDescartarAlteracoes'

type Row = Tables<'parceiro_subcontratadas'>

const schema = z.object({
  razao_social: z.string().min(2, 'Informe a razão social ou nome'),
  documento: z
    .string()
    .min(1, 'Informe o CPF ou CNPJ')
    .refine(isValidDocumento, 'CPF ou CNPJ inválido'),
})
type FormValues = z.infer<typeof schema>

function TipoBadge({ tipo }: { tipo: 'PF' | 'PJ' | null }) {
  if (!tipo) return <span className="text-body-sm text-muted-foreground">—</span>
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[2px] border px-1.5 py-0.5 text-meta font-medium',
        tipo === 'PJ' ? 'cat-ink' : 'cat-brass',
      )}
    >
      {tipo}
    </span>
  )
}

export default function SubcontratadasPage() {
  const { parceiro } = useAuth()
  const parceiroId = parceiro?.id ?? null
  const state = useCrudListState()
  const list = useParceiroCrudList('parceiro_subcontratadas', {
    search: state.debouncedSearch,
    showInactive: state.showInactive,
    page: state.page,
    pageSize: state.pageSize,
    searchColumns: ['razao_social', 'documento'],
    orderBy: 'razao_social',
    ascending: true,
  })
  const totalActive = useParceiroActiveCount('parceiro_subcontratadas')
  const upsert = useUpsertParceiroRow('parceiro_subcontratadas', 'Subcontratada', parceiroId)
  const toggle = useToggleParceiroActive('parceiro_subcontratadas', 'Subcontratada')
  const remove = useDeleteParceiroRow('parceiro_subcontratadas', 'Subcontratada')

  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)
  const [deleteRow, setDeleteRow] = React.useState<Row | null>(null)

  const columns: ColumnDef<Row>[] = [
    { header: 'Razão Social / Nome', accessor: (r) => r.razao_social },
    { header: 'Tipo', accessor: (r) => <TipoBadge tipo={r.tipo_pessoa} /> },
    { header: 'CPF / CNPJ', accessor: (r) => r.documento ?? '—', className: 'text-muted-foreground' },
  ]

  return (
    <>
      <CrudListPage<Row>
        title="Subcontratadas"
        newButtonLabel="Nova subcontratada"
        onNew={() => { setEditing(null); setOpen(true) }}
        rows={list.data?.data}
        isLoading={list.isLoading}
        totalActive={totalActive.data ?? 0}
        searchValue={state.search}
        onSearchChange={state.setSearch}
        searchPlaceholder="Buscar por nome, razão social, CPF ou CNPJ"
        showInactive={state.showInactive}
        onShowInactiveChange={state.setShowInactive}
        columns={columns}
        rowLabel={(r) => r.razao_social}
        onEdit={(r) => { setEditing(r); setOpen(true) }}
        onToggleActive={(r) => setConfirmRow(r)}
        onDelete={(r) => setDeleteRow(r)}
        emptyTitle="Nenhuma subcontratada cadastrada"
        emptyDescription="Cadastre as transportadoras (PJ) ou autônomos (PF) que atuam para a sua empresa."
        page={state.page}
        pageSize={state.pageSize}
        totalCount={list.data?.count ?? 0}
        onPageChange={state.setPage}
      />

      <SubcontratadaForm
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSubmit={async (values) => {
          await upsert.mutateAsync({
            id: editing?.id,
            values: {
              razao_social: values.razao_social.trim(),
              documento: formatDocumento(values.documento),
              tipo_pessoa: tipoPessoa(values.documento),
            },
          })
          setOpen(false)
        }}
      />

      <ConfirmDialog
        open={!!confirmRow}
        onOpenChange={(o) => !o && setConfirmRow(null)}
        title={confirmRow?.ativo ? 'Desativar subcontratada?' : 'Reativar subcontratada?'}
        description={confirmRow?.ativo
          ? 'A subcontratada não aparecerá nas listas ativas. É possível reativá-la depois.'
          : 'A subcontratada voltará a aparecer nas listas ativas.'}
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
        title="Excluir subcontratada?"
        description={
          deleteRow
            ? `O cadastro de "${deleteRow.razao_social}" será removido permanentemente. Se houver motoristas, veículos ou carretas vinculados, a exclusão será bloqueada.`
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

function SubcontratadaForm({ open, onOpenChange, editing, onSubmit }: FormProps) {
  const {
    register, handleSubmit, reset, setValue, watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (open) {
      reset({
        razao_social: editing?.razao_social ?? '',
        documento: editing?.documento ?? '',
      })
    }
  }, [open, editing, reset])

  const documento = watch('documento') ?? ''
  const tipoAtual = tipoPessoa(documento)

  const guarda = useDescartarAlteracoes(isDirty, onOpenChange, isSubmitting)

  return (
    <>
      <Dialog open={open} onOpenChange={guarda.onOpenChange}>
        <DialogContent>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar subcontratada' : 'Nova subcontratada'}</DialogTitle>
              <DialogDescription>
                Cadastre transportadoras (PJ) ou autônomos (PF). O tipo é detectado automaticamente pelo documento.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <CadastroField label="Razão social ou nome" required id="razao_social" error={errors.razao_social?.message}>
                <Input autoFocus {...register('razao_social')} />
              </CadastroField>

              <CadastroField
                label="CPF ou CNPJ"
                required
                id="documento"
                error={errors.documento?.message}
                hint={tipoAtual ? <>Tipo detectado: <TipoBadge tipo={tipoAtual} /></> : undefined}
              >
                <Input
                  value={documento}
                  onChange={(e) => setValue('documento', formatDocumento(e.target.value), { shouldValidate: true, shouldDirty: true })}
                  placeholder="CPF ou CNPJ"
                  inputMode="numeric"
                />
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
