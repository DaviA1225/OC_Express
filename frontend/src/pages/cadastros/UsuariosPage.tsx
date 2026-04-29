import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Lock, Pencil, Plus, Power, Search as SearchIcon, Users, Inbox } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import type { Tables, TablesInsert, TablesUpdate, PerfilUsuario } from '@/types/database.types'

type Row = Tables<'perfis_usuarios'>

const PERFIS: { value: PerfilUsuario; label: string }[] = [
  { value: 'admin', label: 'Administrador' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'atendente', label: 'Atendente' },
  { value: 'documentacao', label: 'Documentação' },
]

const perfilLabel = (p: PerfilUsuario) => PERFIS.find((x) => x.value === p)?.label ?? p

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const schema = z.object({
  user_id: z.string().refine((v) => uuidRegex.test(v.trim()), 'UUID inválido'),
  nome_completo: z.string().min(2, 'Informe o nome completo'),
  perfil: z.enum(['admin', 'supervisor', 'atendente', 'documentacao']),
})
type FormValues = z.infer<typeof schema>

const editSchema = z.object({
  nome_completo: z.string().min(2, 'Informe o nome completo'),
  perfil: z.enum(['admin', 'supervisor', 'atendente', 'documentacao']),
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
      toast.success(vars.id ? 'Perfil atualizado' : 'Perfil criado')
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
      toast.success(v.ativo ? 'Usuário reativado' : 'Usuário desativado')
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-medium text-foreground">Usuários</h1>
          <p className="text-[12px] text-muted-foreground">
            {totalActive.data ?? 0} {(totalActive.data ?? 0) === 1 ? 'ativo' : 'ativos'}
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true) }}>
          <Plus className="h-4 w-4" />
          Novo usuário
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3">
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
          <Label htmlFor="show-inactive-users" className="text-[12px] text-muted-foreground">
            Mostrar inativos
          </Label>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead className="text-muted-foreground">User ID</TableHead>
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
                    description="Cadastre o perfil de cada usuário autorizado a usar o sistema."
                  />
                </TableCell>
              </TableRow>
            )}

            {!list.isLoading && rows?.map((row) => {
              const isSelf = currentUser?.id === row.user_id
              return (
                <TableRow key={row.id} className={cn(!row.ativo && 'opacity-60')}>
                  <TableCell>
                    {!row.ativo && <Lock className="mr-1 inline h-3 w-3 text-muted-foreground" />}
                    {row.nome_completo}
                    {isSelf && (
                      <span className="ml-2 text-[10px] uppercase tracking-[0.5px] text-muted-foreground">
                        você
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{perfilLabel(row.perfil)}</TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">
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
          ? 'O usuário não conseguirá mais acessar o sistema. Você pode reativá-lo depois.'
          : 'O usuário voltará a ter acesso ao sistema.'}
        confirmLabel={confirmRow?.ativo ? 'Sim, desativar' : 'Sim, reativar'}
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
      createForm.reset({ user_id: '', nome_completo: '', perfil: 'atendente' })
    }
  }, [open, editing, createForm, editForm])

  const submitting = isEditing ? editForm.formState.isSubmitting : createForm.formState.isSubmitting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          noValidate
          onSubmit={isEditing ? editForm.handleSubmit(onUpdate) : createForm.handleSubmit(onCreate)}
        >
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Editar usuário' : 'Novo usuário'}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Altere o nome ou o nível de acesso deste usuário.'
                : 'O usuário precisa ter sido criado antes no painel do Supabase. Cole aqui o UUID dele para liberar o acesso.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {!isEditing && (
              <div className="space-y-1.5">
                <Label htmlFor="user_id">User ID (UUID) *</Label>
                <Input
                  id="user_id"
                  placeholder="00000000-0000-0000-0000-000000000000"
                  className="font-mono text-[12px]"
                  {...createForm.register('user_id')}
                />
                {createForm.formState.errors.user_id && (
                  <p className="text-[11px] text-destructive">
                    {createForm.formState.errors.user_id.message}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Encontre o UUID em Authentication › Users no painel do Supabase, depois de criar o usuário lá.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="nome_completo">Nome completo *</Label>
              <Input
                id="nome_completo"
                autoFocus={isEditing}
                {...(isEditing
                  ? editForm.register('nome_completo')
                  : createForm.register('nome_completo'))}
              />
              {(isEditing
                ? editForm.formState.errors.nome_completo
                : createForm.formState.errors.nome_completo) && (
                <p className="text-[11px] text-destructive">
                  {(isEditing
                    ? editForm.formState.errors.nome_completo?.message
                    : createForm.formState.errors.nome_completo?.message)}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Perfil *</Label>
              <Select
                value={isEditing ? editForm.watch('perfil') : createForm.watch('perfil')}
                onValueChange={(v) => {
                  const value = v as PerfilUsuario
                  if (isEditing) editForm.setValue('perfil', value, { shouldValidate: true })
                  else createForm.setValue('perfil', value, { shouldValidate: true })
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar perfil" />
                </SelectTrigger>
                <SelectContent>
                  {PERFIS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DialogBody>
          <DialogFooter>
            <span className="text-[11px] text-muted-foreground/80">
              Enter para salvar · Esc para cancelar
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
