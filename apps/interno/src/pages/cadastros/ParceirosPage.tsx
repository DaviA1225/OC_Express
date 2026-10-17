import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Lock, Unlock, Users } from 'lucide-react'
import { Spinner } from '@/components/shared/Spinner'
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
import { Textarea } from '@/components/ui/textarea'
import { isValidDocumento, isValidTelefone, tipoPessoa } from '@/lib/validators'
import { formatDocumento, formatTelefone } from '@/lib/utils'
import type { Tables } from '@/types/database.types'
import { CadastroField } from '@/components/forms/CadastroField'
import { useDescartarAlteracoes } from '@/features/crud/useDescartarAlteracoes'

type Row = Tables<'parceiros'>

// E-mail é opcional; quando informado, exige um formato plausível.
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const schema = z.object({
  razao_social: z.string().min(2, 'Informe a razão social'),
  documento: z
    .string()
    .min(1, 'Informe o CPF ou CNPJ')
    .refine(isValidDocumento, 'CPF ou CNPJ inválido'),
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
  const navigate = useNavigate()
  const canEdit = canEditParceiros(profile)
  const canBulk = canUseBulkActions(profile)
  const state = useCrudListState()
  const list = useCrudList('parceiros', {
    search: state.debouncedSearch,
    showInactive: state.showInactive,
    page: state.page,
    pageSize: state.pageSize,
    searchColumns: ['razao_social', 'documento', 'codigo_interno'],
    orderBy: 'razao_social',
    ascending: true,
  })
  const totalActive = useActiveCount('parceiros')
  const upsert = useUpsertRow('parceiros', { singular: 'Parceiro', plural: 'Parceiros', genero: 'm' })
  const toggle = useToggleActive('parceiros', { singular: 'Parceiro', plural: 'Parceiros', genero: 'm' })
  const remove = useDeleteRow('parceiros', { singular: 'Parceiro', plural: 'Parceiros', genero: 'm' })
  const bulkToggle = useBulkToggleActive('parceiros', { singular: 'Parceiro', plural: 'Parceiros', genero: 'm' })
  const bulkDelete = useBulkDeleteRows('parceiros', { singular: 'Parceiro', plural: 'Parceiros', genero: 'm' })

  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)
  const [deleteRow, setDeleteRow] = React.useState<Row | null>(null)
  const [bloqueioRow, setBloqueioRow] = React.useState<Row | null>(null)

  const columns: ColumnDef<Row>[] = [
    { header: 'Razão social', accessor: (r) => r.razao_social },
    { header: 'CPF/CNPJ', accessor: (r) => r.documento, className: 'text-muted-foreground' },
    { header: 'Código interno', accessor: (r) => r.codigo_interno ?? '—', className: 'text-muted-foreground' },
    { header: 'Contato', accessor: (r) => r.contato_principal_nome ?? '—' },
  ]

  return (
    <>
      <CrudListPage<Row>
        title="Parceiros e acessos"
        newButtonLabel={canEdit ? 'Novo parceiro' : undefined}
        onNew={canEdit ? () => { setEditing(null); setOpen(true) } : undefined}
        rows={list.data?.data}
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={() => { void list.refetch() }}
        totalActive={totalActive.data ?? 0}
        searchValue={state.search}
        onSearchChange={state.setSearch}
        searchPlaceholder="Buscar por razão social, CPF/CNPJ ou código"
        showInactive={state.showInactive}
        onShowInactiveChange={state.setShowInactive}
        columns={columns}
        rowLabel={(r) => r.razao_social}
        onEdit={canEdit ? (r) => { setEditing(r); setOpen(true) } : undefined}
        onToggleActive={canEdit ? (r) => setConfirmRow(r) : undefined}
        onDelete={canEdit ? (r) => setDeleteRow(r) : undefined}
        rowActions={canEdit ? (r) => (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setBloqueioRow(r)}
              aria-label={
                r.solicitacoes_bloqueadas
                  ? `Liberar novas solicitações de ${r.razao_social}`
                  : `Bloquear novas solicitações de ${r.razao_social}`
              }
              title={
                r.solicitacoes_bloqueadas
                  ? 'Liberar novas solicitações'
                  : 'Bloquear novas solicitações'
              }
              className={r.solicitacoes_bloqueadas ? 'text-destructive hover:text-destructive' : undefined}
            >
              {r.solicitacoes_bloqueadas ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/cadastros/parceiros/${r.id}/usuarios`)}
              aria-label={`Gerenciar usuários de ${r.razao_social}`}
              title="Gerenciar usuários"
            >
              <Users className="h-4 w-4" />
            </Button>
          </>
        ) : undefined}
        emptyTitle="Nenhum parceiro cadastrado"
        emptyDescription="Transportadoras parceiras com acesso ao portal externo."
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
              documento: formatDocumento(values.documento),
              tipo_pessoa: tipoPessoa(values.documento),
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
        open={!!bloqueioRow}
        onOpenChange={(o) => !o && setBloqueioRow(null)}
        title={bloqueioRow?.solicitacoes_bloqueadas
          ? 'Liberar novas solicitações?'
          : 'Bloquear novas solicitações?'}
        description={bloqueioRow?.solicitacoes_bloqueadas
          ? `O parceiro "${bloqueioRow?.razao_social}" voltará a conseguir criar solicitações pelo portal.`
          : `O parceiro "${bloqueioRow?.razao_social}" deixará de conseguir criar novas solicitações pelo portal. As solicitações já enviadas continuam visíveis e o parceiro segue conseguindo baixar os arquivos.`}
        confirmLabel={bloqueioRow?.solicitacoes_bloqueadas ? 'Liberar' : 'Bloquear'}
        destructive={!bloqueioRow?.solicitacoes_bloqueadas}
        onConfirm={async () => {
          if (bloqueioRow) {
            const proximo = !bloqueioRow.solicitacoes_bloqueadas
            await upsert.mutateAsync({
              id: bloqueioRow.id,
              values: {
                solicitacoes_bloqueadas: proximo,
                solicitacoes_bloqueadas_em: proximo ? new Date().toISOString() : null,
              },
            })
            setBloqueioRow(null)
          }
        }}
      />

      <ConfirmDialog
        open={!!deleteRow}
        onOpenChange={(o) => !o && setDeleteRow(null)}
        title="Excluir parceiro?"
        description={
          deleteRow
            ? `O cadastro de "${deleteRow.razao_social}" será removido permanentemente, junto com seus usuários, motoristas, veículos, carretas e subcontratadas. Essa ação não pode ser desfeita. Se houver solicitações vinculadas, a exclusão será bloqueada, desative o parceiro nesse caso.`
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

function ParceiroForm({ open, onOpenChange, editing, onSubmit }: FormProps) {
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
        razao_social: editing?.razao_social ?? '',
        documento: editing?.documento ?? '',
        codigo_interno: editing?.codigo_interno ?? '',
        contato_principal_nome: editing?.contato_principal_nome ?? '',
        contato_principal_telefone: editing?.contato_principal_telefone ?? '',
        contato_principal_email: editing?.contato_principal_email ?? '',
        observacoes_internas: editing?.observacoes_internas ?? '',
      })
    }
  }, [open, editing, reset])

  const documento = watch('documento') ?? ''
  const tel = watch('contato_principal_telefone') ?? ''

  const guarda = useDescartarAlteracoes(isDirty, onOpenChange, isSubmitting)

  return (
    <>
    <Dialog open={open} onOpenChange={guarda.onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar parceiro' : 'Novo parceiro'}</DialogTitle>
            <DialogDescription>
              Transportadora com acesso ao portal externo. Os usuários de acesso são
              gerenciados à parte, no ícone de usuários da lista.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <CadastroField label="Razão social" required id="razao_social" error={errors.razao_social?.message}>
              <Input autoFocus {...register('razao_social')} />
            </CadastroField>

            <div className="grid grid-cols-2 gap-3">
              <CadastroField label="CPF/CNPJ" required id="documento" error={errors.documento?.message}>
                <Input
                  value={documento}
                  onChange={(e) => setValue('documento', formatDocumento(e.target.value), { shouldValidate: true, shouldDirty: true })}
                  placeholder="CPF ou CNPJ"
                  inputMode="numeric"
                />
              </CadastroField>
              <CadastroField label="Código interno" id="codigo_interno" error={errors.codigo_interno?.message}>
                <Input {...register('codigo_interno')} placeholder="Opcional" />
              </CadastroField>
            </div>

            <CadastroField label="Contato principal" id="contato_principal_nome">
              <Input {...register('contato_principal_nome')} placeholder="Nome do responsável" />
            </CadastroField>

            <div className="grid grid-cols-2 gap-3">
              <CadastroField label="Telefone do contato" id="contato_principal_telefone" error={errors.contato_principal_telefone?.message}>
                <Input
                  value={tel}
                  onChange={(e) => setValue('contato_principal_telefone', formatTelefone(e.target.value), { shouldValidate: true, shouldDirty: true })}
                  placeholder="(00) 00000-0000"
                />
              </CadastroField>
              <CadastroField label="E-mail do contato" id="contato_principal_email" error={errors.contato_principal_email?.message}>
                <Input
                  type="email"
                  {...register('contato_principal_email')}
                  placeholder="contato@empresa.com"
                />
              </CadastroField>
            </div>

            <CadastroField label="Observações internas" id="observacoes_internas">
              <Textarea
                rows={2}
                {...register('observacoes_internas')}
                placeholder="Visível apenas para a equipe LHG, o parceiro não vê este campo."
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
