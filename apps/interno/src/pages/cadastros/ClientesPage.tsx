import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MapPin, Search as SearchIcon, Map as MapIcon, List as ListIcon, CalendarClock } from 'lucide-react'
import { Spinner } from '@/components/shared/Spinner'
import { CrudListPage, RotuloSituacao, useCrudListState, type ColumnDef } from '@/components/shared/CrudListPage'
import { PageHeader } from '@/components/layout/PageHeader'
import { ClientesMapa } from './ClientesMapa'
import { TerminalAgendamentoDialog } from './TerminalAgendamentoDialog'
import { useClientesMapaMinerio } from '@/features/clientes/useClientesMapa'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useCrudList, useActiveCount, useUpsertRow, useToggleActive, useDeleteRow, useBulkToggleActive, useBulkDeleteRows } from '@/features/crud/useCrudQueries'
import { useAuth } from '@/hooks/useAuth'
import { canEditClientes, canUseBulkActions } from '@/features/auth/permissions'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { Tables } from '@/types/database.types'
import { CadastroField } from '@/components/forms/CadastroField'
import { useDescartarAlteracoes } from '@/features/crud/useDescartarAlteracoes'

type Row = Tables<'clientes'>
type TipoCliente = 'minerio' | 'retorno'

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR',
  'PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
] as const

const numeroOpcional = z
  .string()
  .optional()
  .refine((v) => !v || /^-?\d+([.,]\d+)?$/.test(v.trim()), 'Use apenas números')

const numeroPositivoOpcional = z
  .string()
  .optional()
  .refine((v) => !v || /^\d+([.,]\d+)?$/.test(v.trim()), 'Use apenas números')

const schema = z.object({
  razao_social: z.string().min(2, 'Informe a razão social'),
  endereco: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
  latitude: numeroOpcional,
  longitude: numeroOpcional,
  observacoes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

const operacionalSchema = z.object({
  frete_cacamba: numeroPositivoOpcional,
  frete_graneleiro: numeroPositivoOpcional,
  liberado: z.boolean(),
  aceita_cacamba: z.boolean(),
  aceita_graneleiro: z.boolean(),
})
type OperacionalValues = z.infer<typeof operacionalSchema>

function cidadeUf(r: Row): string {
  if (r.cidade && r.uf) return `${r.cidade}/${r.uf}`
  return r.cidade ?? r.uf ?? '—'
}

function formatFrete(value: number | null): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' /t'
}

function FreteCell({ row }: { row: Row }) {
  const items: { label: 'Caçamba' | 'Graneleiro'; value: number | null; className: string }[] = []
  if (row.aceita_cacamba) {
    items.push({
      label: 'Caçamba',
      value: row.frete_cacamba,
      className: 'cat-brass',
    })
  }
  if (row.aceita_graneleiro) {
    items.push({
      label: 'Graneleiro',
      value: row.frete_graneleiro,
      className: 'cat-steel',
    })
  }
  if (items.length === 0) {
    return <span className="text-body-sm text-muted-foreground">—</span>
  }
  return (
    <div className="flex flex-col gap-1">
      {items.map((it) => (
        <span
          key={it.label}
          className={cn(
            'inline-flex items-center justify-between gap-2 rounded-[2px] border px-1.5 py-0.5 text-meta font-medium leading-tight',
            it.className,
          )}
        >
          <span>{it.label}</span>
          <span className="tabular-nums">{formatFrete(it.value)}</span>
        </span>
      ))}
    </div>
  )
}

function StatusBadge({ liberado }: { liberado: boolean }) {
  return (
    <RotuloSituacao tom={liberado ? 'sucesso' : 'perigo'}>
      {liberado ? 'Liberado' : 'Bloqueado'}
    </RotuloSituacao>
  )
}

/** Coluna de agendamento: só quem exige aparece marcado. O rótulo mostra o
 *  terminal como a equipe o chama, porque é por ele que a fila é agrupada. */
function AgendamentoCell({ row }: { row: Row }) {
  if (!row.requer_agendamento) {
    return <span className="text-body-sm text-muted-foreground">—</span>
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[2px] border px-1.5 py-0.5 text-meta font-medium leading-tight cat-clay">
      <CalendarClock className="h-3 w-3" />
      {row.terminal_nome?.trim() || 'Exige agendamento'}
      {row.antecedencia_minima_horas != null && (
        <span className="tabular-nums opacity-80">· {row.antecedencia_minima_horas}h</span>
      )}
    </span>
  )
}

function MapaCell({ row }: { row: Row }) {
  if (row.latitude == null || row.longitude == null) {
    return <span className="text-body-sm text-muted-foreground">—</span>
  }
  const url = `https://www.google.com/maps?q=${row.latitude},${row.longitude}`
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 text-body-sm text-primary-strong hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <MapPin className="h-3 w-3" />
      Ver no mapa
    </a>
  )
}

const TIPO_FILTER: Record<TipoCliente, { cliente_minerio: boolean } | { cliente_retorno: boolean }> = {
  minerio: { cliente_minerio: true },
  retorno: { cliente_retorno: true },
}

export default function ClientesPage() {
  const { profile } = useAuth()
  const canEdit = canEditClientes(profile)
  const canBulk = canUseBulkActions(profile)
  const [params, setParams] = useSearchParams()
  const tipo: TipoCliente = params.get('tab') === 'retorno' ? 'retorno' : 'minerio'
  const setTipo = (v: TipoCliente) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v === 'retorno') next.set('tab', 'retorno')
        else next.delete('tab')
        next.delete('page')
        return next
      },
      { replace: true },
    )

  // Mapa só existe na aba de minério; em retorno cai sempre na lista.
  const view: 'lista' | 'mapa' =
    tipo === 'minerio' && params.get('view') === 'mapa' ? 'mapa' : 'lista'
  const setView = (v: 'lista' | 'mapa') =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v === 'mapa') next.set('view', 'mapa')
        else next.delete('view')
        return next
      },
      { replace: true },
    )

  const state = useCrudListState()

  const equals = TIPO_FILTER[tipo]
  const list = useCrudList('clientes', {
    search: state.debouncedSearch,
    showInactive: state.showInactive,
    page: state.page,
    pageSize: state.pageSize,
    searchColumns: ['razao_social', 'cidade'],
    orderBy: 'razao_social',
    ascending: true,
    equals,
  })
  const totalActive = useActiveCount('clientes', equals)

  // Dados do mapa (clientes de minério com coordenadas). Só busca quando a aba
  // é minério, para não consultar à toa na aba de retorno.
  const mapa = useClientesMapaMinerio(view === 'mapa')
  const pontosFiltrados = React.useMemo(() => {
    const todos = mapa.data ?? []
    const termo = state.debouncedSearch.trim().toLowerCase()
    if (!termo) return todos
    return todos.filter((p) =>
      [p.razao_social, p.cidade].some((v) => v?.toLowerCase().includes(termo)),
    )
  }, [mapa.data, state.debouncedSearch])
  const semCoordenadas = Math.max(0, (totalActive.data ?? 0) - (mapa.data?.length ?? 0))

  const upsert = useUpsertRow('clientes', tipo === 'minerio' ? { singular: 'Cliente de minério', plural: 'Clientes de minério', genero: 'm' as const } : { singular: 'Cliente de retorno', plural: 'Clientes de retorno', genero: 'm' as const })
  const toggle = useToggleActive('clientes', { singular: 'Cliente', plural: 'Clientes', genero: 'm' })
  const remove = useDeleteRow('clientes', { singular: 'Cliente', plural: 'Clientes', genero: 'm' })
  const bulkToggle = useBulkToggleActive('clientes', { singular: 'Cliente', plural: 'Clientes', genero: 'm' })
  const bulkDelete = useBulkDeleteRows('clientes', { singular: 'Cliente', plural: 'Clientes', genero: 'm' })

  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)
  const [deleteRow, setDeleteRow] = React.useState<Row | null>(null)
  const [opRow, setOpRow] = React.useState<Row | null>(null)
  const [terminalRow, setTerminalRow] = React.useState<Row | null>(null)

  const openOpDialog = (row: Row) => { if (canEdit) setOpRow(row) }
  const openTerminalDialog = (row: Row) => { if (canEdit) setTerminalRow(row) }

  const columns: ColumnDef<Row>[] = [
    { header: 'Razão social', accessor: (r) => r.razao_social },
    { header: 'Cidade/UF', accessor: cidadeUf, className: 'text-muted-foreground' },
    {
      header: 'Frete',
      accessor: (r) =>
        canEdit ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openOpDialog(r) }}
            className="rounded-sm p-1 text-left hover:bg-accent"
            title="Definir frete por tipo"
          >
            <FreteCell row={r} />
          </button>
        ) : (
          <div className="p-1"><FreteCell row={r} /></div>
        ),
    },
    {
      header: 'Liberação',
      accessor: (r) =>
        canEdit ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openOpDialog(r) }}
            className="rounded-sm p-1 hover:bg-accent"
            title="Alterar liberação"
          >
            <StatusBadge liberado={r.liberado} />
          </button>
        ) : (
          <StatusBadge liberado={r.liberado} />
        ),
    },
    {
      header: 'Agendamento',
      accessor: (r) =>
        canEdit ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openTerminalDialog(r) }}
            className="rounded-sm p-1 text-left hover:bg-accent"
            title="Configurar agendamento e grade de horários"
          >
            <AgendamentoCell row={r} />
          </button>
        ) : (
          <div className="p-1"><AgendamentoCell row={r} /></div>
        ),
    },
    {
      header: 'Observações',
      accessor: (r) =>
        r.observacoes ? (
          <span className="line-clamp-2 max-w-[260px] text-body-sm" title={r.observacoes}>
            {r.observacoes}
          </span>
        ) : (
          <span className="text-body-sm text-muted-foreground">—</span>
        ),
      className: 'text-muted-foreground',
    },
    { header: 'Mapa', accessor: (r) => <MapaCell row={r} /> },
  ]

  const titulo = tipo === 'minerio' ? 'Clientes · Minério' : 'Clientes · Retorno'
  const novoLabel = tipo === 'minerio' ? 'Novo cliente de minério' : 'Novo cliente de retorno'
  const emptyTitle = tipo === 'minerio'
    ? 'Nenhum cliente de minério cadastrado'
    : 'Nenhum cliente de retorno cadastrado'
  const emptyDescription = tipo === 'minerio'
    ? 'Destinatários das cargas de minério.'
    : 'Origens das cargas de retorno.'

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs value={tipo} onChange={setTipo} />
          {tipo === 'minerio' && <ViewToggle value={view} onChange={setView} />}
        </div>

        {view === 'mapa' ? (
          <div className="space-y-4">
            <PageHeader
              className="mb-0"
              title={titulo}
              actions={
                <div className="relative w-full min-w-[240px] max-w-[320px]" data-page-search>
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={state.search}
                    onChange={(e) => state.setSearch(e.target.value)}
                    placeholder="Buscar por razão social ou cidade"
                    className="pl-9"
                  />
                </div>
              }
            />
            <div className="rounded-lg border bg-card p-3">
              <ClientesMapa
                pontos={pontosFiltrados}
                isLoading={mapa.isLoading}
                semCoordenadas={semCoordenadas}
              />
            </div>
          </div>
        ) : (
          <CrudListPage<Row>
            title={titulo}
            newButtonLabel={canEdit ? novoLabel : undefined}
            onNew={canEdit ? () => { setEditing(null); setOpen(true) } : undefined}
            rows={list.data?.data}
            isLoading={list.isLoading}
            isError={list.isError}
            onRetry={() => { void list.refetch() }}
            totalActive={totalActive.data ?? 0}
            searchValue={state.search}
            onSearchChange={state.setSearch}
            searchPlaceholder="Buscar por razão social ou cidade"
            showInactive={state.showInactive}
            onShowInactiveChange={state.setShowInactive}
            columns={columns}
            rowLabel={(r) => r.razao_social}
            onEdit={canEdit ? (r) => { setEditing(r); setOpen(true) } : undefined}
            onToggleActive={canEdit ? (r) => setConfirmRow(r) : undefined}
            onDelete={canEdit ? (r) => setDeleteRow(r) : undefined}
            onBulkToggleActive={canBulk ? async (ids, ativo) => { await bulkToggle.mutateAsync({ ids, ativo }) } : undefined}
            onBulkDelete={canBulk ? async (ids) => { await bulkDelete.mutateAsync({ ids }) } : undefined}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            page={state.page}
            pageSize={state.pageSize}
            totalCount={list.data?.count ?? 0}
            onPageChange={state.setPage}
          />
        )}
      </div>

      <ClienteForm
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        tipo={tipo}
        onSubmit={async (values) => {
          await upsert.mutateAsync({
            id: editing?.id,
            values: {
              razao_social: values.razao_social,
              endereco: values.endereco || null,
              cidade: values.cidade || null,
              uf: values.uf || null,
              latitude: values.latitude ? Number(values.latitude.replace(',', '.')) : null,
              longitude: values.longitude ? Number(values.longitude.replace(',', '.')) : null,
              observacoes: values.observacoes || null,
              ...(editing
                ? {}
                : tipo === 'minerio'
                  ? { cliente_minerio: true, cliente_retorno: false }
                  : { cliente_minerio: false, cliente_retorno: true }),
            },
          })
          setOpen(false)
        }}
      />

      <OperacionalDialog
        row={opRow}
        onOpenChange={(o) => !o && setOpRow(null)}
        onSubmit={async (values) => {
          if (!opRow) return
          await upsert.mutateAsync({
            id: opRow.id,
            values: {
              frete_cacamba: values.frete_cacamba ? Number(values.frete_cacamba.replace(',', '.')) : null,
              frete_graneleiro: values.frete_graneleiro ? Number(values.frete_graneleiro.replace(',', '.')) : null,
              liberado: values.liberado,
              aceita_cacamba: values.aceita_cacamba,
              aceita_graneleiro: values.aceita_graneleiro,
            },
          })
          setOpRow(null)
        }}
      />

      <TerminalAgendamentoDialog
        row={terminalRow}
        onOpenChange={(o) => !o && setTerminalRow(null)}
        onSubmit={async (values) => {
          if (!terminalRow) return
          await upsert.mutateAsync({ id: terminalRow.id, values })
          setTerminalRow(null)
        }}
      />

      <ConfirmDialog
        open={!!confirmRow}
        onOpenChange={(o) => !o && setConfirmRow(null)}
        title={confirmRow?.ativo ? 'Desativar cliente?' : 'Reativar cliente?'}
        description={confirmRow?.ativo
          ? 'O cliente não aparecerá nas listas ativas. É possível reativá-lo depois.'
          : 'O cliente voltará a aparecer nas listas ativas.'}
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
        title="Excluir cliente?"
        description={
          deleteRow
            ? `O cadastro de "${deleteRow.razao_social}" será removido permanentemente. Essa ação não pode ser desfeita. Se houver solicitações vinculadas, a exclusão será bloqueada.`
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

interface TabsProps {
  value: TipoCliente
  onChange: (v: TipoCliente) => void
}

function Tabs({ value, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 border-b" role="tablist" aria-label="Tipo de cliente">
      <TabButton active={value === 'minerio'} onClick={() => onChange('minerio')}>
        Carga de minério
      </TabButton>
      <TabButton active={value === 'retorno'} onClick={() => onChange('retorno')}>
        Carga de retorno
      </TabButton>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        '-mb-px border-b-2 px-3 py-2 text-body font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function ViewToggle({ value, onChange }: { value: 'lista' | 'mapa'; onChange: (v: 'lista' | 'mapa') => void }) {
  return (
    <div className="inline-flex items-center rounded-md border bg-card p-0.5" role="group" aria-label="Modo de exibição">
      <button
        type="button"
        onClick={() => onChange('lista')}
        aria-pressed={value === 'lista'}
        title="Ver em lista"
        className={cn(
          'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-body-sm font-medium transition-colors',
          value === 'lista' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <ListIcon className="h-4 w-4" />
        Lista
      </button>
      <button
        type="button"
        onClick={() => onChange('mapa')}
        aria-pressed={value === 'mapa'}
        title="Ver no mapa"
        className={cn(
          'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-body-sm font-medium transition-colors',
          value === 'mapa' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <MapIcon className="h-4 w-4" />
        Mapa
      </button>
    </div>
  )
}

interface FormProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: Row | null
  tipo: TipoCliente
  onSubmit: (values: FormValues) => Promise<void>
}

function ClienteForm({ open, onOpenChange, editing, tipo, onSubmit }: FormProps) {
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
        endereco: editing?.endereco ?? '',
        cidade: editing?.cidade ?? '',
        uf: editing?.uf ?? '',
        latitude: editing?.latitude != null ? String(editing.latitude) : '',
        longitude: editing?.longitude != null ? String(editing.longitude) : '',
        observacoes: editing?.observacoes ?? '',
      })
    }
  }, [open, editing, reset])

  const uf = watch('uf') ?? ''

  const titulo = editing
    ? 'Editar cliente'
    : tipo === 'minerio'
      ? 'Novo cliente de minério'
      : 'Novo cliente de retorno'
  const descricao = tipo === 'minerio'
    ? 'Frete e liberação são definidos na lista.'
    : 'Origem das cargas de retorno.'

  const guarda = useDescartarAlteracoes(isDirty, onOpenChange, isSubmitting)

  return (
    <>
    <Dialog open={open} onOpenChange={guarda.onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descricao}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <CadastroField label="Razão social" required id="razao_social" error={errors.razao_social?.message}>
              <Input autoFocus {...register('razao_social')} />
            </CadastroField>

            <CadastroField label="Endereço" id="endereco">
              <Input {...register('endereco')} />
            </CadastroField>

            <div className="grid grid-cols-[1fr_120px] gap-3">
              <CadastroField label="Cidade" id="cidade">
                <Input {...register('cidade')} />
              </CadastroField>
              <CadastroField label="UF" id="uf">
                <Input
                  list="uf-list"
                  value={uf}
                  onChange={(e) => setValue('uf', e.target.value.toUpperCase().slice(0, 2), { shouldValidate: true, shouldDirty: true })}
                  maxLength={2}
                />
              </CadastroField>
              <datalist id="uf-list">
                {UFS.map((u) => <option key={u} value={u} />)}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <CadastroField label="Latitude" id="latitude" error={errors.latitude?.message}>
                <Input inputMode="decimal" placeholder="-19.5563" {...register('latitude')} />
              </CadastroField>
              <CadastroField label="Longitude" id="longitude" error={errors.longitude?.message}>
                <Input inputMode="decimal" placeholder="-57.0133" {...register('longitude')} />
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

interface OperacionalDialogProps {
  row: Row | null
  onOpenChange: (o: boolean) => void
  onSubmit: (values: OperacionalValues) => Promise<void>
}

function OperacionalDialog({ row, onOpenChange, onSubmit }: OperacionalDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<OperacionalValues>({ resolver: zodResolver(operacionalSchema) })

  React.useEffect(() => {
    if (row) {
      reset({
        frete_cacamba: row.frete_cacamba != null ? String(row.frete_cacamba).replace('.', ',') : '',
        frete_graneleiro: row.frete_graneleiro != null ? String(row.frete_graneleiro).replace('.', ',') : '',
        liberado: row.liberado,
        aceita_cacamba: row.aceita_cacamba,
        aceita_graneleiro: row.aceita_graneleiro,
      })
    }
  }, [row, reset])

  const liberado = watch('liberado') ?? true
  const cacamba = watch('aceita_cacamba') ?? true
  const graneleiro = watch('aceita_graneleiro') ?? true

  const guarda = useDescartarAlteracoes(isDirty, onOpenChange, isSubmitting)

  return (
    <>
    <Dialog open={!!row} onOpenChange={guarda.onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Configurações comerciais</DialogTitle>
            <DialogDescription>
              {row?.razao_social ?? ''}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-body-sm font-medium text-muted-foreground">
                Frete por tipo de carreta (R$ por tonelada)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="frete_cacamba">Caçamba</Label>
                  <Input
                    id="frete_cacamba"
                    inputMode="decimal"
                    autoFocus
                    placeholder="Ex.: 120,50"
                    disabled={!cacamba}
                    {...register('frete_cacamba')}
                  />
                  {errors.frete_cacamba && (
                    <p role="alert" className="text-body-sm text-destructive">{errors.frete_cacamba.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="frete_graneleiro">Graneleiro</Label>
                  <Input
                    id="frete_graneleiro"
                    inputMode="decimal"
                    placeholder="Ex.: 140,00"
                    disabled={!graneleiro}
                    {...register('frete_graneleiro')}
                  />
                  {errors.frete_graneleiro && (
                    <p role="alert" className="text-body-sm text-destructive">{errors.frete_graneleiro.message}</p>
                  )}
                </div>
              </div>
              {(!cacamba || !graneleiro) && (
                <p className="text-body-sm text-muted-foreground">
                  Tipos desligados ficam indisponíveis até serem reativados abaixo.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-body-sm font-medium text-muted-foreground">
                Liberação
              </p>
              <div
                className={cn(
                  'flex h-10 items-center justify-between rounded-md border px-3',
                  liberado ? 'border-success-border bg-success-subtle' : 'border-danger-border bg-danger-subtle',
                )}
              >
                <span
                  className={cn(
                    'text-body font-medium',
                    liberado ? 'text-success' : 'text-danger',
                  )}
                >
                  {liberado ? 'Liberado para receber carregamentos' : 'Bloqueado'}
                </span>
                <Switch
                  checked={liberado}
                  onCheckedChange={(v) => setValue('liberado', v, { shouldValidate: true, shouldDirty: true })}
                  aria-label="Alternar liberação"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-body-sm font-medium text-muted-foreground">
                Tipos de carreta aceitos
              </p>
              <div className="space-y-2">
                <div className="flex h-10 items-center justify-between rounded-md border px-3">
                  <span className="text-body text-foreground">Caçamba</span>
                  <Switch
                    checked={cacamba}
                    onCheckedChange={(v) => setValue('aceita_cacamba', v, { shouldValidate: true, shouldDirty: true })}
                    aria-label="Aceita caçamba"
                  />
                </div>
                <div className="flex h-10 items-center justify-between rounded-md border px-3">
                  <span className="text-body text-foreground">Graneleiro</span>
                  <Switch
                    checked={graneleiro}
                    onCheckedChange={(v) => setValue('aceita_graneleiro', v, { shouldValidate: true, shouldDirty: true })}
                    aria-label="Aceita graneleiro"
                  />
                </div>
                {!cacamba && !graneleiro && (
                  <p className="text-body-sm text-warning">
                    Nenhum tipo selecionado: o cliente não receberá carregamentos.
                  </p>
                )}
              </div>
            </div>
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
