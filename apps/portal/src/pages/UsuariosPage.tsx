import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, ShieldAlert, UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth, hasPerfilParceiro } from '@/hooks/useAuth'
import { traduzirErroBanco } from '@/features/cadastros/useParceiroCrud'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import type { Tables, ParceiroPerfil } from '@sislog/shared/types'

type Usuario = Tables<'parceiro_usuarios'>

const PERFIL_LABELS: Record<ParceiroPerfil, string> = {
  admin_parceiro: 'Administrador',
  operador_parceiro: 'Operador',
}

function useUsuariosParceiro() {
  return useQuery({
    queryKey: ['parceiro-usuarios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parceiro_usuarios')
        .select('*')
        .order('nome_completo', { ascending: true })
      if (error) throw error
      return (data ?? []) as Usuario[]
    },
  })
}

export default function UsuariosPage() {
  const { parceiroUsuario } = useAuth()
  const isAdmin = hasPerfilParceiro(parceiroUsuario, 'admin_parceiro')
  const qc = useQueryClient()
  const list = useUsuariosParceiro()

  const [editing, setEditing] = React.useState<Usuario | null>(null)
  const [toggleRow, setToggleRow] = React.useState<Usuario | null>(null)
  const [convidarOpen, setConvidarOpen] = React.useState(false)

  const updatePerfil = useMutation({
    mutationFn: async ({ id, perfil }: { id: string; perfil: ParceiroPerfil }) => {
      const { error } = await supabase
        .from('parceiro_usuarios')
        .update({ perfil } as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parceiro-usuarios'] })
      toast.success('Perfil atualizado')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })

  const toggleAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from('parceiro_usuarios')
        .update({ ativo } as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['parceiro-usuarios'] })
      toast.success(vars.ativo ? 'Usuário reativado' : 'Usuário desativado')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })

  if (!isAdmin) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center rounded-lg border bg-background p-8 text-center">
        <ShieldAlert className="mb-3 h-9 w-9 text-muted-foreground/60" strokeWidth={1.5} />
        <h2 className="text-[15px] font-semibold text-foreground">Acesso restrito</h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Apenas administradores da transportadora podem gerenciar usuários.
        </p>
      </div>
    )
  }

  const usuarios = list.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Usuários</h1>
          <p className="text-[12px] text-muted-foreground">
            {usuarios.length} {usuarios.length === 1 ? 'usuário' : 'usuários'} da transportadora
          </p>
        </div>
        <Button onClick={() => setConvidarOpen(true)} className="gap-1.5">
          <UserPlus className="h-4 w-4" />
          Convidar usuário
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-[180px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {Array.from({ length: 5 }).map((_c, ci) => (
                    <TableCell key={ci}><Skeleton className="h-4 w-3/4" /></TableCell>
                  ))}
                </TableRow>
              ))
            )}

            {!list.isLoading && usuarios.map((u) => {
              const isSelf = u.id === parceiroUsuario?.id
              return (
                <TableRow key={u.id} className={!u.ativo ? 'opacity-60' : undefined}>
                  <TableCell className="font-medium text-foreground">
                    {u.nome_completo}
                    {isSelf && <span className="ml-1.5 text-[11px] text-muted-foreground">(você)</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>{PERFIL_LABELS[u.perfil]}</TableCell>
                  <TableCell>
                    <span
                      className={
                        u.ativo
                          ? 'inline-flex rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success'
                          : 'inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground'
                      }
                    >
                      {u.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {isSelf ? (
                      <span className="text-[12px] text-muted-foreground">—</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>
                          Editar perfil
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToggleRow(u)}
                          className={u.ativo ? 'text-destructive hover:text-destructive' : undefined}
                        >
                          {u.ativo ? 'Desativar' : 'Reativar'}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}

            {!list.isLoading && usuarios.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-[13px] text-muted-foreground">
                  Nenhum usuário encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ConvidarUsuarioDialog
        open={convidarOpen}
        onOpenChange={setConvidarOpen}
        onSuccess={() => qc.invalidateQueries({ queryKey: ['parceiro-usuarios'] })}
      />

      <EditarPerfilDialog
        usuario={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onConfirm={async (perfil) => {
          if (editing) {
            await updatePerfil.mutateAsync({ id: editing.id, perfil })
            setEditing(null)
          }
        }}
      />

      <ConfirmDialog
        open={!!toggleRow}
        onOpenChange={(o) => !o && setToggleRow(null)}
        title={toggleRow?.ativo ? 'Desativar usuário?' : 'Reativar usuário?'}
        description={toggleRow?.ativo
          ? `${toggleRow?.nome_completo} perderá o acesso ao portal. Você pode reativá-lo depois.`
          : `${toggleRow?.nome_completo} voltará a ter acesso ao portal.`}
        confirmLabel={toggleRow?.ativo ? 'Sim, desativar' : 'Sim, reativar'}
        destructive={toggleRow?.ativo}
        onConfirm={async () => {
          if (toggleRow) {
            await toggleAtivo.mutateAsync({ id: toggleRow.id, ativo: !toggleRow.ativo })
            setToggleRow(null)
          }
        }}
      />
    </div>
  )
}

function EditarPerfilDialog({
  usuario,
  onOpenChange,
  onConfirm,
}: {
  usuario: Usuario | null
  onOpenChange: (o: boolean) => void
  onConfirm: (perfil: ParceiroPerfil) => Promise<void>
}) {
  return (
    <Dialog open={!!usuario} onOpenChange={onOpenChange}>
      <DialogContent>
        {usuario && (
          <EditarPerfilForm
            key={usuario.id}
            usuario={usuario}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// `key={usuario.id}` no pai garante remontagem ao trocar de usuário —
// o estado inicial vem da prop sem precisar de useEffect (evita
// react-hooks/set-state-in-effect).
function EditarPerfilForm({
  usuario,
  onCancel,
  onConfirm,
}: {
  usuario: Usuario
  onCancel: () => void
  onConfirm: (perfil: ParceiroPerfil) => Promise<void>
}) {
  const [perfil, setPerfil] = React.useState<ParceiroPerfil>(usuario.perfil)
  const [saving, setSaving] = React.useState(false)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar perfil</DialogTitle>
        <DialogDescription>
          {usuario.nome_completo} — defina o nível de acesso ao portal.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-1.5">
        <Label htmlFor="perfil">Perfil</Label>
        <Select value={perfil} onValueChange={(v) => setPerfil(v as ParceiroPerfil)}>
          <SelectTrigger id="perfil"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="operador_parceiro">Operador — cria solicitações e cadastros</SelectItem>
            <SelectItem value="admin_parceiro">Administrador — também gerencia usuários</SelectItem>
          </SelectContent>
        </Select>
      </DialogBody>
      <DialogFooter>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              try {
                await onConfirm(perfil)
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

// =====================================================================
// Convite — invoca a Edge Function `convidar-parceiro-usuario`.
// O parceiro_id é derivado pela própria função a partir do JWT do caller
// (admin_parceiro), então o body só carrega email, nome e perfil.
// =====================================================================

interface InviteResposta {
  ok?: true
  error?: string
  detalhe?: string
}

function ConvidarUsuarioDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSuccess: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <ConvidarForm onCancel={() => onOpenChange(false)} onSuccess={onSuccess} />}
      </DialogContent>
    </Dialog>
  )
}

function ConvidarForm({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void
  onSuccess: () => void
}) {
  const [email, setEmail] = React.useState('')
  const [nomeCompleto, setNomeCompleto] = React.useState('')
  const [perfil, setPerfil] = React.useState<ParceiroPerfil>('operador_parceiro')

  const convidar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<InviteResposta>(
        'convidar-parceiro-usuario',
        {
          body: {
            email: email.trim().toLowerCase(),
            nome_completo: nomeCompleto.trim(),
            perfil,
          },
        },
      )
      // Functions.invoke devolve o body em `data` mesmo em erros 4xx/5xx quando
      // o servidor responde JSON; checamos o campo `error` antes do erro de rede.
      if (data?.error) throw new Error(traduzirErroConvite(data.error, data.detalhe))
      if (error) throw new Error(error.message || 'Falha ao convidar usuário')
      return data
    },
    onSuccess: () => {
      toast.success(`Convite enviado para ${email}`)
      onSuccess()
      onCancel()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const nomeValido = nomeCompleto.trim().length >= 2
  const podeSubmeter = emailValido && nomeValido && !convidar.isPending

  return (
    <>
      <DialogHeader>
        <DialogTitle>Convidar usuário</DialogTitle>
        <DialogDescription>
          O convidado vai receber um e-mail com link para definir a senha e entrar no portal.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="convite-nome">Nome completo *</Label>
          <Input
            id="convite-nome"
            autoFocus
            value={nomeCompleto}
            onChange={(e) => setNomeCompleto(e.target.value)}
            placeholder="Ex: Ana Souza"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="convite-email">E-mail *</Label>
          <Input
            id="convite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ana@transportadora.com.br"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="convite-perfil">Perfil *</Label>
          <Select value={perfil} onValueChange={(v) => setPerfil(v as ParceiroPerfil)}>
            <SelectTrigger id="convite-perfil"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="operador_parceiro">Operador — cria solicitações e cadastros</SelectItem>
              <SelectItem value="admin_parceiro">Administrador — também gerencia usuários</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </DialogBody>
      <DialogFooter>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCancel} disabled={convidar.isPending}>
            Cancelar
          </Button>
          <Button disabled={!podeSubmeter} onClick={() => convidar.mutate()}>
            {convidar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar convite
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

function traduzirErroConvite(code: string, detalhe?: string): string {
  switch (code) {
    case 'email_invalido': return 'E-mail inválido.'
    case 'nome_invalido': return 'Informe o nome completo (mínimo 2 caracteres).'
    case 'perfil_invalido': return 'Perfil inválido.'
    case 'sessao_invalida': return 'Sua sessão expirou. Saia e entre de novo.'
    case 'forbidden': return 'Você não tem permissão para convidar usuários.'
    case 'parceiro_nao_encontrado': return 'Parceiro alvo não encontrado.'
    case 'parceiro_inativo': return 'Parceiro inativo — não é possível convidar.'
    case 'email_ja_cadastrado': return 'Este e-mail já está vinculado a um usuário do portal.'
    case 'email_inativo_existente':
      return 'Este e-mail é de um usuário desativado — reative-o em vez de convidar de novo.'
    case 'falha_no_convite': return `Não foi possível enviar o convite${detalhe ? `: ${detalhe}` : ''}.`
    case 'falha_no_insert': return 'Convite emitido, mas falhou ao salvar o vínculo. Procure o suporte.'
    default: return detalhe || 'Erro ao processar o convite.'
  }
}
