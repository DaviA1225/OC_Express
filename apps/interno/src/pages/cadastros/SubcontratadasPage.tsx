import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Download } from 'lucide-react'
import { Spinner } from '@/components/shared/Spinner'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { buildCsv, downloadCsv, type CsvColumn } from '@/lib/csv'
import { CrudListPage, useCrudListState, type ColumnDef } from '@/components/shared/CrudListPage'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useCrudList, useActiveCount, useUpsertRow, useToggleActive, useDeleteRow, useBulkToggleActive, useBulkDeleteRows } from '@/features/crud/useCrudQueries'
import { useAuth } from '@/hooks/useAuth'
import { canEditCadastrosOperacionais, canUseBulkActions } from '@/features/auth/permissions'
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
import { isValidDocumento, tipoPessoa } from '@/lib/validators'
import { formatDocumento, cn } from '@/lib/utils'
import type { Tables } from '@/types/database.types'
import { CadastroField } from '@/components/forms/CadastroField'
import { useDescartarAlteracoes } from '@/features/crud/useDescartarAlteracoes'

type Row = Tables<'subcontratadas'>
type ExportRow = Pick<Row, 'razao_social' | 'tipo_pessoa' | 'documento' | 'ativo'>

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
  const { profile } = useAuth()
  const canEdit = canEditCadastrosOperacionais(profile)
  const canBulk = canUseBulkActions(profile)
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
  const upsert = useUpsertRow('subcontratadas', { singular: 'Subcontratada', plural: 'Subcontratadas', genero: 'f' })
  const toggle = useToggleActive('subcontratadas', { singular: 'Subcontratada', plural: 'Subcontratadas', genero: 'f' })
  const remove = useDeleteRow('subcontratadas', { singular: 'Subcontratada', plural: 'Subcontratadas', genero: 'f' })
  const bulkToggle = useBulkToggleActive('subcontratadas', { singular: 'Subcontratada', plural: 'Subcontratadas', genero: 'f' })
  const bulkDelete = useBulkDeleteRows('subcontratadas', { singular: 'Subcontratada', plural: 'Subcontratadas', genero: 'f' })

  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)
  const [deleteRow, setDeleteRow] = React.useState<Row | null>(null)
  const [exporting, setExporting] = React.useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      let query = supabase
        .from('subcontratadas')
        .select('razao_social, tipo_pessoa, documento, ativo')
      if (!state.showInactive) query = query.eq('ativo', true)
      const term = state.debouncedSearch.trim()
      if (term) {
        const safe = term.replace(/[%_]/g, '\\$&')
        query = query.or(`razao_social.ilike.%${safe}%,documento.ilike.%${safe}%`)
      }
      const { data, error } = await query.order('razao_social', { ascending: true })
      if (error) throw error
      const rows = (data ?? []) as unknown as ExportRow[]
      if (rows.length === 0) {
        toast.info('Nenhuma subcontratada para exportar com os filtros atuais.')
        return
      }
      const cols: CsvColumn<ExportRow>[] = [
        { header: 'Razão social ou nome', accessor: (r) => r.razao_social },
        { header: 'Tipo', accessor: (r) => r.tipo_pessoa },
        { header: 'CPF/CNPJ', accessor: (r) => r.documento },
        { header: 'Situação', accessor: (r) => (r.ativo ? 'Ativa' : 'Inativa') },
      ]
      const ts = new Date()
      const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}_${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}`
      downloadCsv(`subcontratadas_${stamp}.csv`, buildCsv(rows, cols))
      toast.success(`${rows.length} ${rows.length === 1 ? 'registro exportado' : 'registros exportados'}`)
    } catch {
      toast.error('Falha ao exportar. Tente novamente.')
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnDef<Row>[] = [
    { header: 'Razão social ou nome', accessor: (r) => r.razao_social },
    { header: 'Tipo', accessor: (r) => <TipoBadge tipo={r.tipo_pessoa} /> },
    { header: 'CPF/CNPJ', accessor: (r) => r.documento ?? '—', className: 'text-muted-foreground' },
  ]

  return (
    <>
      <CrudListPage<Row>
        title="Subcontratadas"
        newButtonLabel={canEdit ? 'Nova subcontratada' : undefined}
        onNew={canEdit ? () => { setEditing(null); setOpen(true) } : undefined}
        headerActions={
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exporting || list.isLoading}
            title="Exportar resultados filtrados em CSV"
          >
            {exporting ? <Spinner /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">Exportar CSV</span>
          </Button>
        }
        rows={list.data?.data}
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={() => { void list.refetch() }}
        totalActive={totalActive.data ?? 0}
        searchValue={state.search}
        onSearchChange={state.setSearch}
        searchPlaceholder="Buscar por nome, razão social, CPF ou CNPJ"
        showInactive={state.showInactive}
        onShowInactiveChange={state.setShowInactive}
        columns={columns}
        rowLabel={(r) => r.razao_social}
        onEdit={canEdit ? (r) => { setEditing(r); setOpen(true) } : undefined}
        onToggleActive={canEdit ? (r) => setConfirmRow(r) : undefined}
        onDelete={canEdit ? (r) => setDeleteRow(r) : undefined}
        emptyTitle="Nenhuma subcontratada cadastrada"
        emptyDescription="Transportadoras (PJ) e autônomos (PF) que prestam serviço à LHG."
        page={state.page}
        pageSize={state.pageSize}
        totalCount={list.data?.count ?? 0}
        onPageChange={state.setPage}
        onBulkToggleActive={canBulk ? async (ids, ativo) => { await bulkToggle.mutateAsync({ ids, ativo }) } : undefined}
        onBulkDelete={canBulk ? async (ids) => { await bulkDelete.mutateAsync({ ids }) } : undefined}
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
            ? `O cadastro de "${deleteRow.razao_social}" será removido permanentemente. Essa ação não pode ser desfeita. Se houver veículos, carretas ou solicitações vinculadas, a exclusão será bloqueada.`
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
              O tipo (PJ ou PF) é detectado pelo documento.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <CadastroField label="Razão social ou nome" required id="razao_social" error={errors.razao_social?.message}>
              <Input autoFocus {...register('razao_social')} />
            </CadastroField>

            <CadastroField
              label="CPF/CNPJ"
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
