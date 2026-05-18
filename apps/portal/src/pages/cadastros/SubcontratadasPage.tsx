import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { isValidCnpj, isValidTelefone } from '@sislog/shared/validators'
import { formatCnpj, formatTelefone } from '@/lib/utils'
import type { Tables } from '@sislog/shared/types'

type Row = Tables<'parceiro_subcontratadas'>

const schema = z.object({
  razao_social: z.string().min(2, 'Informe a razão social'),
  cnpj: z.string().optional().refine((v) => !v || isValidCnpj(v), 'CNPJ inválido'),
  contato_nome: z.string().optional(),
  contato_telefone: z
    .string()
    .optional()
    .refine((v) => !v || isValidTelefone(v), 'Telefone inválido'),
})
type FormValues = z.infer<typeof schema>

export default function SubcontratadasPage() {
  const { parceiro } = useAuth()
  const parceiroId = parceiro?.id ?? null
  const state = useCrudListState()
  const list = useParceiroCrudList('parceiro_subcontratadas', {
    search: state.debouncedSearch,
    showInactive: state.showInactive,
    page: state.page,
    pageSize: state.pageSize,
    searchColumns: ['razao_social', 'cnpj'],
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
    { header: 'Razão social', accessor: (r) => r.razao_social },
    { header: 'CNPJ', accessor: (r) => r.cnpj ?? '—', className: 'text-muted-foreground' },
    { header: 'Contato', accessor: (r) => r.contato_nome ?? '—' },
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
        searchPlaceholder="Buscar por razão social ou CNPJ"
        showInactive={state.showInactive}
        onShowInactiveChange={state.setShowInactive}
        columns={columns}
        rowLabel={(r) => r.razao_social}
        onEdit={(r) => { setEditing(r); setOpen(true) }}
        onToggleActive={(r) => setConfirmRow(r)}
        onDelete={(r) => setDeleteRow(r)}
        emptyTitle="Nenhuma subcontratada cadastrada"
        emptyDescription="Cadastre as empresas que subcontratam serviços para a sua transportadora."
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
              cnpj: values.cnpj ? formatCnpj(values.cnpj) : null,
              contato_nome: values.contato_nome?.trim() || null,
              contato_telefone: values.contato_telefone
                ? formatTelefone(values.contato_telefone)
                : null,
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
            ? `O cadastro de "${deleteRow.razao_social}" será removido permanentemente. Se houver motoristas ou veículos vinculados, a exclusão será bloqueada.`
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
    register, handleSubmit, reset, setValue, watch,
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
              Empresas que subcontratam serviços para a sua transportadora.
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
            <div className="space-y-1.5">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                value={cnpj}
                onChange={(e) => setValue('cnpj', formatCnpj(e.target.value), { shouldValidate: true })}
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
              />
              {errors.cnpj && <p className="text-[11px] text-destructive">{errors.cnpj.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contato_nome">Contato</Label>
                <Input id="contato_nome" {...register('contato_nome')} placeholder="Nome do responsável" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contato_telefone">Telefone do contato</Label>
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
          </DialogBody>
          <DialogFooter>
            <span className="text-[11px] text-muted-foreground/80">Enter para salvar · Esc para cancelar</span>
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
