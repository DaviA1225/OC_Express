import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Lock, Pencil, Plus, Power, Search as SearchIcon, Users, Inbox } from 'lucide-react'
import { Spinner } from '@/components/shared/Spinner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useDebounce } from '@/hooks/useDebounce'
import { traduzirErroBanco } from '@/features/crud/useCrudQueries'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { useAuth } from '@/hooks/useAuth'
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
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { CadastroField } from '@/components/forms/CadastroField'
import { PERFIL_LABELS, labelPerfil } from '@/features/auth/perfis'
import { useDescartarAlteracoes } from '@/features/crud/useDescartarAlteracoes'
import { cn } from '@/lib/utils'
import type { Tables, TablesInsert, TablesUpdate, PerfilUsuario } from '@/types/database.types'

type Row = Tables<'perfis_usuarios'>

const PERFIS = Object.entries(PERFIL_LABELS).map(([value, label]) => ({ value: value as PerfilUsuario, label }))

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const schema = z.object({
  user_id: z.string().refine((v) => uuidRegex.test(v.trim()), 'Identificador inválido'),
  nome_completo: z.string().min(2, 'Informe o nome completo'),
  perfil: z.enum(['admin', 'gerente', 'supervisor', 'analista', 'assistente', 'painel_tv']),
})
type FormValues = z.infer<typeof schema>

const editSchema = z.object({
  nome_completo: z.string().min(2, 'Informe o nome completo'),
  perfil: z.enum(['admin', 'gerente', 'supervisor', 'analista', 'assistente', 'painel_tv']),
})
type EditFormValues = z.infer<typeof editSchema>

export default function UsuariosPage() {
  const [search, setSearch] = React.useState('')
  const [showInactive, setShowInactive] = React.useState(false)
  const [perfilFiltro, setPerfilFiltro] = React.useState<'todos' | PerfilUsuario>('todos')
  const debouncedSearch = useDebounce(search, 300)

  const list = useQuery({
    queryKey: ['perfis_usuarios', { debouncedSearch, showInactive, perfilFiltro }],
    queryFn: async () => {
      let q = supabase.from('perfis_usuarios').select('*').order('nome_completo', { ascending: true })
      if (!showInactive) q = q.eq('ativo', true)
      if (perfilFiltro !== 'todos') q = q.eq('perfil', perfilFiltro)
      if (debouncedSearch.trim()) {
        const t = debouncedSearch.trim().replace(/[%_]/g, '\\$&')
        q = q.ilike('nome_completo', `%${t}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Row[]
    },
  })

  const totalActive = useQuery({
    queryKey: ['perfis_usuarios-active-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('perfis_usuarios')
        .select('id', { count: 'exact', head: true })
        .eq('ativo', true)
      if (error) throw error
      return count ?? 0
    },
  })

  const qc = useQueryClient()
  const upsert = useMutation({
    mutationFn: async (input: { id?: string; values: TablesInsert<'perfis_usuarios'> | TablesUpdate<'perfis_usuarios'> }) => {
      if (input.id) {
        const { error } = await supabase
          .from('perfis_usuarios')
          .update(input.values as never)
          .eq('id', input.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('perfis_usuarios').insert(input.values as never)
        if (error) throw error
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['perfis_usuarios'] })
      qc.invalidateQueries({ queryKey: ['perfis_usuarios-active-count'] })
      toast.success(vars.id ? 'Usuário atualizado.' : 'Usuário cadastrado.')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })

  const toggle = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from('perfis_usuarios')
        .update({ ativo } as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['perfis_usuarios'] })
      qc.invalidateQueries({ queryKey: ['perfis_usuarios-active-count'] })
      toast.success(v.ativo ? 'Usuário reativado.' : 'Usuário desativado.')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })

  const { user: currentUser } = useAuth()
  const [editing, setEditing] = React.useState<Row | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmRow, setConfirmRow] = React.useState<Row | null>(null)

  const rows = list.data

  return (
    <div className="space-y-4">
      <PageHeader
        className="mb-0"
        title="Usuários"
        meta={
          <span className="text-body-sm tabular-nums text-muted-foreground">
            {totalActive.data ?? 0} {(totalActive.data ?? 0) === 1 ? 'ativo' : 'ativos'}
          </span>
        }
        actions={
          <Button onClick={() => { setEditing(null); setOpen(true) }}>
            <Plus className="h-4 w-4" />
            Novo usuário
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
        <div className="relative flex-1 min-w-[220px]">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pelo nome"
            className="pl-9"
          />
        </div>
        <Select value={perfilFiltro} onValueChange={(v) => setPerfilFiltro(v as typeof perfilFiltro)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os perfis</SelectItem>
            {PERFIS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="show-inactive-users" checked={showInactive} onCheckedChange={setShowInactive} />
          <Label htmlFor="show-inactive-users" className="text-body-sm text-muted-foreground">
            Mostrar inativos
          </Label>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Identificador</TableHead>
              <TableHead className="w-[110px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`sk-${i}`}>
                <TableCell><Skeleton className="h-4 w-3/4" /></TableCell>
                <TableCell><Skeleton className="h-4 w-1/2" /></TableCell>
                <TableCell><Skeleton className="h-4 w-2/3" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
              </TableRow>
            ))}

            {!list.isLoading && rows && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-0">
                  <EmptyState
                    icon={Users}
                    title="Nenhum usuário cadastrado"
                    description="Cada usuário autorizado a usar o sistema precisa de um perfil."
                  />
                </TableCell>
              </TableRow>
            )}

            {!list.isLoading && rows?.map((row) => {
              const isSelf = currentUser?.id === row.user_id
              return (
                <TableRow key={row.id} className={cn(!row.ativo && 'text-muted-foreground')}>
                  <TableCell>
                    {!row.ativo && <Lock className="mr-1 inline h-3 w-3 text-tertiary" aria-label="Inativo" />}
                    {row.nome_completo}
                    {isSelf && (
                      <span className="ml-2 text-meta text-muted-foreground">(você)</span>
                    )}
                  </TableCell>
                  <TableCell>{labelPerfil(row.perfil)}</TableCell>
                  <TableCell className="font-mono text-meta text-muted-foreground">
                    {row.user_id}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setEditing(row); setOpen(true) }}
                        aria-label={`Editar ${row.nome_completo}`}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmRow(row)}
                        aria-label={row.ativo ? 'Desativar' : 'Reativar'}
                        title={row.ativo ? 'Desativar' : 'Reativar'}
                        disabled={isSelf}
                      >
                        <Power className={cn('h-4 w-4', row.ativo ? 'text-foreground' : 'text-success')} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}

            {!list.isLoading && !rows && (
              <TableRow>
                <TableCell colSpan={4} className="py-0">
                  <EmptyState icon={Inbox} title="Não foi possível carregar" />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <UsuarioForm
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onCreate={async (values) => {
          await upsert.mutateAsync({
            values: {
              user_id: values.user_id.trim(),
              nome_completo: values.nome_completo.trim(),
              perfil: values.perfil,
              ativo: true,
            },
          })
          setOpen(false)
        }}
        onUpdate={async (values) => {
          if (!editing) return
          await upsert.mutateAsync({
            id: editing.id,
            values: {
              nome_completo: values.nome_completo.trim(),
              perfil: values.perfil,
            },
          })
          setOpen(false)
        }}
      />

      <ConfirmDialog
        open={!!confirmRow}
        onOpenChange={(o) => !o && setConfirmRow(null)}
        title={confirmRow?.ativo ? 'Desativar usuário?' : 'Reativar usuário?'}
        description={confirmRow?.ativo
          ? 'O usuário perde o acesso ao sistema. É possível reativá-lo depois.'
          : 'O usuário voltará a ter acesso ao sistema.'}
        confirmLabel={confirmRow?.ativo ? 'Desativar' : 'Reativar'}
        destructive={confirmRow?.ativo}
        onConfirm={async () => {
          if (confirmRow) {
            await toggle.mutateAsync({ id: confirmRow.id, ativo: !confirmRow.ativo })
            setConfirmRow(null)
          }
        }}
      />
    </div>
  )
}

interface FormProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: Row | null
  onCreate: (v: FormValues) => Promise<void>
  onUpdate: (v: EditFormValues) => Promise<void>
}

function UsuarioForm({ open, onOpenChange, editing, onCreate, onUpdate }: FormProps) {
  const isEditing = !!editing

  const createForm = useForm<FormValues>({ resolver: zodResolver(schema) })
  const editForm = useForm<EditFormValues>({ resolver: zodResolver(editSchema) })

  React.useEffect(() => {
    if (!open) return
    if (editing) {
      editForm.reset({
        nome_completo: editing.nome_completo,
        perfil: editing.perfil,
      })
    } else {
      createForm.reset({ user_id: '', nome_completo: '', perfil: 'assistente' })
    }
  }, [open, editing, createForm, editForm])

  const submitting = isEditing ? editForm.formState.isSubmitting : createForm.formState.isSubmitting
  const dirty = isEditing ? editForm.formState.isDirty : createForm.formState.isDirty
  const guarda = useDescartarAlteracoes(dirty, onOpenChange, submitting)

  return (
    <>
    <Dialog open={open} onOpenChange={guarda.onOpenChange}>
      <DialogContent>
        <form
          noValidate
          onSubmit={isEditing ? editForm.handleSubmit(onUpdate) : createForm.handleSubmit(onCreate)}
        >
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Editar usuário' : 'Novo usuário'}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Nome e nível de acesso do usuário.'
                : 'O acesso é liberado para uma conta que já existe no painel de autenticação. Informe o identificador dessa conta.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {!isEditing && (
              <CadastroField
                label="Identificador do usuário"
                required
                id="user_id"
                error={createForm.formState.errors.user_id?.message}
                hint="Fica em Authentication › Users, no painel do Supabase, depois que a conta é criada lá."
              >
                <Input
                  placeholder="00000000-0000-0000-0000-000000000000"
                  className="font-mono text-body-sm"
                  {...createForm.register('user_id')}
                />
              </CadastroField>
            )}

            <CadastroField
              label="Nome completo"
              required
              id="nome_completo"
              error={isEditing
                ? editForm.formState.errors.nome_completo?.message
                : createForm.formState.errors.nome_completo?.message}
            >
              <Input
                autoFocus={isEditing}
                {...(isEditing
                  ? editForm.register('nome_completo')
                  : createForm.register('nome_completo'))}
              />
            </CadastroField>

            <CadastroField
              label="Perfil"
              required
              id="perfil_usuario"
              hint={(isEditing ? editForm.watch('perfil') : createForm.watch('perfil')) === 'painel_tv'
                ? 'Só abre o Modo TV e não vê cadastros nem solicitações. A sessão não expira por inatividade. Use uma conta por TV: sair em qualquer lugar desconecta todas as telas dessa conta.'
                : undefined}
            >
              {(a11y) => (
              <Select
                value={isEditing ? editForm.watch('perfil') : createForm.watch('perfil')}
                onValueChange={(v) => {
                  const value = v as PerfilUsuario
                  if (isEditing) editForm.setValue('perfil', value, { shouldValidate: true, shouldDirty: true })
                  else createForm.setValue('perfil', value, { shouldValidate: true, shouldDirty: true })
                }}
              >
                <SelectTrigger {...a11y}>
                  <SelectValue placeholder="Selecionar perfil" />
                </SelectTrigger>
                <SelectContent>
                  {PERFIS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              )}
            </CadastroField>
          </DialogBody>
          <DialogFooter className="justify-end">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => guarda.onOpenChange(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Spinner />}
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
