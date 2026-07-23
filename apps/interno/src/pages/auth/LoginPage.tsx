import * as React from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TurnstileWidget, type TurnstileHandle } from '@/components/TurnstileWidget'
import { useAuth } from '@/hooks/useAuth'

// Chave pública do Turnstile. Quando ausente, o captcha fica desligado e o login
// segue como antes — o gate real é habilitado no Dashboard do Supabase.
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

const loginSchema = z.object({
  email: z.string().min(1, 'Informe seu e-mail').email('E-mail inválido'),
  password: z.string().min(1, 'Informe sua senha'),
})

type LoginValues = z.infer<typeof loginSchema>
type Step = 'welcome' | 'credentials'

const APP_VERSION = 'v1.3.1'
// Mostra o ambiente quando não for produção (homologação/dev), para a operação
// nunca confundir em qual base está agindo. Em produção fica oculto.
const ENV_LABEL: string | null =
  (import.meta.env.VITE_ENV_LABEL as string | undefined) ??
  (import.meta.env.PROD ? null : 'Desenvolvimento')

export default function LoginPage() {
  const { signIn, session, loading } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = React.useState<Step>('welcome')
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
    defaultValues: { email: '', password: '' },
  })

  if (!loading && session) {
    return <Navigate to="/dashboard" replace />
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
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-[#F5F7F9] px-4 py-10 dark:bg-[var(--canvas-dark)]">
      {/* Glow orb: um único brilho difuso do acento atrás do card — o "hero" da
          sessão. Recurso escasso (só aqui), como manda o SPEC-NOVA-UI §4. No
          claro é um calor suave; no escuro, um glow mais presente. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(255,81,0,0.08)] blur-[130px] dark:bg-[var(--glow-orange)]"
      />
      {/* Profundidade: um calor sutil vindo do topo, sem virar superfície chapada. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_-10%,rgba(255,81,0,0.05),transparent_55%)]"
      />
      <div className="relative w-full max-w-[380px]">
        <div className="relative overflow-hidden rounded-[4px] border border-border bg-white p-8 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.18)] dark:border-[var(--border-dark)] dark:bg-[var(--surface-dark)] dark:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.75)]">
          {ENV_LABEL && (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-[3px] border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400" aria-hidden />
              {ENV_LABEL}
            </span>
          )}

          {/* Wordmark — único destaque tipográfico da tela: gradiente tom-claro→
              sólido do MESMO acento (laranja), nunca duas cores diferentes. */}
          <div className="mb-6 flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" aria-hidden className="h-8 w-8" />
            <span className="bg-gradient-to-r from-[#FF5100] to-[#D3641A] bg-clip-text font-display text-[20px] font-semibold tracking-tight text-transparent dark:from-[var(--orange-tint)] dark:to-[#FF5100]">
              SisLog
            </span>
          </div>
          {step === 'welcome' ? (
            <div
              key="welcome"
              className="animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"
            >
              <h1 className="font-display text-[22px] font-semibold tracking-tight text-foreground">
                Acessar o sistema
              </h1>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Sistema interno de ordens de carregamento da LHG.
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

              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail corporativo</Label>
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        toast.info('Funcionalidade em desenvolvimento.')
                      }}
                      className="text-[12px] font-medium text-primary-strong hover:underline"
                    >
                      Esqueci minha senha
                    </a>
                  </div>
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
            </div>
          )}
        </div>

        <div className="mt-5 space-y-1 text-center">
          <p className="text-[11px] text-muted-foreground">
            Acesso restrito a usuários autorizados · sessões registradas
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            LHG Logística · SisLog {APP_VERSION} ·{' '}
            <button
              type="button"
              onClick={() =>
                toast.info('Em caso de problemas de acesso, contate o administrador do sistema.')
              }
              className="font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#F5F7F9] dark:focus-visible:ring-offset-[var(--canvas-dark)]"
            >
              Suporte
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
