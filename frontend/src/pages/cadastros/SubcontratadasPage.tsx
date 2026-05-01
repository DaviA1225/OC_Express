import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { CrudListPage, useCrudListState, type ColumnDef } from '@/components/shared/CrudListPage'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useCrudList, useActiveCount, useUpsertRow, useToggleActive, useDeleteRow } from '@/features/crud/useCrudQueries'
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
import { isValidDocumento, tipoPessoa } from '@/lib/validators'
import { formatDocumento, cn } from '@/lib/utils'
import type { Tables } from '@/types/database.types'

type Row = Tables<'subcontratadas'>

const schema = z.object({
  razao_social: z.string().min(2, 'Informe a razão social ou nome'),
  documento: z
    .string()
    .min(1, 'Informe o CPF ou CNPJ')
    .refine(isValidDocumento, 'CPF ou CNPJ inválido'),
})
type FormValues = z.infer<typeof schema>

function TipoBadge({ tipo }: { tipo: 'PF' | 'PJ' | null }) {
  if (!tipo) return <span className="text-[12px] text-muted-foreground">—</span>
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium tracking-[0.5px]',
        tipo === 'PJ' ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800',
      )}
    >
      {tipo}
    </span>
  )
}

export default function SubcontratadasPage() {
  const state = useCrudListState()
  const list = useCrudList('subcontratadas', {
    search: state.debouncedSearch,
    showInactive: state.showInactive,
    page: state.page,
    pageSize: state.pageSize,
    searchColumns: ['razao_social', 'documento'],
    orderBy: 'razao_social',
    ascending: true,
  })
  const totalActive = useActiveCount('subcontratadas')
  const upsert = useUpsertRow('subcontratadas', 'Subcontratada')
  const toggle = useToggleActive('subcontratadas', 'Subcontratada')
  const remove = useDeleteRow('subcontratadas', 'Subcontratada')

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
        emptyDescription="Cadastre as transportadoras (PJ) ou autônomos (PF) que atuam para você."
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
          const docFormatado = formatDocumento(values.documento)
          await upsert.mutateAsync({
            id: editing?.id,
            values: {
              razao_social: values.razao_social,
              documento: docFormatado,
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
          ? 'A subcontratada não aparecerá nas listas ativas. Você pode reativá-la depois.'
          : 'A subcontratada voltará a aparecer nas listas ativas.'}
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
        title="Excluir subcontratada?"
        description={
          deleteRow
            ? `O cadastro de "${deleteRow.razao_social}" será removido permanentemente. Essa ação não pode ser desfeita. Se houver veículos, carretas ou solicitações vinculadas, a exclusão será bloqueada.`
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
  onSubmit: (values: FormValues) => Promise<void>
}

function SubcontratadaForm({ open, onOpenChange, editing, onSubmit }: FormProps) {
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
        razao_social: editing?.razao_social ?? '',
        documento: editing?.documento ?? '',
      })
    }
  }, [open, editing, reset])

  const documento = watch('documento') ?? ''
  const tipoAtual = tipoPessoa(documento)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar subcontratada' : 'Nova subcontratada'}</DialogTitle>
            <DialogDescription>
              Cadastre transportadoras (PJ) ou autônomos (PF). O tipo é detectado automaticamente pelo documento.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="razao_social">Razão social ou nome *</Label>
              <Input id="razao_social" autoFocus {...register('razao_social')} />
              {errors.razao_social && (
                <p className="text-[11px] text-destructive">{errors.razao_social.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="documento" className="flex items-center justify-between">
                <span>CPF ou CNPJ *</span>
                {tipoAtual && <TipoBadge tipo={tipoAtual} />}
              </Label>
              <Input
                id="documento"
                value={documento}
                onChange={(e) => setValue('documento', formatDocumento(e.target.value), { shouldValidate: true })}
                placeholder="CPF ou CNPJ"
                inputMode="numeric"
              />
              {errors.documento && (
                <p className="text-[11px] text-destructive">{errors.documento.message}</p>
              )}
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
