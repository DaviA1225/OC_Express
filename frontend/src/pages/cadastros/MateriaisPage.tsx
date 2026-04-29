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
import { Textarea } from '@/components/ui/textarea'
import { isValidCnpj } from '@/lib/validators'
import { formatCnpj } from '@/lib/utils'
import type { Tables } from '@/types/database.types'

type Row = Tables<'materiais'>

const schema = z.object({
  nome: z.string().min(1, 'Informe o nome'),
  cnpj_filial: z.string().refine(isValidCnpj, 'CNPJ inválido'),
  filial: z.string().min(2, 'Informe a filial'),
  origem_padrao: z.string().optional(),
  destino_padrao: z.string().optional(),
  observacoes_padrao: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export default function MateriaisPage() {
  const state = useCrudListState()
  const list = useCrudList('materiais', {
    search: state.debouncedSearch,
    showInactive: state.showInactive,
    page: state.page,
    pageSize: state.pageSize,
    searchColumns: ['nome', 'filial', 'origem_padrao', 'destino_padrao'],
    orderBy: 'nome',
    ascending: true,
  })
  const totalActive = useActiveCount('materiais')
  const upsert = useUpsertRow('materiais', 'Material')
  const toggle = useToggleActive('materiais', 'Material')

  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)

  const columns: ColumnDef<Row>[] = [
    { header: 'Nome', accessor: (r) => r.nome },
    { header: 'Filial', accessor: (r) => r.filial, className: 'text-muted-foreground' },
    { header: 'Origem padrão', accessor: (r) => r.origem_padrao ?? '—', className: 'text-muted-foreground' },
    { header: 'Destino padrão', accessor: (r) => r.destino_padrao ?? '—', className: 'text-muted-foreground' },
  ]

  return (
    <>
      <CrudListPage<Row>
        title="Materiais"
        newButtonLabel="Novo material"
        onNew={() => { setEditing(null); setOpen(true) }}
        rows={list.data?.data}
        isLoading={list.isLoading}
        totalActive={totalActive.data ?? 0}
        searchValue={state.search}
        onSearchChange={state.setSearch}
        searchPlaceholder="Buscar por nome, filial, origem ou destino"
        showInactive={state.showInactive}
        onShowInactiveChange={state.setShowInactive}
        columns={columns}
        rowLabel={(r) => r.nome}
        onEdit={(r) => { setEditing(r); setOpen(true) }}
        onToggleActive={(r) => setConfirmRow(r)}
        emptyTitle="Nenhum material cadastrado"
        emptyDescription="Cadastre os materiais transportados (minério, pedra etc.)."
        page={state.page}
        pageSize={state.pageSize}
        totalCount={list.data?.count ?? 0}
        onPageChange={state.setPage}
      />

      <MaterialForm
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSubmit={async (values) => {
          await upsert.mutateAsync({
            id: editing?.id,
            values: {
              nome: values.nome.trim(),
              cnpj_filial: formatCnpj(values.cnpj_filial),
              filial: values.filial.trim(),
              origem_padrao: values.origem_padrao || null,
              destino_padrao: values.destino_padrao || null,
              observacoes_padrao: values.observacoes_padrao || null,
            },
          })
          setOpen(false)
        }}
      />

      <ConfirmDialog
        open={!!confirmRow}
        onOpenChange={(o) => !o && setConfirmRow(null)}
        title={confirmRow?.ativo ? 'Desativar material?' : 'Reativar material?'}
        description={confirmRow?.ativo
          ? 'O material não aparecerá nas listas ativas. Você pode reativá-lo depois.'
          : 'O material voltará a aparecer nas listas ativas.'}
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

function MaterialForm({ open, onOpenChange, editing, onSubmit }: FormProps) {
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
        nome: editing?.nome ?? '',
        cnpj_filial: editing?.cnpj_filial ?? '',
        filial: editing?.filial ?? '',
        origem_padrao: editing?.origem_padrao ?? '',
        destino_padrao: editing?.destino_padrao ?? '',
        observacoes_padrao: editing?.observacoes_padrao ?? '',
      })
    }
  }, [open, editing, reset])

  const cnpj = watch('cnpj_filial') ?? ''
  const obs = watch('observacoes_padrao') ?? ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar material' : 'Novo material'}</DialogTitle>
            <DialogDescription>
              Cadastre os materiais transportados. As observações abaixo aparecem na OC.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-[1.4fr_1fr] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nome">Nome *</Label>
                <Input id="nome" autoFocus {...register('nome')} placeholder="MINÉRIO, PEDRA, AREIA…" />
                {errors.nome && (
                  <p className="text-[11px] text-destructive">{errors.nome.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cnpj_filial">CNPJ da filial *</Label>
                <Input
                  id="cnpj_filial"
                  value={cnpj}
                  onChange={(e) => setValue('cnpj_filial', formatCnpj(e.target.value), { shouldValidate: true })}
                  placeholder="00.000.000/0000-00"
                />
                {errors.cnpj_filial && (
                  <p className="text-[11px] text-destructive">{errors.cnpj_filial.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filial">Filial *</Label>
              <Input id="filial" {...register('filial')} placeholder="MIRANDA - MS" />
              {errors.filial && (
                <p className="text-[11px] text-destructive">{errors.filial.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="origem_padrao">Origem padrão</Label>
                <Input id="origem_padrao" {...register('origem_padrao')} placeholder="TERENOS - MS" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="destino_padrao">Destino padrão</Label>
                <Input id="destino_padrao" {...register('destino_padrao')} placeholder="CORUMBÁ - MS" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="observacoes_padrao">Observações padrão</Label>
              <Textarea
                id="observacoes_padrao"
                rows={3}
                {...register('observacoes_padrao')}
                placeholder="1° Obrigatório: Uso de EPIs (capacete, calça, colete e botina). Caçambas limpas."
              />
              {obs.trim() && (
                <div className="rounded-md border bg-muted px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground mb-1">
                    Pré-visualização no PDF
                  </p>
                  <pre className="whitespace-pre-wrap font-mono text-[11px] text-foreground">
                    {obs}
                  </pre>
                </div>
              )}
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
