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
import { Textarea } from '@/components/ui/textarea'
import { isValidCpf, isValidTelefone } from '@/lib/validators'
import { formatCpf, formatTelefone } from '@/lib/utils'
import type { Tables } from '@/types/database.types'

type Row = Tables<'motoristas'>

const schema = z.object({
  nome_completo: z.string().min(2, 'Informe o nome completo'),
  cpf: z.string().refine(isValidCpf, 'CPF inválido'),
  telefone: z
    .string()
    .optional()
    .refine((v) => !v || isValidTelefone(v), 'Telefone inválido'),
  observacoes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export default function MotoristasPage() {
  const state = useCrudListState()
  const list = useCrudList('motoristas', {
    search: state.debouncedSearch,
    showInactive: state.showInactive,
    page: state.page,
    pageSize: state.pageSize,
    searchColumns: ['nome_completo', 'cpf'],
    orderBy: 'nome_completo',
    ascending: true,
  })
  const totalActive = useActiveCount('motoristas')
  const upsert = useUpsertRow('motoristas', 'Motorista')
  const toggle = useToggleActive('motoristas', 'Motorista')
  const remove = useDeleteRow('motoristas', 'Motorista')

  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)
  const [deleteRow, setDeleteRow] = React.useState<Row | null>(null)

  const columns: ColumnDef<Row>[] = [
    { header: 'Nome', accessor: (r) => r.nome_completo },
    { header: 'CPF', accessor: (r) => r.cpf, className: 'text-muted-foreground' },
    { header: 'Telefone', accessor: (r) => r.telefone ?? '—' },
  ]

  return (
    <>
      <CrudListPage<Row>
        title="Motoristas"
        newButtonLabel="Novo motorista"
        onNew={() => { setEditing(null); setOpen(true) }}
        rows={list.data?.data}
        isLoading={list.isLoading}
        totalActive={totalActive.data ?? 0}
        searchValue={state.search}
        onSearchChange={state.setSearch}
        searchPlaceholder="Buscar por nome ou CPF"
        showInactive={state.showInactive}
        onShowInactiveChange={state.setShowInactive}
        columns={columns}
        rowLabel={(r) => r.nome_completo}
        onEdit={(r) => { setEditing(r); setOpen(true) }}
        onToggleActive={(r) => setConfirmRow(r)}
        onDelete={(r) => setDeleteRow(r)}
        emptyTitle="Nenhum motorista cadastrado"
        emptyDescription="Cadastre os motoristas que poderão ser indicados nas OCs."
        page={state.page}
        pageSize={state.pageSize}
        totalCount={list.data?.count ?? 0}
        onPageChange={state.setPage}
      />

      <MotoristaForm
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSubmit={async (values) => {
          await upsert.mutateAsync({
            id: editing?.id,
            values: {
              nome_completo: values.nome_completo,
              cpf: formatCpf(values.cpf),
              telefone: values.telefone ? formatTelefone(values.telefone) : null,
              observacoes: values.observacoes || null,
            },
          })
          setOpen(false)
        }}
      />

      <ConfirmDialog
        open={!!confirmRow}
        onOpenChange={(o) => !o && setConfirmRow(null)}
        title={confirmRow?.ativo ? 'Desativar motorista?' : 'Reativar motorista?'}
        description={confirmRow?.ativo
          ? 'O motorista não aparecerá nas listas ativas. Você pode reativá-lo depois.'
          : 'O motorista voltará a aparecer nas listas ativas.'}
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
        title="Excluir motorista?"
        description={
          deleteRow
            ? `O cadastro de "${deleteRow.nome_completo}" será removido permanentemente. Essa ação não pode ser desfeita. Se houver solicitações vinculadas, a exclusão será bloqueada.`
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

function MotoristaForm({ open, onOpenChange, editing, onSubmit }: FormProps) {
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
        nome_completo: editing?.nome_completo ?? '',
        cpf: editing?.cpf ?? '',
        telefone: editing?.telefone ?? '',
        observacoes: editing?.observacoes ?? '',
      })
    }
  }, [open, editing, reset])

  const cpf = watch('cpf') ?? ''
  const tel = watch('telefone') ?? ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar motorista' : 'Novo motorista'}</DialogTitle>
            <DialogDescription>
              Cadastre os motoristas que serão referenciados nas solicitações.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome_completo">Nome completo *</Label>
              <Input id="nome_completo" autoFocus {...register('nome_completo')} />
              {errors.nome_completo && (
                <p className="text-[11px] text-destructive">{errors.nome_completo.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cpf">CPF *</Label>
                <Input
                  id="cpf"
                  value={cpf}
                  onChange={(e) => setValue('cpf', formatCpf(e.target.value), { shouldValidate: true })}
                  placeholder="000.000.000-00"
                />
                {errors.cpf && (
                  <p className="text-[11px] text-destructive">{errors.cpf.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  value={tel}
                  onChange={(e) => setValue('telefone', formatTelefone(e.target.value), { shouldValidate: true })}
                  placeholder="(00) 00000-0000"
                />
                {errors.telefone && (
                  <p className="text-[11px] text-destructive">{errors.telefone.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea id="observacoes" rows={2} {...register('observacoes')} />
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
