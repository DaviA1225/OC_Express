import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { CrudListPage, useCrudListState, type ColumnDef } from '@/components/shared/CrudListPage'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useCrudList, useActiveCount, useUpsertRow, useToggleActive, useDeleteRow, useBulkToggleActive, useBulkDeleteRows } from '@/features/crud/useCrudQueries'
import { useAuth } from '@/hooks/useAuth'
import { canEditParceiros, canUseBulkActions } from '@/features/auth/permissions'
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
import { isValidCnpj, isValidTelefone } from '@/lib/validators'
import { formatCnpj, formatTelefone } from '@/lib/utils'
import type { Tables } from '@/types/database.types'

type Row = Tables<'parceiros'>

// E-mail é opcional; quando informado, exige um formato plausível.
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const schema = z.object({
  razao_social: z.string().min(2, 'Informe a razão social'),
  cnpj: z.string().min(1, 'Informe o CNPJ').refine(isValidCnpj, 'CNPJ inválido'),
  codigo_interno: z.string().optional(),
  contato_principal_nome: z.string().optional(),
  contato_principal_telefone: z
    .string()
    .optional()
    .refine((v) => !v || isValidTelefone(v), 'Telefone inválido'),
  contato_principal_email: z
    .string()
    .optional()
    .refine((v) => !v || emailRe.test(v), 'E-mail inválido'),
  observacoes_internas: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export default function ParceirosPage() {
  const { profile } = useAuth()
  const canEdit = canEditParceiros(profile)
  const canBulk = canUseBulkActions(profile)
  const state = useCrudListState()
  const list = useCrudList('parceiros', {
    search: state.debouncedSearch,
    showInactive: state.showInactive,
    page: state.page,
    pageSize: state.pageSize,
    searchColumns: ['razao_social', 'cnpj', 'codigo_interno'],
    orderBy: 'razao_social',
    ascending: true,
  })
  const totalActive = useActiveCount('parceiros')
  const upsert = useUpsertRow('parceiros', 'Parceiro')
  const toggle = useToggleActive('parceiros', 'Parceiro')
  const remove = useDeleteRow('parceiros', 'Parceiro')
  const bulkToggle = useBulkToggleActive('parceiros', 'Parceiro')
  const bulkDelete = useBulkDeleteRows('parceiros', 'Parceiro')

  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)
  const [deleteRow, setDeleteRow] = React.useState<Row | null>(null)

  const columns: ColumnDef<Row>[] = [
    { header: 'Razão social', accessor: (r) => r.razao_social },
    { header: 'CNPJ', accessor: (r) => r.cnpj, className: 'text-muted-foreground' },
    { header: 'Código interno', accessor: (r) => r.codigo_interno ?? '—', className: 'text-muted-foreground' },
    { header: 'Contato', accessor: (r) => r.contato_principal_nome ?? '—' },
  ]

  return (
    <>
      <CrudListPage<Row>
        title="Parceiros"
        newButtonLabel={canEdit ? 'Novo parceiro' : undefined}
        onNew={canEdit ? () => { setEditing(null); setOpen(true) } : undefined}
        rows={list.data?.data}
        isLoading={list.isLoading}
        totalActive={totalActive.data ?? 0}
        searchValue={state.search}
        onSearchChange={state.setSearch}
        searchPlaceholder="Buscar por razão social, CNPJ ou código"
        showInactive={state.showInactive}
        onShowInactiveChange={state.setShowInactive}
        columns={columns}
        rowLabel={(r) => r.razao_social}
        onEdit={canEdit ? (r) => { setEditing(r); setOpen(true) } : undefined}
        onToggleActive={canEdit ? (r) => setConfirmRow(r) : undefined}
        onDelete={canEdit ? (r) => setDeleteRow(r) : undefined}
        emptyTitle="Nenhum parceiro cadastrado"
        emptyDescription="Cadastre as transportadoras parceiras que terão acesso ao portal externo."
        page={state.page}
        pageSize={state.pageSize}
        totalCount={list.data?.count ?? 0}
        onPageChange={state.setPage}
        onBulkToggleActive={canBulk ? async (ids, ativo) => { await bulkToggle.mutateAsync({ ids, ativo }) } : undefined}
        onBulkDelete={canBulk ? async (ids) => { await bulkDelete.mutateAsync({ ids }) } : undefined}
      />

      <ParceiroForm
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSubmit={async (values) => {
          await upsert.mutateAsync({
            id: editing?.id,
            values: {
              razao_social: values.razao_social.trim(),
              cnpj: formatCnpj(values.cnpj),
              codigo_interno: values.codigo_interno?.trim() || null,
              contato_principal_nome: values.contato_principal_nome?.trim() || null,
              contato_principal_telefone: values.contato_principal_telefone
                ? formatTelefone(values.contato_principal_telefone)
                : null,
              contato_principal_email: values.contato_principal_email?.trim() || null,
              observacoes_internas: values.observacoes_internas?.trim() || null,
            },
          })
          setOpen(false)
        }}
      />

      <ConfirmDialog
        open={!!confirmRow}
        onOpenChange={(o) => !o && setConfirmRow(null)}
        title={confirmRow?.ativo ? 'Desativar parceiro?' : 'Reativar parceiro?'}
        description={confirmRow?.ativo
          ? 'O parceiro não aparecerá nas listas ativas. Os usuários dele continuam existindo, mas convém desativá-los também para bloquear o acesso ao portal.'
          : 'O parceiro voltará a aparecer nas listas ativas.'}
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
        title="Excluir parceiro?"
        description={
          deleteRow
            ? `O cadastro de "${deleteRow.razao_social}" será removido permanentemente, junto com seus usuários, motoristas, veículos, carretas e subcontratadas. Essa ação não pode ser desfeita. Se houver solicitações vinculadas, a exclusão será bloqueada — desative o parceiro nesse caso.`
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

function ParceiroForm({ open, onOpenChange, editing, onSubmit }: FormProps) {
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
        codigo_interno: editing?.codigo_interno ?? '',
        contato_principal_nome: editing?.contato_principal_nome ?? '',
        contato_principal_telefone: editing?.contato_principal_telefone ?? '',
        contato_principal_email: editing?.contato_principal_email ?? '',
        observacoes_internas: editing?.observacoes_internas ?? '',
      })
    }
  }, [open, editing, reset])

  const cnpj = watch('cnpj') ?? ''
  const tel = watch('contato_principal_telefone') ?? ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar parceiro' : 'Novo parceiro'}</DialogTitle>
            <DialogDescription>
              Transportadoras parceiras com acesso ao portal externo. Os usuários
              de login são gerenciados em uma etapa separada.
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
                <Label htmlFor="cnpj">CNPJ *</Label>
                <Input
                  id="cnpj"
                  value={cnpj}
                  onChange={(e) => setValue('cnpj', formatCnpj(e.target.value), { shouldValidate: true })}
                  placeholder="00.000.000/0000-00"
                  inputMode="numeric"
                />
                {errors.cnpj && (
                  <p className="text-[11px] text-destructive">{errors.cnpj.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="codigo_interno">Código interno</Label>
                <Input id="codigo_interno" {...register('codigo_interno')} placeholder="Opcional" />
                {errors.codigo_interno && (
                  <p className="text-[11px] text-destructive">{errors.codigo_interno.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contato_principal_nome">Contato principal</Label>
              <Input id="contato_principal_nome" {...register('contato_principal_nome')} placeholder="Nome do responsável" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contato_principal_telefone">Telefone do contato</Label>
                <Input
                  id="contato_principal_telefone"
                  value={tel}
                  onChange={(e) => setValue('contato_principal_telefone', formatTelefone(e.target.value), { shouldValidate: true })}
                  placeholder="(00) 00000-0000"
                />
                {errors.contato_principal_telefone && (
                  <p className="text-[11px] text-destructive">{errors.contato_principal_telefone.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contato_principal_email">E-mail do contato</Label>
                <Input
                  id="contato_principal_email"
                  type="email"
                  {...register('contato_principal_email')}
                  placeholder="contato@empresa.com"
                />
                {errors.contato_principal_email && (
                  <p className="text-[11px] text-destructive">{errors.contato_principal_email.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="observacoes_internas">Observações internas</Label>
              <Textarea
                id="observacoes_internas"
                rows={2}
                {...register('observacoes_internas')}
                placeholder="Visível apenas para a equipe LHG — o parceiro não vê este campo."
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
