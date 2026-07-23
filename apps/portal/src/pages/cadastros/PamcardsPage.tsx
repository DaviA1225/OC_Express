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
import { formatarPamcardParaExibicao } from '@sislog/shared/formatters'
import type { Tables } from '@sislog/shared/types'

type Row = Tables<'parceiro_pamcards'>

const schema = z.object({
  numero: z
    .string()
    .min(1, 'Informe o número do cartão')
    .refine((v) => /^\d+$/.test(v.replace(/\s/g, '')), 'O Pamcard deve conter apenas números')
    .refine((v) => v.replace(/\s/g, '').length >= 10, 'O Pamcard deve ter no mínimo 10 dígitos')
    .refine((v) => v.replace(/\s/g, '').length <= 16, 'O Pamcard deve ter no máximo 16 dígitos'),
  apelido: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export default function PamcardsPage() {
  const { parceiro } = useAuth()
  const parceiroId = parceiro?.id ?? null
  const state = useCrudListState()
  const list = useParceiroCrudList('parceiro_pamcards', {
    search: state.debouncedSearch,
    showInactive: state.showInactive,
    page: state.page,
    pageSize: state.pageSize,
    searchColumns: ['numero', 'apelido'],
    orderBy: 'numero',
    ascending: true,
  })
  const totalActive = useParceiroActiveCount('parceiro_pamcards')
  const upsert = useUpsertParceiroRow('parceiro_pamcards', 'Cartão', parceiroId)
  const toggle = useToggleParceiroActive('parceiro_pamcards', 'Cartão')
  const remove = useDeleteParceiroRow('parceiro_pamcards', 'Cartão')

  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)
  const [deleteRow, setDeleteRow] = React.useState<Row | null>(null)

  const columns: ColumnDef<Row>[] = [
    { header: 'Apelido', accessor: (r) => r.apelido ?? '—' },
    {
      header: 'Número',
      accessor: (r) => formatarPamcardParaExibicao(r.numero),
      className: 'text-muted-foreground tabular-nums',
    },
  ]

  return (
    <>
      <CrudListPage<Row>
        title="Cartões Pamcard"
        newButtonLabel="Novo cartão"
        onNew={() => { setEditing(null); setOpen(true) }}
        rows={list.data?.data}
        isLoading={list.isLoading}
        totalActive={totalActive.data ?? 0}
        searchValue={state.search}
        onSearchChange={state.setSearch}
        searchPlaceholder="Buscar por número ou apelido"
        showInactive={state.showInactive}
        onShowInactiveChange={state.setShowInactive}
        columns={columns}
        rowLabel={(r) => r.apelido ?? formatarPamcardParaExibicao(r.numero)}
        onEdit={(r) => { setEditing(r); setOpen(true) }}
        onToggleActive={(r) => setConfirmRow(r)}
        onDelete={(r) => setDeleteRow(r)}
        emptyTitle="Nenhum cartão cadastrado"
        emptyDescription="Cadastre os cartões Pamcard da sua operação para selecioná-los nas solicitações."
        page={state.page}
        pageSize={state.pageSize}
        totalCount={list.data?.count ?? 0}
        onPageChange={state.setPage}
      />

      <PamcardForm
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSubmit={async (values) => {
          await upsert.mutateAsync({
            id: editing?.id,
            values: {
              numero: values.numero.replace(/\s/g, ''),
              apelido: values.apelido?.trim() || null,
            },
          })
          setOpen(false)
        }}
      />

      <ConfirmDialog
        open={!!confirmRow}
        onOpenChange={(o) => !o && setConfirmRow(null)}
        title={confirmRow?.ativo ? 'Desativar cartão?' : 'Reativar cartão?'}
        description={confirmRow?.ativo
          ? 'O cartão não aparecerá na seleção de novas solicitações. Você pode reativá-lo depois.'
          : 'O cartão voltará a aparecer na seleção de novas solicitações.'}
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
        title="Excluir cartão?"
        description={
          deleteRow
            ? `O cartão "${deleteRow.apelido ?? formatarPamcardParaExibicao(deleteRow.numero)}" será removido permanentemente. As solicitações já enviadas com esse número não são afetadas.`
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

function PamcardForm({ open, onOpenChange, editing, onSubmit }: FormProps) {
  const {
    register, handleSubmit, reset, setValue, watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (open) {
      reset({
        numero: editing?.numero ?? '',
        apelido: editing?.apelido ?? '',
      })
    }
  }, [open, editing, reset])

  const numero = watch('numero') ?? ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar cartão' : 'Novo cartão'}</DialogTitle>
            <DialogDescription>
              Cartões Pamcard da sua operação, disponíveis para selecionar nas solicitações de carregamento.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="numero">Número do cartão *</Label>
              <Input
                id="numero"
                autoFocus
                value={numero}
                onChange={(e) => setValue('numero', e.target.value.replace(/\D/g, '').slice(0, 16), { shouldValidate: true })}
                placeholder="Ex.: 441781209999"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={16}
              />
              {errors.numero && <p className="text-[11px] text-destructive">{errors.numero.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apelido">Apelido</Label>
              <Input id="apelido" {...register('apelido')} placeholder="Opcional, ex.: Cartão João, Cofre 1" />
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
