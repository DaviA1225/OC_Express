import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { CrudListPage, useCrudListState, type ColumnDef } from '@/components/shared/CrudListPage'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useCrudList, useActiveCount, useUpsertRow, useToggleActive } from '@/features/crud/useCrudQueries'
import { useCrudOptions } from '@/features/crud/useCrudOptions'
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
import { Combobox, type ComboboxOption } from '@/components/shared/Combobox'
import { isValidPlaca } from '@/lib/validators'
import { formatPlaca } from '@/lib/utils'
import type { Tables } from '@/types/database.types'

type Row = Tables<'veiculos'>
type Subcontratada = Pick<Tables<'subcontratadas'>, 'id' | 'razao_social'>

const TIPOS = ['Cavalo 6x2', 'Cavalo 6x4', 'Truck', 'Toco', 'Outro'] as const

const schema = z.object({
  placa: z.string().refine(isValidPlaca, 'Placa inválida'),
  tipo: z.string().optional(),
  subcontratada_id: z.string().nullable().optional(),
  observacoes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export default function VeiculosPage() {
  const state = useCrudListState()
  const list = useCrudList('veiculos', {
    search: state.debouncedSearch,
    showInactive: state.showInactive,
    page: state.page,
    pageSize: state.pageSize,
    searchColumns: ['placa', 'tipo'],
    orderBy: 'placa',
    ascending: true,
  })
  const totalActive = useActiveCount('veiculos')
  const upsert = useUpsertRow('veiculos', 'Veículo')
  const toggle = useToggleActive('veiculos', 'Veículo')

  const subOptions = useCrudOptions<Subcontratada>({
    table: 'subcontratadas',
    selectColumns: 'id, razao_social',
    orderBy: 'razao_social',
  })

  const subById = React.useMemo(() => {
    const map = new Map<string, string>()
    subOptions.data?.forEach((s) => map.set(s.id, s.razao_social))
    return map
  }, [subOptions.data])

  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)

  const columns: ColumnDef<Row>[] = [
    { header: 'Placa', accessor: (r) => r.placa },
    { header: 'Tipo', accessor: (r) => r.tipo ?? '—', className: 'text-muted-foreground' },
    {
      header: 'Subcontratada',
      accessor: (r) => (r.subcontratada_id ? subById.get(r.subcontratada_id) ?? '—' : '—'),
      className: 'text-muted-foreground',
    },
  ]

  return (
    <>
      <CrudListPage<Row>
        title="Veículos"
        newButtonLabel="Novo veículo"
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
        emptyTitle="Nenhum veículo cadastrado"
        emptyDescription="Cadastre os cavalos mecânicos que poderão ser indicados nas OCs."
        page={state.page}
        pageSize={state.pageSize}
        totalCount={list.data?.count ?? 0}
        onPageChange={state.setPage}
      />

      <VeiculoForm
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        subOptions={subOptions.data ?? []}
        subLoading={subOptions.isLoading}
        onSubmit={async (values) => {
          await upsert.mutateAsync({
            id: editing?.id,
            values: {
              placa: formatPlaca(values.placa),
              tipo: values.tipo || null,
              subcontratada_id: values.subcontratada_id || null,
              observacoes: values.observacoes || null,
            },
          })
          setOpen(false)
        }}
      />

      <ConfirmDialog
        open={!!confirmRow}
        onOpenChange={(o) => !o && setConfirmRow(null)}
        title={confirmRow?.ativo ? 'Desativar veículo?' : 'Reativar veículo?'}
        description={confirmRow?.ativo
          ? 'O veículo não aparecerá nas listas ativas. Você pode reativá-lo depois.'
          : 'O veículo voltará a aparecer nas listas ativas.'}
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
  subOptions: Subcontratada[]
  subLoading: boolean
  onSubmit: (values: FormValues) => Promise<void>
}

function VeiculoForm({ open, onOpenChange, editing, subOptions, subLoading, onSubmit }: FormProps) {
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
        subcontratada_id: editing?.subcontratada_id ?? null,
        observacoes: editing?.observacoes ?? '',
      })
    }
  }, [open, editing, reset])

  const placa = watch('placa') ?? ''
  const tipo = watch('tipo') ?? ''
  const subId = watch('subcontratada_id') ?? null

  const options: ComboboxOption[] = subOptions.map((s) => ({
    value: s.id,
    label: s.razao_social,
  }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar veículo' : 'Novo veículo'}</DialogTitle>
            <DialogDescription>
              Cadastre os cavalos mecânicos que poderão ser usados nas solicitações.
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
              <Label>Subcontratada</Label>
              <Combobox
                options={options}
                value={subId}
                onChange={(v) => setValue('subcontratada_id', v, { shouldValidate: true })}
                placeholder="Selecionar subcontratada"
                searchPlaceholder="Buscar subcontratada"
                emptyMessage="Nenhuma subcontratada ativa."
                loading={subLoading}
              />
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
