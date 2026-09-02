import * as React from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, ArrowRight, Clock, Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { TurnstileWidget, type TurnstileHandle } from '@/components/TurnstileWidget'
import { useAuth } from '@/hooks/useAuth'
import { emailLembrado, esquecerEmail, lembrarEmail } from '@sislog/shared/cookies'
import { TermosLeitura } from '@/features/termos/TermosLeitura'
import { lerMotivoSaida, limparMotivoSaida } from '@sislog/shared/sessao'

// Chave pública do Turnstile. Quando ausente, o captcha fica desligado e o login
// segue como antes — o gate real é habilitado no Dashboard do Supabase.
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

const loginSchema = z.object({
  email: z.string().min(1, 'Informe seu e-mail').email('E-mail inválido'),
  password: z.string().min(1, 'Informe sua senha'),
})

type LoginValues = z.infer<typeof loginSchema>
type Step = 'welcome' | 'credentials'

export default function LoginPage() {
  const { signIn, session, loading } = useAuth()
  const navigate = useNavigate()

  // Cookie de conveniência com o e-mail — nunca a senha (ver
  // `@sislog/shared/cookies`). Quem já entrou neste navegador cai direto no
  // campo de senha, sem passar pela tela de boas-vindas.
  const [emailSalvo] = React.useState(() => emailLembrado())
  const [lembrar, setLembrar] = React.useState(!!emailSalvo)

  // Por que a sessão caiu. Leitura pura no inicializador: apagar aqui seria
  // efeito colateral num caminho que o StrictMode roda duas vezes. Quem apaga é
  // o login bem-sucedido, mais abaixo.
  const [saiuPorInatividade] = React.useState(() => lerMotivoSaida() === 'inatividade')

  const [step, setStep] = React.useState<Step>(emailSalvo ? 'credentials' : 'welcome')
  const [showPassword, setShowPassword] = React.useState(false)
  const [capsOn, setCapsOn] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [captchaToken, setCaptchaToken] = React.useState<string | null>(null)
  const turnstileRef = React.useRef<TurnstileHandle>(null)
  const captchaEnabled = Boolean(TURNSTILE_SITE_KEY)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: emailSalvo ?? '', password: '' },
  })

  if (!loading && session) {
    return <Navigate to="/solicitacoes" replace />
  }

  const onSubmit = async (values: LoginValues) => {
    if (captchaEnabled && !captchaToken) {
      toast.error('Confirme que você não é um robô.')
      return
    }
    setSubmitting(true)
    const { error } = await signIn(values.email, values.password, captchaToken ?? undefined)
    setSubmitting(false)
    if (error) {
      // Token do Turnstile é de uso único: descarta e emite um novo desafio.
      turnstileRef.current?.reset()
      setCaptchaToken(null)
      toast.error(error)
      return
    }
    // Só depois do login dar certo: guardar um e-mail que nem existe deixaria a
    // próxima visita com o campo preenchido errado.
    if (lembrar) lembrarEmail(values.email)
    else esquecerEmail()
    limparMotivoSaida()
    navigate('/solicitacoes', { replace: true })
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-[#F5F7F9] px-4 py-10 dark:bg-[var(--canvas-dark)]">
      {/* Glow orb azul atrás do card — "hero" da entrada do parceiro (SPEC-NOVA-UI §4). */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(30,64,175,0.10)] blur-[130px] dark:bg-[var(--glow-blue)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_-10%,rgba(30,64,175,0.06),transparent_55%)]"
      />
      <div className="relative w-full max-w-[380px]">
        <div className="relative overflow-hidden rounded-[4px] border border-border bg-white p-8 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.18)] dark:border-[var(--border-dark)] dark:bg-[var(--surface-dark)] dark:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.75)]">
          {/* Wordmark — destaque tipográfico único: gradiente tom-claro→sólido do azul. */}
          <div className="mb-6 flex items-center gap-2.5">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-[4px] bg-primary text-[13px] font-semibold text-primary-foreground">
              LHG
            </div>
            <span className="bg-gradient-to-r from-[#1E40AF] to-[#1E3A8A] bg-clip-text font-display text-[16px] font-semibold leading-tight tracking-tight text-transparent dark:from-[var(--portal-blue-tint)] dark:to-[#1E40AF]">
              Portal Parceiros LHG
            </span>
          </div>
          {saiuPorInatividade && (
            <div className="mb-5 flex items-start gap-2 rounded-[3px] border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Entre novamente para continuar. Por inatividade, o acesso é encerrado para
                proteger os dados do sistema.
              </span>
            </div>
          )}

          {step === 'welcome' ? (
            <div
              key="welcome"
              className="animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"
            >
              <h1 className="font-display text-[22px] font-semibold tracking-tight text-foreground">
                Acessar o portal
              </h1>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Acesso para transportadoras parceiras da LHG.
              </p>

              <Button
                type="button"
                className="mt-6 h-10 w-full"
                onClick={() => setStep('credentials')}
              >
                Login
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div
              key="credentials"
              className="animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"
            >
              <button
                type="button"
                onClick={() => setStep('welcome')}
                className="mb-5 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar
              </button>

              <h1 className="font-display text-[22px] font-semibold tracking-tight text-foreground">
                Suas credenciais
              </h1>

              {/* react-hooks/refs acusa `handleSubmit` porque o react-hook-form
                  guarda o estado do formulário em refs internos. Aqui não há
                  leitura de ref nossa no render: o retorno é um handler de
                  evento, que só toca nos refs quando o submit dispara. */}
              {/* eslint-disable-next-line react-hooks/refs */}
              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="seu@email.com.br"
                    className="h-10"
                    {...register('email')}
                  />
                  {errors.email && (
                    <p className="text-[11px] text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="h-10 pr-9"
                      onKeyUp={(e) => setCapsOn(e.getModifierState('CapsLock'))}
                      onKeyDown={(e) => setCapsOn(e.getModifierState('CapsLock'))}
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-[11px] text-destructive">{errors.password.message}</p>
                  )}
                  {capsOn && !errors.password && (
                    <p className="text-[11px] font-medium text-amber-600">Caps Lock está ativado</p>
                  )}
                </div>

                <div className="flex items-start gap-2">
                  <Checkbox
                    id="lembrar_email"
                    checked={lembrar}
                    onCheckedChange={(v) => setLembrar(v === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="lembrar_email" className="text-[12px] font-normal leading-relaxed text-muted-foreground">
                    Lembrar meu e-mail neste computador
                  </Label>
                </div>

                {captchaEnabled && (
                  <TurnstileWidget
                    ref={turnstileRef}
                    siteKey={TURNSTILE_SITE_KEY!}
                    onVerify={setCaptchaToken}
                    onExpire={() => setCaptchaToken(null)}
                    onError={() => setCaptchaToken(null)}
                  />
                )}

                <Button
                  type="submit"
                  className="h-10 w-full"
                  disabled={submitting || (captchaEnabled && !captchaToken)}
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? 'Entrando…' : 'Entrar'}
                </Button>
              </form>

              <p className="mt-5 text-[12px] leading-relaxed text-muted-foreground">
                Esqueceu a senha? Procure o administrador da sua transportadora ou o suporte
                da LHG, o portal não tem recuperação automática.
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 space-y-1 text-center">
          <p className="text-[11px] text-muted-foreground">
            Acesso restrito a transportadoras parceiras · sessões registradas
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            © {new Date().getFullYear()} LHG Logística, Portal de Parceiros ·{' '}
            <button
              type="button"
              onClick={() =>
                toast.info('Procure o administrador da sua transportadora ou o suporte da LHG.')
              }
              className="font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#F5F7F9] dark:focus-visible:ring-offset-[var(--canvas-dark)]"
            >
              Suporte
            </button>
            {' · '}
            <TermosLeitura audiencia="parceiro" />
          </p>
        </div>
      </div>
    </div>
  )
}
