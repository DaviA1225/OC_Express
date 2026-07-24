import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Mail, Shield, ShieldCheck, User as UserIcon, Eye, EyeOff, Check } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { traduzirErroBanco } from '@/features/crud/useCrudQueries'
import {
  listVerifiedTotp, enrollTotp, verifyTotp, unenroll, traduzirErroMfa, type EnrollResult,
} from '@/features/auth/mfa'
import { cn } from '@/lib/utils'
import type { PerfilUsuario } from '@/types/database.types'

const PERFIL_LABEL: Record<PerfilUsuario, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  supervisor: 'Supervisor',
  analista: 'Analista',
  assistente: 'Assistente',
}

const PERFIL_CLASSES: Record<PerfilUsuario, string> = {
  admin: 'cat-clay',
  gerente: 'cat-ink',
  supervisor: 'cat-steel',
  analista: 'cat-brass',
  assistente: 'bg-muted text-muted-foreground',
}

const nomeSchema = z.object({
  nome_completo: z.string().min(2, 'Informe o nome completo'),
})
type NomeForm = z.infer<typeof nomeSchema>

const senhaSchema = z
  .object({
    nova: z.string().min(12, 'Use pelo menos 12 caracteres'),
    confirmar: z.string().min(12, 'Use pelo menos 12 caracteres'),
  })
  .refine((d) => d.nova === d.confirmar, {
    message: 'As senhas não coincidem',
    path: ['confirmar'],
  })
type SenhaForm = z.infer<typeof senhaSchema>

export default function PerfilPage() {
  const { profile, user, loading, refreshProfile } = useAuth()

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Meu perfil</h1>
        <p className="text-[12px] text-muted-foreground">
          Gerencie seus dados pessoais e segurança da conta.
        </p>
      </div>

      <PerfilHeader />

      <InformacoesCard
        nomeAtual={profile?.nome_completo ?? ''}
        onSaved={refreshProfile}
      />

      <SegurancaCard email={user?.email ?? ''} />

      <TwoFactorCard />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Verificação em duas etapas (TOTP). Opt-in: o usuário ativa quando quiser.
// Depois de ativo, o login passa a exigir o código (gate no ProtectedRoute).
// ---------------------------------------------------------------------------
function TwoFactorCard() {
  const qc = useQueryClient()
  const { data: factors, isLoading } = useQuery({
    queryKey: ['mfa-factors'],
    queryFn: listVerifiedTotp,
    staleTime: 0,
  })
  const ativo = (factors?.length ?? 0) > 0

  // Estado do fluxo de ativação: null = idle; senão, o QR/secret pendentes.
  const [enroll, setEnroll] = React.useState<EnrollResult | null>(null)
  const [code, setCode] = React.useState('')
  const [erro, setErro] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const iniciar = async () => {
    setBusy(true); setErro(null)
    try {
      setEnroll(await enrollTotp())
      setCode('')
    } catch (e) {
      setErro(traduzirErroMfa(e))
    } finally {
      setBusy(false)
    }
  }

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!enroll || code.trim().length < 6) return
    setBusy(true); setErro(null)
    try {
      await verifyTotp(enroll.factorId, code)
      setEnroll(null); setCode('')
      await qc.invalidateQueries({ queryKey: ['mfa-factors'] })
      toast.success('Verificação em duas etapas ativada.')
    } catch (err) {
      setErro(traduzirErroMfa(err)); setCode('')
    } finally {
      setBusy(false)
    }
  }

  const cancelar = async () => {
    // O fator não verificado é limpo no próximo enroll; aqui só fecha o fluxo.
    setEnroll(null); setCode(''); setErro(null)
  }

  const desativar = async () => {
    if (!factors?.length) return
    setBusy(true); setErro(null)
    try {
      for (const f of factors) await unenroll(f.id)
      await qc.invalidateQueries({ queryKey: ['mfa-factors'] })
      toast.success('Verificação em duas etapas desativada.')
    } catch (err) {
      toast.error(traduzirErroMfa(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      icon={<ShieldCheck className="h-4 w-4" />}
      title="Verificação em duas etapas"
      subtitle="Um código do app autenticador, além da senha, no login."
    >
      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : enroll ? (
        <form onSubmit={confirmar} className="space-y-4" noValidate>
          <p className="text-[13px] text-muted-foreground">
            Escaneie o QR no seu app autenticador (Google Authenticator, Authy, 1Password…) e
            digite o código de 6 dígitos para confirmar.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div
              className="h-40 w-40 shrink-0 rounded-md border bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
              // QR vem do Supabase como SVG inline (origem confiável, self-contained).
              dangerouslySetInnerHTML={{ __html: enroll.qrSvg }}
            />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <Label className="text-[11px]">Ou digite a chave manualmente</Label>
                <code className="mt-1 block break-all rounded bg-muted px-2 py-1.5 text-[12px] tabular-nums text-foreground">
                  {enroll.secret}
                </code>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mfa-code">Código de verificação</Label>
                <Input
                  id="mfa-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="max-w-[160px] text-center text-[16px] tracking-[0.3em] tabular-nums"
                />
                {erro && <p className="text-[11px] text-destructive">{erro}</p>}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={cancelar} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || code.length < 6}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Ativar
            </Button>
          </div>
        </form>
      ) : ativo ? (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success">
              <Check className="h-3.5 w-3.5" />
            </span>
            <span className="text-foreground">Ativa. Seu login pede o código do app.</span>
          </div>
          <Button variant="outline" onClick={desativar} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Desativar
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="text-[13px] text-muted-foreground">
            Não ativada. Recomendada para proteger sua conta contra acesso indevido.
          </p>
          <Button onClick={iniciar} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Ativar 2FA
          </Button>
        </div>
      )}
    </Card>
  )
}

function PerfilHeader() {
  const { profile, user } = useAuth()
  const nome = profile?.nome_completo ?? user?.email ?? 'Usuário'
  const inicial = nome.trim().charAt(0).toUpperCase() || '?'
  return (
    <section className="flex items-center gap-4 rounded-lg border bg-card p-4">
      <Avatar className="h-14 w-14">
        <AvatarFallback className="text-[18px]">{inicial}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-medium text-foreground">{nome}</p>
        <p className="truncate text-[12px] text-muted-foreground">{user?.email}</p>
        {profile && (
          <span
            className={cn(
              'mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
              PERFIL_CLASSES[profile.perfil],
            )}
          >
            {PERFIL_LABEL[profile.perfil]}
          </span>
        )}
      </div>
      {profile?.created_at && (
        <div className="hidden text-right md:block">
          <p className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground">Cadastrado em</p>
          <p className="text-[12px] text-foreground">
            {format(new Date(profile.created_at), 'dd/MM/yyyy', { locale: ptBR })}
          </p>
        </div>
      )}
    </section>
  )
}

interface InformacoesProps {
  nomeAtual: string
  onSaved: () => Promise<void>
}

function InformacoesCard({ nomeAtual, onSaved }: InformacoesProps) {
  const { user } = useAuth()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<NomeForm>({
    resolver: zodResolver(nomeSchema),
    defaultValues: { nome_completo: nomeAtual },
  })

  const [lastNome, setLastNome] = React.useState(nomeAtual)
  if (lastNome !== nomeAtual) {
    setLastNome(nomeAtual)
    reset({ nome_completo: nomeAtual })
  }

  const update = useMutation({
    mutationFn: async (values: NomeForm) => {
      if (!user?.id) throw new Error('Sessão expirada')
      // UPDATE direto em perfis_usuarios é admin-only (RLS 0025). O usuário
      // comum edita só o próprio nome via RPC SECURITY DEFINER, que não permite
      // mexer em perfil/ativo (sem escalonamento de privilégio).
      const { error } = await supabase.rpc('atualizar_meu_nome', {
        novo_nome: values.nome_completo.trim(),
      } as never)
      if (error) throw error
    },
    onSuccess: async () => {
      toast.success('Nome atualizado')
      await onSaved()
    },
    onError: (e) => toast.error(traduzirErroBanco(e)),
  })

  return (
    <Card icon={<UserIcon className="h-4 w-4" />} title="Informações pessoais" subtitle="Seu nome aparece em listas e na auditoria.">
      <form onSubmit={handleSubmit((v) => update.mutateAsync(v))} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              E-mail
            </Label>
            <Input id="email" value={user?.email ?? ''} disabled />
            <p className="text-[11px] text-muted-foreground">
              Para alterar o e-mail, peça ao administrador.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome completo *</Label>
            <Input id="nome" {...register('nome_completo')} />
            {errors.nome_completo && (
              <p className="text-[11px] text-destructive">{errors.nome_completo.message}</p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => reset({ nome_completo: nomeAtual })}
            disabled={!isDirty || isSubmitting}
          >
            Descartar
          </Button>
          <Button type="submit" disabled={!isDirty || isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar nome
          </Button>
        </div>
      </form>
    </Card>
  )
}

interface SegurancaProps {
  email: string
}

function SegurancaCard({ email }: SegurancaProps) {
  const [showNova, setShowNova] = React.useState(false)
  const [showConf, setShowConf] = React.useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SenhaForm>({
    resolver: zodResolver(senhaSchema),
    defaultValues: { nova: '', confirmar: '' },
  })

  const change = useMutation({
    mutationFn: async (values: SenhaForm) => {
      const { error } = await supabase.auth.updateUser({ password: values.nova })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Senha atualizada')
      reset({ nova: '', confirmar: '' })
      setShowNova(false)
      setShowConf(false)
    },
    onError: (e) => toast.error(traduzirErroBanco(e)),
  })

  return (
    <Card
      icon={<Shield className="h-4 w-4" />}
      title="Segurança"
      subtitle="Senha com no mínimo 12 caracteres. Combine letras, números e símbolos."
    >
      <form onSubmit={handleSubmit((v) => change.mutateAsync(v))} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="nova">Nova senha *</Label>
            <PasswordInput
              id="nova"
              show={showNova}
              onToggle={() => setShowNova((v) => !v)}
              register={register('nova')}
              autoComplete="new-password"
            />
            {errors.nova && (
              <p className="text-[11px] text-destructive">{errors.nova.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmar">Confirmar senha *</Label>
            <PasswordInput
              id="confirmar"
              show={showConf}
              onToggle={() => setShowConf((v) => !v)}
              register={register('confirmar')}
              autoComplete="new-password"
            />
            {errors.confirmar && (
              <p className="text-[11px] text-destructive">{errors.confirmar.message}</p>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Sua próxima sessão em {email || 'sua conta'} usará a nova senha. Sessões já abertas continuam ativas até expirarem.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Alterar senha
          </Button>
        </div>
      </form>
    </Card>
  )
}

interface PasswordInputProps {
  id: string
  show: boolean
  onToggle: () => void
  register: ReturnType<ReturnType<typeof useForm<SenhaForm>>['register']>
  autoComplete?: string
}

function PasswordInput({ id, show, onToggle, register, autoComplete }: PasswordInputProps) {
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        className="pr-10"
        {...register}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

interface CardProps {
  icon: React.ReactNode
  title: string
  subtitle?: string
  children: React.ReactNode
}

function Card({ icon, title, subtitle, children }: CardProps) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-foreground/80">
          {icon}
        </span>
        <div>
          <h2 className="text-[14px] font-medium text-foreground">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}
