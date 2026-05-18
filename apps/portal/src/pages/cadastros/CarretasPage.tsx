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
import { Textarea } from '@/components/ui/textarea'
import { isValidPlaca } from '@sislog/shared/validators'
import { formatPlaca } from '@/lib/utils'
import type { Tables } from '@sislog/shared/types'

type Row = Tables<'parceiro_carretas'>

const schema = z.object({
  placa: z.string().min(1, 'Informe a placa').refine(isValidPlaca, 'Placa inválida'),
  tipo: z.string().optional(),
  capacidade_ton: z
    .string()
    .optional()
    .refine((v) => !v || (!Number.isNaN(Number(v)) && Number(v) > 0), 'Capacidade inválida'),
  observacoes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export default function CarretasPage() {
  const { parceiro } = useAuth()
  const parceiroId = parceiro?.id ?? null
  const state = useCrudListState()
  const list = useParceiroCrudList('parceiro_carretas', {
    search: state.debouncedSearch,
    showInactive: state.showInactive,
    page: state.page,
    pageSize: state.pageSize,
    searchColumns: ['placa', 'tipo'],
    orderBy: 'placa',
    ascending: true,
  })
  const totalActive = useParceiroActiveCount('parceiro_carretas')
  const upsert = useUpsertParceiroRow('parceiro_carretas', 'Carreta', parceiroId)
  const toggle = useToggleParceiroActive('parceiro_carretas', 'Carreta')
  const remove = useDeleteParceiroRow('parceiro_carretas', 'Carreta')

  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)
  const [deleteRow, setDeleteRow] = React.useState<Row | null>(null)

  const columns: ColumnDef<Row>[] = [
    { header: 'Placa', accessor: (r) => r.placa },
    { header: 'Tipo', accessor: (r) => r.tipo ?? '—', className: 'text-muted-foreground' },
    {
      header: 'Capacidade (t)',
      accessor: (r) => (r.capacidade_ton != null ? String(r.capacidade_ton) : '—'),
      className: 'text-muted-foreground',
    },
  ]

  return (
    <>
      <CrudListPage<Row>
        title="Carretas"
        newButtonLabel="Nova carreta"
        onNew={() => { setEditing(null); setOpen(true) }}
        rows={list.data?.data}
        isLoading={list.isLoading}
        totalActive={totalActive.data ?? 0}
        searchValue={state.search}
        onSearchChange={state.setSearch}
        searchPlaceholder="Buscar por placa ou tipo"
        showInactive={state.showInactive}
        onShowInactiveChange={state.setShowInactive}
        columns={columns}
        rowLabel={(r) => r.placa}
        onEdit={(r) => { setEditing(r); setOpen(true) }}
        onToggleActive={(r) => setConfirmRow(r)}
        onDelete={(r) => setDeleteRow(r)}
        emptyTitle="Nenhuma carreta cadastrada"
        emptyDescription="Cadastre as carretas da sua frota para usar nas solicitações."
        page={state.page}
        pageSize={state.pageSize}
        totalCount={list.data?.count ?? 0}
        onPageChange={state.setPage}
      />

      <CarretaForm
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSubmit={async (values) => {
          await upsert.mutateAsync({
            id: editing?.id,
            values: {
              placa: formatPlaca(values.placa),
              tipo: values.tipo?.trim() || null,
              capacidade_ton: values.capacidade_ton ? Number(values.capacidade_ton) : null,
              observacoes: values.observacoes?.trim() || null,
            },
          })
          setOpen(false)
        }}
      />

      <ConfirmDialog
        open={!!confirmRow}
        onOpenChange={(o) => !o && setConfirmRow(null)}
        title={confirmRow?.ativo ? 'Desativar carreta?' : 'Reativar carreta?'}
        description={confirmRow?.ativo
          ? 'A carreta não aparecerá nas listas ativas. Você pode reativá-la depois.'
          : 'A carreta voltará a aparecer nas listas ativas.'}
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
        title="Excluir carreta?"
        description={
          deleteRow
            ? `O cadastro da placa "${deleteRow.placa}" será removido permanentemente. Se houver solicitações vinculadas, a exclusão será bloqueada.`
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

function CarretaForm({ open, onOpenChange, editing, onSubmit }: FormProps) {
  const {
    register, handleSubmit, reset, setValue, watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (open) {
      reset({
        placa: editing?.placa ?? '',
        tipo: editing?.tipo ?? '',
        capacidade_ton: editing?.capacidade_ton != null ? String(editing.capacidade_ton) : '',
        observacoes: editing?.observacoes ?? '',
      })
    }
  }, [open, editing, reset])

  const placa = watch('placa') ?? ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar carreta' : 'Nova carreta'}</DialogTitle>
            <DialogDescription>
              Carretas da sua frota disponíveis para as solicitações de carregamento.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="placa">Placa *</Label>
                <Input
                  id="placa"
                  autoFocus
                  value={placa}
                  onChange={(e) => setValue('placa', formatPlaca(e.target.value), { shouldValidate: true })}
                  placeholder="ABC1D23"
                />
                {errors.placa && <p className="text-[11px] text-destructive">{errors.placa.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="capacidade_ton">Capacidade (t)</Label>
                <Input
                  id="capacidade_ton"
                  {...register('capacidade_ton')}
                  inputMode="decimal"
                  placeholder="Ex.: 32"
                />
                {errors.capacidade_ton && (
                  <p className="text-[11px] text-destructive">{errors.capacidade_ton.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tipo">Tipo</Label>
              <Input id="tipo" {...register('tipo')} placeholder="Ex.: Graneleiro, Caçamba" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea id="observacoes" rows={2} {...register('observacoes')} />
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
