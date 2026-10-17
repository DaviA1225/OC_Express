import * as React from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import type { EmailOtpType } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { PortalLoader } from '@/components/PortalLoader'
import { Spinner } from '@/components/shared/Spinner'
import { CadastroField } from '@/components/forms/CadastroField'

const schema = z
  .object({
    senha: z.string().min(12, 'Use pelo menos 12 caracteres'),
    confirmar: z.string().min(12, 'Use pelo menos 12 caracteres'),
  })
  .refine((d) => d.senha === d.confirmar, {
    message: 'As senhas não coincidem',
    path: ['confirmar'],
  })
type FormValues = z.infer<typeof schema>

export default function AceitarConvitePage() {
  const { session, parceiroUsuario, parceiro, loading, user } = useAuth()
  const navigate = useNavigate()
  const [showSenha, setShowSenha] = React.useState(false)
  const [showConf, setShowConf] = React.useState(false)
  // Snapshot do horário de montagem (inicializador lazy = puro, roda uma vez).
  // Evita chamar Date.now() direto no render (regra react-hooks/purity).
  const [agoraMs] = React.useState(() => Date.now())

  // Link de convite no padrão token_hash: o e-mail aponta para
  // /aceitar-convite?token_hash=…&type=invite e a verificação acontece aqui no
  // JavaScript (verifyOtp), não numa requisição GET ao /auth/v1/verify do
  // Supabase. Assim, scanners de e-mail corporativo (Outlook Safe Links,
  // Mimecast, Proofpoint) que pré-clicam o link fazem só um GET "burro" na
  // página e NÃO consomem mais o token de uso único — que era o que fazia o
  // convite "expirar" antes de o usuário clicar.
  const [verifyState, setVerifyState] = React.useState<'verifying' | 'ok' | 'failed' | 'none'>(
    () => (new URLSearchParams(window.location.search).get('token_hash') ? 'verifying' : 'none'),
  )
  const [graceExpired, setGraceExpired] = React.useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { senha: '', confirmar: '' },
  })

  React.useEffect(() => {
    if (verifyState !== 'verifying') return
    const params = new URLSearchParams(window.location.search)
    // verifyState só inicia em 'verifying' quando token_hash existe na URL;
    // o fallback '' é defensivo — verifyOtp devolve erro e cai em 'failed'.
    const tokenHash = params.get('token_hash') ?? ''
    const type = (params.get('type') ?? 'invite') as EmailOtpType
    let cancelled = false
    supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error }) => {
      if (cancelled) return
      if (error) {
        setVerifyState('failed')
        return
      }
      // Tira o token da URL — evita reverificar num reload e remove o token do histórico.
      window.history.replaceState({}, '', '/aceitar-convite')
      setVerifyState('ok')
    })
    return () => {
      cancelled = true
    }
  }, [verifyState])

  // Depois do verifyOtp, o vínculo do parceiro (parceiroUsuario) carrega de
  // forma assíncrona no useAuth. Damos uma folga antes de tratar como inválido,
  // pra não piscar "convite inválido" no caminho feliz.
  React.useEffect(() => {
    if (verifyState !== 'ok' || parceiroUsuario) return
    const t = setTimeout(() => setGraceExpired(true), 6000)
    return () => clearTimeout(t)
  }, [verifyState, parceiroUsuario])

  if (loading || verifyState === 'verifying') return <PortalLoader />

  // Token inválido/expirado/já usado.
  if (verifyState === 'failed') return <ConviteInvalido />

  // Verificou, mas o vínculo ainda está chegando — segura no loader.
  if (verifyState === 'ok' && !parceiroUsuario && !graceExpired) return <PortalLoader />

  // Sem sessão = o link expirou ou nunca foi clicado de fato.
  if (!session) return <ConviteInvalido />

  // Sessão existe mas não há vínculo de parceiro — provavelmente conta interna
  // logada por engano, ou o INSERT da Edge Function falhou.
  if (!parceiroUsuario) return <ConviteInvalido />

  // Se o caller já está em sessão "normal" (não fresca), deixa passar pro app.
  // Detecção heurística: usuário criado há mais de 30 minutos = sessão antiga.
  // Setar senha aqui não quebra nada, mas evitamos confundir quem navegou
  // pra /aceitar-convite por engano depois de já estar logado.
  const createdAt = user?.created_at ? new Date(user.created_at).getTime() : 0
  const sessaoAntiga = createdAt > 0 && agoraMs - createdAt > 30 * 60 * 1000
  if (sessaoAntiga) return <Navigate to="/solicitacoes" replace />

  const onSubmit = async (values: FormValues) => {
    const { error } = await supabase.auth.updateUser({ password: values.senha })
    if (error) {
      toast.error(traduzirErro(error.message))
      return
    }
    // Marca o convite como aceito (fire-and-forget — não bloqueia o login se
    // falhar). Cliente nunca escreve direto em parceiro_usuarios.convite_aceito_em:
    // a RPC SECURITY DEFINER deriva o user_id de auth.uid() e ignora qualquer arg.
    void supabase.rpc('marcar_meu_convite_aceito')
    toast.success('Senha definida.')
    navigate('/solicitacoes', { replace: true })
  }

  return (
    <div className="grid min-h-full grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel parceiroNome={parceiro?.razao_social} />

      <div className="flex items-center justify-center bg-canvas px-4 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <img src="/favicon.svg" alt="" aria-hidden className="h-10 w-10" />
          </div>

          <h1 className="font-display text-page font-medium text-foreground">
            Definir senha
          </h1>
          <p className="mt-1 text-body text-muted-foreground">
            {parceiroUsuario.nome_completo} ({user?.email}), crie uma senha forte para
            acessar o portal.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
            <CadastroField label="Nova senha" required id="senha" error={errors.senha?.message}>
              <PasswordInput
                show={showSenha}
                onToggle={() => setShowSenha((v) => !v)}
                autoFocus
                {...register('senha')}
              />
            </CadastroField>

            <CadastroField label="Confirmar senha" required id="confirmar" error={errors.confirmar?.message}>
              <PasswordInput
                show={showConf}
                onToggle={() => setShowConf((v) => !v)}
                {...register('confirmar')}
              />
            </CadastroField>

            <p className="text-body-sm text-muted-foreground">
              Use no mínimo 12 caracteres. Combine letras, números e símbolos.
            </p>

            <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              {isSubmitting ? 'Salvando…' : 'Definir senha e entrar'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id?: string
  show: boolean
  onToggle: () => void
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ id, show, onToggle, ...rest }, ref) {
    return (
      <div className="relative">
        <Input
          id={id}
          ref={ref}
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          className="h-10 pr-9"
          {...rest}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors duration-fast hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    )
  },
)

function BrandPanel({ parceiroNome }: { parceiroNome?: string | null }) {
  return (
    // Painel de marca chapado (azul escuro do portal, sempre escuro): sem
    // gradiente, brilho nem vidro — essas exceções ficam só no login.
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-[var(--brand-panel)] p-10 text-white lg:flex">
      <header className="relative">
        <img src="/favicon.svg" alt="" aria-hidden className="h-9 w-9" />
      </header>

      <div className="relative space-y-6">
        <h2 className="max-w-md font-display text-kpi font-medium">
          Convite{parceiroNome ? ` da ${parceiroNome}` : ''} para o Portal
          Parceiros LHG.
        </h2>
        <p className="max-w-md text-body-lg leading-relaxed text-white/80">
          Com a senha definida, o portal fica liberado para enviar e acompanhar as
          solicitações de carregamento.
        </p>

        <ul className="grid max-w-md gap-3 text-body text-white/85">
          <Feature icon={ShieldCheck}>
            Cada conta enxerga apenas os dados da própria transportadora.
          </Feature>
        </ul>
      </div>

      <footer className="relative text-meta text-white/75">
        © {new Date().getFullYear()} LHG, Portal de Parceiros.
      </footer>
    </aside>
  )
}

function Feature({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-white/80" aria-hidden />
      <span>{children}</span>
    </li>
  )
}

function ConviteInvalido() {
  return (
    <div className="flex min-h-full items-center justify-center bg-canvas px-4 py-16">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center">
        <h2 className="text-title font-semibold text-foreground">Convite inválido ou expirado</h2>
        <p className="mt-2 text-body text-muted-foreground">
          Este link de convite não é mais válido. Peça um novo convite ao administrador
          da transportadora ou procure o suporte da LHG.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => (window.location.href = '/')}>
          Voltar para o login
        </Button>
      </div>
    </div>
  )
}

function traduzirErro(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('password should be at least')) return 'A senha precisa ter no mínimo 12 caracteres.'
  if (m.includes('weak password')) return 'Senha muito fraca. Combine letras, números e símbolos.'
  if (m.includes('same as the old password')) return 'Use uma senha diferente.'
  return 'Não foi possível salvar a senha. Tente novamente.'
}
