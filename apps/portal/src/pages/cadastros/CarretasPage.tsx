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
import { useSubcontratadasBase } from '@/features/solicitacoes/useSolicitacoes'
import { useAuth } from '@/hooks/useAuth'
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Combobox, type ComboboxOption } from '@/components/shared/Combobox'
import { isValidPlaca } from '@sislog/shared/validators'
import { formatPlaca } from '@/lib/utils'
import type { Tables } from '@sislog/shared/types'

type Row = Tables<'parceiro_carretas'>

// Mesma lista do cadastro interno (apps/interno/.../CarretasPage.tsx).
const TIPOS = [
  'Caçamba 3 Eixos',
  'Caçamba 4 Eixos',
  'Bi-Trem Caçamba',
  'Rodo-Trem Caçamba',
  'Graneleiro LS 3 Eixos',
  'Graneleiro LS 4 Eixos',
  'Bi-Trem Graneleiro',
  'Rodo-Trem Graneleiro',
] as const

const schema = z.object({
  placa: z.string().refine(isValidPlaca, 'Placa inválida'),
  tipo: z.string().optional(),
  subcontratada_parceiro_id: z.string().nullable().optional(),
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
    searchColumns: ['placa', 'tipo', 'observacoes'],
    orderBy: 'placa',
    ascending: true,
  })
  const totalActive = useParceiroActiveCount('parceiro_carretas')
  const upsert = useUpsertParceiroRow('parceiro_carretas', 'Carreta', parceiroId)
  const toggle = useToggleParceiroActive('parceiro_carretas', 'Carreta')
  const remove = useDeleteParceiroRow('parceiro_carretas', 'Carreta')

  const subBase = useSubcontratadasBase()
  const subActive = React.useMemo(
    () => (subBase.data ?? []).filter((s) => s.ativo),
    [subBase.data],
  )
  const subById = React.useMemo(() => {
    const map = new Map<string, string>()
    ;(subBase.data ?? []).forEach((s) => map.set(s.id, s.razao_social))
    return map
  }, [subBase.data])

  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)
  const [deleteRow, setDeleteRow] = React.useState<Row | null>(null)

  const columns: ColumnDef<Row>[] = [
    { header: 'Placa', accessor: (r) => r.placa },
    { header: 'Tipo', accessor: (r) => r.tipo ?? '—', className: 'text-muted-foreground' },
    {
      header: 'Subcontratada',
      accessor: (r) =>
        r.subcontratada_parceiro_id ? subById.get(r.subcontratada_parceiro_id) ?? '—' : '—',
      className: 'text-muted-foreground',
    },
    {
      header: 'Observações',
      accessor: (r) =>
        r.observacoes ? (
          <span className="block max-w-[280px] truncate" title={r.observacoes}>
            {r.observacoes}
          </span>
        ) : (
          '—'
        ),
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
        subOptions={subActive}
        subLoading={subBase.isLoading}
        onSubmit={async (values) => {
          await upsert.mutateAsync({
            id: editing?.id,
            values: {
              placa: formatPlaca(values.placa),
              tipo: values.tipo || null,
              subcontratada_parceiro_id: values.subcontratada_parceiro_id || null,
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
  subOptions: Tables<'parceiro_subcontratadas'>[]
  subLoading: boolean
  onSubmit: (values: FormValues) => Promise<void>
}

function CarretaForm({ open, onOpenChange, editing, subOptions, subLoading, onSubmit }: FormProps) {
  const {
    register, handleSubmit, reset, setValue, watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (open) {
      reset({
        placa: editing?.placa ?? '',
        tipo: editing?.tipo ?? '',
        subcontratada_parceiro_id: editing?.subcontratada_parceiro_id ?? null,
        observacoes: editing?.observacoes ?? '',
      })
    }
  }, [open, editing, reset])

  const placa = watch('placa') ?? ''
  const tipo = watch('tipo') ?? ''
  const subId = watch('subcontratada_parceiro_id') ?? null

  const options: ComboboxOption[] = subOptions.map((s) => ({
    value: s.id,
    label: s.razao_social,
  }))

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
              <Label>Subcontratada</Label>
              <Combobox
                options={options}
                value={subId}
                onChange={(v) => setValue('subcontratada_parceiro_id', v, { shouldValidate: true })}
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
