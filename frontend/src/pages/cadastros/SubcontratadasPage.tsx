import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { CrudListPage, useCrudListState, type ColumnDef } from '@/components/shared/CrudListPage'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useCrudList, useActiveCount, useUpsertRow, useToggleActive } from '@/features/crud/useCrudQueries'
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
import { isValidCnpj, isValidTelefone } from '@/lib/validators'
import { formatCnpj, formatTelefone } from '@/lib/utils'
import type { Tables } from '@/types/database.types'

type Row = Tables<'subcontratadas'>

const schema = z.object({
  razao_social: z.string().min(2, 'Informe a razão social'),
  cnpj: z
    .string()
    .optional()
    .refine((v) => !v || isValidCnpj(v), 'CNPJ inválido'),
  contato_nome: z.string().optional(),
  contato_telefone: z
    .string()
    .optional()
    .refine((v) => !v || isValidTelefone(v), 'Telefone inválido'),
})
type FormValues = z.infer<typeof schema>

export default function SubcontratadasPage() {
  const state = useCrudListState()
  const list = useCrudList('subcontratadas', {
    search: state.debouncedSearch,
    showInactive: state.showInactive,
    page: state.page,
    pageSize: state.pageSize,
    searchColumns: ['razao_social', 'cnpj', 'contato_nome'],
    orderBy: 'razao_social',
    ascending: true,
  })
  const totalActive = useActiveCount('subcontratadas')
  const upsert = useUpsertRow('subcontratadas', 'Subcontratada')
  const toggle = useToggleActive('subcontratadas', 'Subcontratada')

  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)

  const columns: ColumnDef<Row>[] = [
    { header: 'Razão Social', accessor: (r) => r.razao_social },
    { header: 'CNPJ', accessor: (r) => r.cnpj ?? '—', className: 'text-muted-foreground' },
    { header: 'Contato', accessor: (r) => r.contato_nome ?? '—' },
    { header: 'Telefone', accessor: (r) => r.contato_telefone ?? '—' },
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
        searchPlaceholder="Buscar por razão social, CNPJ ou contato"
        showInactive={state.showInactive}
        onShowInactiveChange={state.setShowInactive}
        columns={columns}
        rowLabel={(r) => r.razao_social}
        onEdit={(r) => { setEditing(r); setOpen(true) }}
        onToggleActive={(r) => setConfirmRow(r)}
        emptyTitle="Nenhuma subcontratada cadastrada"
        emptyDescription="Cadastre as transportadoras que atuam para você."
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
              razao_social: values.razao_social,
              cnpj: values.cnpj ? formatCnpj(values.cnpj) : null,
              contato_nome: values.contato_nome || null,
              contato_telefone: values.contato_telefone ? formatTelefone(values.contato_telefone) : null,
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
        cnpj: editing?.cnpj ?? '',
        contato_nome: editing?.contato_nome ?? '',
        contato_telefone: editing?.contato_telefone ?? '',
      })
    }
  }, [open, editing, reset])

  const cnpj = watch('cnpj') ?? ''
  const tel = watch('contato_telefone') ?? ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar subcontratada' : 'Nova subcontratada'}</DialogTitle>
            <DialogDescription>
              Cadastre transportadoras que atuam como subcontratadas.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="razao_social">Razão social *</Label>
              <Input id="razao_social" autoFocus {...register('razao_social')} />
              {errors.razao_social && (
                <p className="text-[11px] text-destructive">{errors.razao_social.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input
                  id="cnpj"
                  value={cnpj}
                  onChange={(e) => setValue('cnpj', formatCnpj(e.target.value), { shouldValidate: true })}
                  placeholder="00.000.000/0000-00"
                />
                {errors.cnpj && (
                  <p className="text-[11px] text-destructive">{errors.cnpj.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contato_telefone">Telefone</Label>
                <Input
                  id="contato_telefone"
                  value={tel}
                  onChange={(e) => setValue('contato_telefone', formatTelefone(e.target.value), { shouldValidate: true })}
                  placeholder="(00) 00000-0000"
                />
                {errors.contato_telefone && (
                  <p className="text-[11px] text-destructive">{errors.contato_telefone.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contato_nome">Pessoa de contato</Label>
              <Input id="contato_nome" {...register('contato_nome')} />
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
