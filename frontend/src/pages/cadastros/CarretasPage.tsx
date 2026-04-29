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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { isValidPlaca } from '@/lib/validators'
import { formatPlaca } from '@/lib/utils'
import type { Tables } from '@/types/database.types'

type Row = Tables<'carretas'>

const TIPOS = ['Basculante', 'Graneleira', 'Caçamba', 'Prancha', 'Outro'] as const

const schema = z.object({
  placa: z.string().refine(isValidPlaca, 'Placa inválida'),
  tipo: z.string().optional(),
  capacidade_ton: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+([.,]\d+)?$/.test(v.trim()), 'Use apenas números'),
  observacoes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

function formatCapacidade(value: number | null): string {
  if (value == null) return '—'
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} t`
}

export default function CarretasPage() {
  const state = useCrudListState()
  const list = useCrudList('carretas', {
    search: state.debouncedSearch,
    showInactive: state.showInactive,
    page: state.page,
    pageSize: state.pageSize,
    searchColumns: ['placa', 'tipo'],
    orderBy: 'placa',
    ascending: true,
  })
  const totalActive = useActiveCount('carretas')
  const upsert = useUpsertRow('carretas', 'Carreta')
  const toggle = useToggleActive('carretas', 'Carreta')

  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)

  const columns: ColumnDef<Row>[] = [
    { header: 'Placa', accessor: (r) => r.placa },
    { header: 'Tipo', accessor: (r) => r.tipo ?? '—', className: 'text-muted-foreground' },
    {
      header: 'Capacidade',
      accessor: (r) => formatCapacidade(r.capacidade_ton),
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
        emptyTitle="Nenhuma carreta cadastrada"
        emptyDescription="Cadastre as carretas que poderão ser indicadas nas OCs."
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
              tipo: values.tipo || null,
              capacidade_ton: values.capacidade_ton
                ? Number(values.capacidade_ton.replace(',', '.'))
                : null,
              observacoes: values.observacoes || null,
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
    handleSubmit,
    reset,
    setValue,
    watch,
    register,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (open) {
      reset({
        placa: editing?.placa ?? '',
        tipo: editing?.tipo ?? '',
        capacidade_ton: editing?.capacidade_ton != null ? String(editing.capacidade_ton).replace('.', ',') : '',
        observacoes: editing?.observacoes ?? '',
      })
    }
  }, [open, editing, reset])

  const placa = watch('placa') ?? ''
  const tipo = watch('tipo') ?? ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar carreta' : 'Nova carreta'}</DialogTitle>
            <DialogDescription>
              Cadastre as carretas (semirreboques) usadas nas operações.
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
                {errors.placa && (
                  <p className="text-[11px] text-destructive">{errors.placa.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={tipo || undefined}
                  onValueChange={(v) => setValue('tipo', v, { shouldValidate: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="capacidade_ton">Capacidade (toneladas)</Label>
              <Input
                id="capacidade_ton"
                inputMode="decimal"
                placeholder="Ex.: 30,5"
                {...register('capacidade_ton')}
              />
              {errors.capacidade_ton && (
                <p className="text-[11px] text-destructive">{errors.capacidade_ton.message}</p>
              )}
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
