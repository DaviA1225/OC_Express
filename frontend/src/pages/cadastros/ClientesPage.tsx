import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, MapPin } from 'lucide-react'
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

type Row = Tables<'clientes'>

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR',
  'PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
] as const

const numeroOpcional = z
  .string()
  .optional()
  .refine((v) => !v || /^-?\d+([.,]\d+)?$/.test(v.trim()), 'Use apenas números')

const schema = z.object({
  razao_social: z.string().min(2, 'Informe a razão social'),
  cnpj: z
    .string()
    .optional()
    .refine((v) => !v || isValidCnpj(v), 'CNPJ inválido'),
  endereco: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
  latitude: numeroOpcional,
  longitude: numeroOpcional,
  observacoes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

function cidadeUf(r: Row): string {
  if (r.cidade && r.uf) return `${r.cidade}/${r.uf}`
  return r.cidade ?? r.uf ?? '—'
}

function MapaCell({ row }: { row: Row }) {
  if (row.latitude == null || row.longitude == null) {
    return <span className="text-[12px] text-muted-foreground">—</span>
  }
  const url = `https://www.google.com/maps?q=${row.latitude},${row.longitude}`
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <MapPin className="h-3 w-3" />
      Ver no mapa
    </a>
  )
}

export default function ClientesPage() {
  const state = useCrudListState()
  const list = useCrudList('clientes', {
    search: state.debouncedSearch,
    showInactive: state.showInactive,
    page: state.page,
    pageSize: state.pageSize,
    searchColumns: ['razao_social', 'cnpj', 'cidade'],
    orderBy: 'razao_social',
    ascending: true,
  })
  const totalActive = useActiveCount('clientes')
  const upsert = useUpsertRow('clientes', 'Cliente')
  const toggle = useToggleActive('clientes', 'Cliente')

  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)

  const columns: ColumnDef<Row>[] = [
    { header: 'Razão Social', accessor: (r) => r.razao_social },
    { header: 'CNPJ', accessor: (r) => r.cnpj ?? '—', className: 'text-muted-foreground' },
    { header: 'Cidade/UF', accessor: cidadeUf, className: 'text-muted-foreground' },
    { header: 'Mapa', accessor: (r) => <MapaCell row={r} /> },
  ]

  return (
    <>
      <CrudListPage<Row>
        title="Clientes"
        newButtonLabel="Novo cliente"
        onNew={() => { setEditing(null); setOpen(true) }}
        rows={list.data?.data}
        isLoading={list.isLoading}
        totalActive={totalActive.data ?? 0}
        searchValue={state.search}
        onSearchChange={state.setSearch}
        searchPlaceholder="Buscar por razão social, CNPJ ou cidade"
        showInactive={state.showInactive}
        onShowInactiveChange={state.setShowInactive}
        columns={columns}
        rowLabel={(r) => r.razao_social}
        onEdit={(r) => { setEditing(r); setOpen(true) }}
        onToggleActive={(r) => setConfirmRow(r)}
        emptyTitle="Nenhum cliente cadastrado"
        emptyDescription="Cadastre os destinatários das cargas."
        page={state.page}
        pageSize={state.pageSize}
        totalCount={list.data?.count ?? 0}
        onPageChange={state.setPage}
      />

      <ClienteForm
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSubmit={async (values) => {
          await upsert.mutateAsync({
            id: editing?.id,
            values: {
              razao_social: values.razao_social,
              cnpj: values.cnpj ? formatCnpj(values.cnpj) : null,
              endereco: values.endereco || null,
              cidade: values.cidade || null,
              uf: values.uf || null,
              latitude: values.latitude ? Number(values.latitude.replace(',', '.')) : null,
              longitude: values.longitude ? Number(values.longitude.replace(',', '.')) : null,
              observacoes: values.observacoes || null,
            },
          })
          setOpen(false)
        }}
      />

      <ConfirmDialog
        open={!!confirmRow}
        onOpenChange={(o) => !o && setConfirmRow(null)}
        title={confirmRow?.ativo ? 'Desativar cliente?' : 'Reativar cliente?'}
        description={confirmRow?.ativo
          ? 'O cliente não aparecerá nas listas ativas. Você pode reativá-lo depois.'
          : 'O cliente voltará a aparecer nas listas ativas.'}
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

function ClienteForm({ open, onOpenChange, editing, onSubmit }: FormProps) {
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
        endereco: editing?.endereco ?? '',
        cidade: editing?.cidade ?? '',
        uf: editing?.uf ?? '',
        latitude: editing?.latitude != null ? String(editing.latitude) : '',
        longitude: editing?.longitude != null ? String(editing.longitude) : '',
        observacoes: editing?.observacoes ?? '',
      })
    }
  }, [open, editing, reset])

  const cnpj = watch('cnpj') ?? ''
  const uf = watch('uf') ?? ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
            <DialogDescription>
              Cadastre os destinatários das cargas. Latitude/longitude habilitam o link "Ver no mapa".
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
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input
                  id="cnpj"
                  value={cnpj}
                  onChange={(e) => setValue('cnpj', formatCnpj(e.target.value), { shouldValidate: true })}
                  placeholder="00.000.000/0000-00"
                />
                {errors.cnpj && (
                  <p className="text-[11px] text-destructive">{errors.cnpj.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endereco">Endereço</Label>
                <Input id="endereco" {...register('endereco')} />
              </div>
            </div>

            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cidade">Cidade</Label>
                <Input id="cidade" {...register('cidade')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="uf">UF</Label>
                <Input
                  id="uf"
                  list="uf-list"
                  value={uf}
                  onChange={(e) => setValue('uf', e.target.value.toUpperCase().slice(0, 2), { shouldValidate: true })}
                  maxLength={2}
                />
                <datalist id="uf-list">
                  {UFS.map((u) => <option key={u} value={u} />)}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="latitude">Latitude</Label>
                <Input id="latitude" inputMode="decimal" placeholder="-19.5563" {...register('latitude')} />
                {errors.latitude && (
                  <p className="text-[11px] text-destructive">{errors.latitude.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="longitude">Longitude</Label>
                <Input id="longitude" inputMode="decimal" placeholder="-57.0133" {...register('longitude')} />
                {errors.longitude && (
                  <p className="text-[11px] text-destructive">{errors.longitude.message}</p>
                )}
              </div>
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
