import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { CrudListPage, useCrudListState, type ColumnDef } from '@/components/shared/CrudListPage'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import {
  useParceiroCrudList,
  useParceiroActiveCount,
  useUpsertParceiroRow,
  useToggleParceiroActive,
  useDeleteParceiroRow,
} from '@/features/cadastros/useParceiroCrud'
import { supabase } from '@/lib/supabase'
import { buildCsv, downloadCsv, type CsvColumn } from '@/lib/csv'
import { useAuth } from '@/hooks/useAuth'
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { isValidCpf, isValidTelefone } from '@sislog/shared/validators'
import { formatCpf, formatTelefone } from '@/lib/utils'
import type { Tables } from '@sislog/shared/types'
import { Spinner } from '@/components/shared/Spinner'
import { CadastroField } from '@/components/forms/CadastroField'
import { useDescartarAlteracoes } from '@/features/cadastros/useDescartarAlteracoes'

type Row = Tables<'parceiro_motoristas'>

const schema = z.object({
  nome_completo: z.string().min(2, 'Informe o nome completo'),
  cpf: z.string().min(1, 'Informe o CPF').refine(isValidCpf, 'CPF inválido'),
  telefone: z.string().optional().refine((v) => !v || isValidTelefone(v), 'Telefone inválido'),
  observacoes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export default function MotoristasPage() {
  const { parceiro } = useAuth()
  const parceiroId = parceiro?.id ?? null
  const state = useCrudListState()
  const list = useParceiroCrudList('parceiro_motoristas', {
    search: state.debouncedSearch,
    showInactive: state.showInactive,
    page: state.page,
    pageSize: state.pageSize,
    searchColumns: ['nome_completo', 'cpf'],
    orderBy: 'nome_completo',
    ascending: true,
  })
  const totalActive = useParceiroActiveCount('parceiro_motoristas')
  const upsert = useUpsertParceiroRow('parceiro_motoristas', 'Motorista', parceiroId)
  const toggle = useToggleParceiroActive('parceiro_motoristas', 'Motorista')
  const remove = useDeleteParceiroRow('parceiro_motoristas', 'Motorista')

  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)
  const [deleteRow, setDeleteRow] = React.useState<Row | null>(null)
  const [exporting, setExporting] = React.useState(false)

  // Exporta TODOS os motoristas da frota do parceiro que batem com os filtros
  // atuais (a RLS já restringe às linhas do próprio parceiro).
  const exportCsv = async () => {
    setExporting(true)
    try {
      let query = supabase
        .from('parceiro_motoristas')
        .select('nome_completo, cpf, telefone, observacoes, ativo, created_at')
        .order('nome_completo', { ascending: true })
      if (!state.showInactive) query = query.eq('ativo', true)
      const term = state.debouncedSearch.trim()
      if (term) {
        const safe = term.replace(/[%_]/g, '\\$&')
        query = query.or(`nome_completo.ilike.%${safe}%,cpf.ilike.%${safe}%`)
      }
      const { data, error } = await query
      if (error) throw error
      const rows = (data ?? []) as Pick<Row, 'nome_completo' | 'cpf' | 'telefone' | 'observacoes' | 'ativo' | 'created_at'>[]
      if (rows.length === 0) {
        toast.info('Nenhum motorista para exportar com os filtros atuais.')
        return
      }
      const cols: CsvColumn<(typeof rows)[number]>[] = [
        { header: 'Nome', accessor: (r) => r.nome_completo },
        { header: 'CPF', accessor: (r) => r.cpf },
        { header: 'Telefone', accessor: (r) => r.telefone },
        { header: 'Observações', accessor: (r) => r.observacoes },
        { header: 'Ativo', accessor: (r) => r.ativo },
        { header: 'Criado em', accessor: (r) => r.created_at },
      ]
      const ts = new Date()
      const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}_${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}`
      downloadCsv(`motoristas_${stamp}.csv`, buildCsv(rows, cols))
      toast.success(`${rows.length} ${rows.length === 1 ? 'registro exportado' : 'registros exportados'}.`)
    } catch (err) {
      toast.error('Não foi possível exportar. Tente novamente.')
      console.error('export motoristas csv error', err)
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnDef<Row>[] = [
    { header: 'Nome', accessor: (r) => r.nome_completo },
    { header: 'CPF', accessor: (r) => r.cpf, className: 'text-muted-foreground' },
    { header: 'Telefone', accessor: (r) => r.telefone ?? '—' },
  ]

  return (
    <>
      <CrudListPage<Row>
        title="Motoristas"
        headerActions={
          <Button
            type="button"
            variant="outline"
            onClick={exportCsv}
            disabled={exporting || list.isLoading}
            title="Exportar motoristas (filtros atuais) em CSV"
          >
            {exporting ? <Spinner /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">Exportar CSV</span>
          </Button>
        }
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
        emptyDescription="Cadastre os motoristas da sua frota para usar nas solicitações."
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
              nome_completo: values.nome_completo.trim(),
              cpf: formatCpf(values.cpf),
              telefone: values.telefone ? formatTelefone(values.telefone) : null,
              observacoes: values.observacoes?.trim() || null,
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
          ? 'O motorista não aparecerá nas listas ativas. É possível reativá-lo depois.'
          : 'O motorista voltará a aparecer nas listas ativas.'}
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
        title="Excluir motorista?"
        description={
          deleteRow
            ? `O cadastro de "${deleteRow.nome_completo}" será removido permanentemente. Se houver solicitações vinculadas, a exclusão será bloqueada.`
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

function MotoristaForm({ open, onOpenChange, editing, onSubmit }: FormProps) {
  const {
    register, handleSubmit, reset, setValue, watch,
    formState: { errors, isSubmitting, isDirty },
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

  const guarda = useDescartarAlteracoes(isDirty, onOpenChange, isSubmitting)

  return (
    <>
      <Dialog open={open} onOpenChange={guarda.onOpenChange}>
        <DialogContent>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar motorista' : 'Novo motorista'}</DialogTitle>
              <DialogDescription>
                Motoristas da sua frota disponíveis para as solicitações de carregamento.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <CadastroField label="Nome completo" required id="nome_completo" error={errors.nome_completo?.message}>
                <Input autoFocus {...register('nome_completo')} />
              </CadastroField>
              <div className="grid grid-cols-2 gap-3">
                <CadastroField label="CPF" required id="cpf" error={errors.cpf?.message}>
                  <Input
                    value={cpf}
                    onChange={(e) => setValue('cpf', formatCpf(e.target.value), { shouldValidate: true, shouldDirty: true })}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                  />
                </CadastroField>
                <CadastroField label="Telefone" id="telefone" error={errors.telefone?.message}>
                  <Input
                    value={tel}
                    onChange={(e) => setValue('telefone', formatTelefone(e.target.value), { shouldValidate: true, shouldDirty: true })}
                    placeholder="(00) 00000-0000"
                  />
                </CadastroField>
              </div>
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
