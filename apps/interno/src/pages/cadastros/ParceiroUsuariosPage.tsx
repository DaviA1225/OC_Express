import * as React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Pencil, Power, Trash2, UserPlus } from 'lucide-react'
import { Spinner } from '@/components/shared/Spinner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { canEditParceiros } from '@/features/auth/permissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { RotuloSituacao } from '@/components/shared/CrudListPage'
import { PageHeader } from '@/components/layout/PageHeader'
import { CadastroField } from '@/components/forms/CadastroField'
import { useDescartarAlteracoes } from '@/features/crud/useDescartarAlteracoes'
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import type { Tables, ParceiroPerfil } from '@/types/database.types'
import { traduzirErroBanco } from '@/features/crud/useCrudQueries'

type Usuario = Tables<'parceiro_usuarios'>
type Parceiro = Tables<'parceiros'>

const PERFIL_LABELS: Record<ParceiroPerfil, string> = {
  admin_parceiro: 'Administrador',
  operador_parceiro: 'Operador',
}

function useParceiro(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ['parceiro', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parceiros')
        .select('*')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return data as Parceiro | null
    },
  })
}

function useUsuariosDoParceiro(parceiroId: string | undefined) {
  return useQuery({
    enabled: !!parceiroId,
    queryKey: ['parceiro-usuarios', parceiroId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parceiro_usuarios')
        .select('*')
        .eq('parceiro_id', parceiroId!)
        .order('nome_completo', { ascending: true })
      if (error) throw error
      return (data ?? []) as Usuario[]
    },
  })
}

export default function ParceiroUsuariosPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const canEdit = canEditParceiros(profile)

  const parceiroQ = useParceiro(id)
  const usuariosQ = useUsuariosDoParceiro(id)

  const [editing, setEditing] = React.useState<Usuario | null>(null)
  const [toggleRow, setToggleRow] = React.useState<Usuario | null>(null)
  const [excluirRow, setExcluirRow] = React.useState<Usuario | null>(null)
  const [convidarOpen, setConvidarOpen] = React.useState(false)
  // Muda a cada abertura: remonta o formulário do convite vazio.
  const [convidarKey, setConvidarKey] = React.useState(0)

  const updatePerfil = useMutation({
    mutationFn: async ({ usuarioId, perfil }: { usuarioId: string; perfil: ParceiroPerfil }) => {
      const { error } = await supabase
        .from('parceiro_usuarios')
        .update({ perfil } as never)
        .eq('id', usuarioId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parceiro-usuarios', id] })
      toast.success('Perfil atualizado.')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })

  const toggleAtivo = useMutation({
    mutationFn: async ({ usuarioId, ativo }: { usuarioId: string; ativo: boolean }) => {
      const { error } = await supabase
        .from('parceiro_usuarios')
        .update({ ativo } as never)
        .eq('id', usuarioId)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['parceiro-usuarios', id] })
      toast.success(vars.ativo ? 'Usuário reativado.' : 'Usuário desativado.')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })

  const excluirUsuario = useMutation({
    mutationFn: async (usuario: Usuario) => {
      const { data, error } = await supabase.functions.invoke<{
        ok?: true; error?: string; detalhe?: string; email?: string
      }>('excluir-parceiro-usuario', {
        body: { parceiro_usuario_id: usuario.id },
      })
      if (data?.error) throw new Error(traduzirErroExclusao(data.error, data.detalhe))
      if (error) {
        const body = await extractFunctionErrorBody(error)
        if (body?.error) throw new Error(traduzirErroExclusao(body.error, body.detalhe))
        throw new Error('Não foi possível excluir o usuário. Tente novamente.')
      }
      return data
    },
    onSuccess: (data) => {
      toast.success(`Usuário ${data?.email ?? ''} excluído. E-mail liberado para novo cadastro.`)
    },
    onError: (e: Error) => toast.error(e.message),
    // Recarrega a lista mesmo no erro: a Edge Function apaga o vínculo ANTES de
    // liberar o e-mail, então `falha_ao_liberar_email` chega com a linha já
    // removida no banco — sem isto ela continuaria na tela.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['parceiro-usuarios', id] })
    },
  })

  // Loading + parceiro inexistente
  if (parceiroQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (!parceiroQ.data) {
    return (
      <div className="mx-auto max-w-md rounded-lg border bg-card p-8 text-center">
        <h2 className="text-title-sm font-semibold text-foreground">Parceiro não encontrado</h2>
        <p className="mt-1.5 text-body text-muted-foreground">
          O parceiro pode ter sido excluído ou o link está incorreto.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/cadastros/parceiros')}>
          Voltar para parceiros
        </Button>
      </div>
    )
  }

  const parceiro = parceiroQ.data
  const usuarios = usuariosQ.data ?? []

  return (
    <div className="space-y-4">
      <PageHeader
        className="mb-0"
        breadcrumb={[
          { label: 'Parceiros e acessos', to: '/cadastros/parceiros' },
          { label: parceiro.razao_social },
        ]}
        title={`Usuários · ${parceiro.razao_social}`}
        meta={
          <span className="flex items-center gap-2 text-body-sm tabular-nums text-muted-foreground">
            {usuarios.length} {usuarios.length === 1 ? 'usuário' : 'usuários'}
            {!parceiro.ativo && <RotuloSituacao tom="perigo">Parceiro inativo</RotuloSituacao>}
          </span>
        }
        actions={
          canEdit && parceiro.ativo ? (
            <Button onClick={() => { setConvidarKey((k) => k + 1); setConvidarOpen(true) }}>
              <UserPlus className="h-4 w-4" />
              Convidar usuário
            </Button>
          ) : undefined
        }
      />

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Situação</TableHead>
              {canEdit && <TableHead className="w-[150px]">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuariosQ.isLoading && (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {Array.from({ length: canEdit ? 5 : 4 }).map((_c, ci) => (
                    <TableCell key={ci}><Skeleton className="h-4 w-3/4" /></TableCell>
                  ))}
                </TableRow>
              ))
            )}

            {!usuariosQ.isLoading && usuarios.map((u) => (
              <TableRow key={u.id} className={!u.ativo ? 'text-muted-foreground' : undefined}>
                <TableCell className={u.ativo ? 'font-medium text-foreground' : 'font-medium'}>{u.nome_completo}</TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>{PERFIL_LABELS[u.perfil]}</TableCell>
                <TableCell>
                  <RotuloSituacao tom={u.ativo ? 'sucesso' : 'neutro'}>
                    {u.ativo ? 'Ativo' : 'Inativo'}
                  </RotuloSituacao>
                </TableCell>
                {canEdit && (
                  <TableCell>
                    <div className="flex items-center justify-start gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditing(u)}
                        aria-label={`Editar perfil de ${u.nome_completo}`}
                        title="Editar perfil"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setToggleRow(u)}
                        aria-label={`${u.ativo ? 'Desativar' : 'Reativar'} ${u.nome_completo}`}
                        title={u.ativo ? 'Desativar' : 'Reativar'}
                      >
                        <Power className={u.ativo ? 'h-4 w-4 text-foreground' : 'h-4 w-4 text-success'} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setExcluirRow(u)}
                        aria-label={`Excluir ${u.nome_completo}`}
                        title="Excluir definitivamente (libera o e-mail para outro parceiro)"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}

            {!usuariosQ.isLoading && usuarios.length === 0 && (
              <TableRow>
                <TableCell colSpan={canEdit ? 5 : 4} className="py-8 text-center text-body text-muted-foreground">
                  Nenhum usuário cadastrado. {canEdit && parceiro.ativo && 'Use “Convidar usuário” para enviar o primeiro convite.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ConvidarUsuarioDialog
        key={convidarKey}
        open={convidarOpen}
        onOpenChange={setConvidarOpen}
        parceiroId={parceiro.id}
        parceiroNome={parceiro.razao_social}
        onSuccess={() => qc.invalidateQueries({ queryKey: ['parceiro-usuarios', id] })}
      />

      <EditarPerfilDialog
        usuario={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onConfirm={async (perfil) => {
          if (editing) {
            await updatePerfil.mutateAsync({ usuarioId: editing.id, perfil })
            setEditing(null)
          }
        }}
      />

      <ConfirmDialog
        open={!!toggleRow}
        onOpenChange={(o) => !o && setToggleRow(null)}
        title={toggleRow?.ativo ? 'Desativar usuário?' : 'Reativar usuário?'}
        description={toggleRow?.ativo
          ? `${toggleRow?.nome_completo} perderá o acesso ao portal. É possível reativá-lo depois.`
          : `${toggleRow?.nome_completo} voltará a ter acesso ao portal.`}
        confirmLabel={toggleRow?.ativo ? 'Desativar' : 'Reativar'}
        destructive={toggleRow?.ativo}
        onConfirm={async () => {
          if (toggleRow) {
            await toggleAtivo.mutateAsync({ usuarioId: toggleRow.id, ativo: !toggleRow.ativo })
            setToggleRow(null)
          }
        }}
      />

      <ConfirmDialog
        open={!!excluirRow}
        onOpenChange={(o) => !o && setExcluirRow(null)}
        title="Excluir usuário definitivamente?"
        description={
          excluirRow
            ? `${excluirRow.nome_completo} (${excluirRow.email}) será removido para sempre. Solicitações antigas dele ficam no histórico, mas o vínculo com o usuário some. O e-mail fica livre para uso em outro parceiro. Esta ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Excluir"
        destructive
        onConfirm={async () => {
          if (excluirRow) {
            await excluirUsuario.mutateAsync(excluirRow)
            setExcluirRow(null)
          }
        }}
      />
    </div>
  )
}

function traduzirErroExclusao(code: string, detalhe?: string): string {
  switch (code) {
    case 'parceiro_usuario_id_obrigatorio': return 'Usuário alvo não informado.'
    case 'sessao_invalida': return 'Sessão expirada. Saia e entre novamente.'
    case 'forbidden': return 'Sem permissão para excluir este usuário.'
    case 'usuario_nao_encontrado': return 'Usuário não encontrado.'
    case 'nao_pode_apagar_a_si_mesmo': return 'Não é possível excluir a própria conta.'
    // O vínculo já foi removido quando este erro chega — só o e-mail continua
    // preso em auth.users, o que atrapalha apenas um reconvite dessa pessoa.
    case 'falha_ao_liberar_email':
      return `Usuário removido, mas o e-mail continua ocupado${detalhe ? `: ${detalhe}` : ''}.`
    case 'falha_no_delete': return `Não foi possível excluir${detalhe ? `: ${detalhe}` : ''}.`
    default: return detalhe || 'Erro ao excluir o usuário.'
  }
}

async function extractFunctionErrorBody(
  err: unknown,
): Promise<{ error?: string; detalhe?: string } | null> {
  try {
    const ctx = (err as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.clone().json()
      if (body && typeof body === 'object') return body as { error?: string; detalhe?: string }
    }
  } catch {
    /* ignora */
  }
  return null
}

// =====================================================================
// Editar perfil — `key={usuario.id}` no pai garante remontagem ao trocar
// de usuário, sem precisar de useEffect (set-state-in-effect).
// =====================================================================

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
          Nível de acesso de {usuario.nome_completo} ao portal.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-1.5">
        <Label htmlFor="perfil-parceiro-usuario">Perfil</Label>
        <Select value={perfil} onValueChange={(v) => setPerfil(v as ParceiroPerfil)}>
          <SelectTrigger id="perfil-parceiro-usuario"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="operador_parceiro">Operador, cria solicitações e cadastros</SelectItem>
            <SelectItem value="admin_parceiro">Administrador, também gerencia usuários</SelectItem>
          </SelectContent>
        </Select>
      </DialogBody>
      <DialogFooter className="justify-end">
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
            {saving && <Spinner />}
            Salvar
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

// =====================================================================
// Convidar usuário — invoca a Edge Function `convidar-parceiro-usuario`,
// passando o parceiro_id da rota no body (caller é interno).
// =====================================================================

interface InviteResposta {
  ok?: true
  error?: string
  detalhe?: string
}

function ConvidarUsuarioDialog({
  open,
  onOpenChange,
  parceiroId,
  parceiroNome,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  parceiroId: string
  parceiroNome: string
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
            parceiro_id: parceiroId,
          },
        },
      )
      if (data?.error) throw new Error(traduzirErroConvite(data.error, data.detalhe))
      if (error) {
        const body = await extractFunctionErrorBody(error)
        if (body?.error) throw new Error(traduzirErroConvite(body.error, body.detalhe))
        throw new Error('Não foi possível convidar o usuário. Tente novamente.')
      }
      return data
    },
    onSuccess: () => {
      toast.success(`Convite enviado para ${email}.`)
      onSuccess()
      onOpenChange(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const nomeValido = nomeCompleto.trim().length >= 2
  const podeSubmeter = emailValido && nomeValido && !convidar.isPending
  const alterado = email.trim() !== '' || nomeCompleto.trim() !== '' || perfil !== 'operador_parceiro'
  const guarda = useDescartarAlteracoes(alterado, onOpenChange, convidar.isPending)

  return (
    <>
    <Dialog open={open} onOpenChange={guarda.onOpenChange}>
      <DialogContent>
      <DialogHeader>
        <DialogTitle>Convidar usuário</DialogTitle>
        <DialogDescription>
          O convidado será vinculado à transportadora <strong>{parceiroNome}</strong> e
          receberá um e-mail com link para definir a senha e entrar no portal externo.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <CadastroField label="Nome completo" required id="convite-nome">
          <Input
            autoFocus
            value={nomeCompleto}
            onChange={(e) => setNomeCompleto(e.target.value)}
            placeholder="Ex: Ana Souza"
          />
        </CadastroField>
        <CadastroField label="E-mail" required id="convite-email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ana@transportadora.com.br"
          />
        </CadastroField>
        <CadastroField label="Perfil" required id="convite-perfil">
          {(a11y) => (
            <Select value={perfil} onValueChange={(v) => setPerfil(v as ParceiroPerfil)}>
              <SelectTrigger {...a11y}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="operador_parceiro">Operador, cria solicitações e cadastros</SelectItem>
                <SelectItem value="admin_parceiro">Administrador, também gerencia usuários</SelectItem>
              </SelectContent>
            </Select>
          )}
        </CadastroField>
      </DialogBody>
      <DialogFooter className="justify-end">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => guarda.onOpenChange(false)} disabled={convidar.isPending}>
            Cancelar
          </Button>
          <Button disabled={!podeSubmeter} onClick={() => convidar.mutate()}>
            {convidar.isPending && <Spinner />}
            Enviar convite
          </Button>
        </div>
      </DialogFooter>
      </DialogContent>
    </Dialog>
    {guarda.dialog}
    </>
  )
}

function traduzirErroConvite(code: string, detalhe?: string): string {
  switch (code) {
    case 'email_invalido': return 'E-mail inválido.'
    case 'nome_invalido': return 'Informe o nome completo (mínimo 2 caracteres).'
    case 'perfil_invalido': return 'Perfil inválido.'
    case 'sessao_invalida': return 'Sessão expirada. Saia e entre novamente.'
    case 'forbidden': return 'Sem permissão para convidar usuários.'
    case 'parceiro_id_obrigatorio': return 'Falta o parceiro alvo.'
    case 'parceiro_nao_encontrado': return 'Parceiro alvo não encontrado.'
    case 'parceiro_inativo': return 'Parceiro inativo, não é possível convidar.'
    case 'email_ja_cadastrado': return 'Este e-mail já está vinculado a um usuário do portal.'
    case 'email_inativo_existente':
      return 'Este e-mail é de um usuário desativado, reative-o em vez de convidar de novo.'
    case 'falha_no_convite': return `Não foi possível enviar o convite${detalhe ? `: ${detalhe}` : ''}.`
    case 'falha_no_insert': return 'Convite emitido, mas falhou ao salvar o vínculo. Procure o suporte.'
    default: return detalhe || 'Erro ao processar o convite.'
  }
}
