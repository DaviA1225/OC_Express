import * as React from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, ArrowRight, Clock, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { TurnstileWidget, type TurnstileHandle } from '@/components/TurnstileWidget'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { emailLembrado, esquecerEmail, lembrarEmail } from '@sislog/shared/cookies'
import { TermosLeitura } from '@/features/termos/TermosLeitura'
import { lerMotivoSaida, limparMotivoSaida } from '@sislog/shared/sessao'
import { Spinner } from '@/components/shared/Spinner'
import { tremer } from '@/hooks/useMovimento'
import { cn } from '@/lib/utils'

// Chave pública do Turnstile. Quando ausente, o captcha fica desligado e o login
// segue como antes — o gate real é habilitado no Dashboard do Supabase.
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

const loginSchema = z.object({
  email: z.string().min(1, 'Informe o e-mail').email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
})

type LoginValues = z.infer<typeof loginSchema>
type Step = 'welcome' | 'credentials'

export default function LoginPage() {
  const { signIn, session, loading } = useAuth()
  const { theme } = useTheme()
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

  // Trocar o tema recria o widget do Turnstile: o token do widget antigo deixa
  // de valer (e o aviso de expiração dele nunca chegaria).
  const [temaDoCaptcha, setTemaDoCaptcha] = React.useState(theme)
  if (temaDoCaptcha !== theme) {
    setTemaDoCaptcha(theme)
    setCaptchaToken(null)
  }

  // Movimento (hooks/useMovimento + index.css): entrada coreografada só na
  // abertura; troca de etapa desliza; erro do submit faz o card tremer.
  const cardRef = React.useRef<HTMLDivElement>(null)
  const [entrada, setEntrada] = React.useState(true)
  const [direcao, setDirecao] = React.useState<'avanca' | 'volta' | null>(null)
  React.useEffect(() => {
    const t = window.setTimeout(() => setEntrada(false), 700)
    return () => window.clearTimeout(t)
  }, [])
  const irPara = (proxima: Step) => {
    setEntrada(false)
    setDirecao(proxima === 'credentials' ? 'avanca' : 'volta')
    setStep(proxima)
  }
  // Ordem na coreografia: wordmark 0 · card 2 (80ms) · conteúdo a partir de 3.
  const ent = entrada ? 'entrada-login' : undefined
  const ordem = (n: number) => ({ '--ordem': n }) as React.CSSProperties

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
      toast.error('Conclua a verificação de segurança.')
      return
    }
    setSubmitting(true)
    const { error } = await signIn(values.email, values.password, captchaToken ?? undefined)
    setSubmitting(false)
    if (error) {
      // Token do Turnstile é de uso único: descarta e emite um novo desafio.
      turnstileRef.current?.reset()
      setCaptchaToken(null)
      tremer(cardRef.current)
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
    <div className="relative isolate flex min-h-full items-center justify-center overflow-hidden bg-[#0B0D10] px-4 py-10">
      {/* O cartão de sempre sobre a foto da caçamba sendo carregada na mina, sob
          um véu escuro (bloco "Fundo do login" do index.css; Pexels 29506742,
          marcas de terceiros desfocadas). */}
      <img
        src="/inicio/mina-1920.webp"
        srcSet="/inicio/mina-1280.webp 1280w, /inicio/mina-1920.webp 1920w"
        sizes="100vw"
        alt=""
        aria-hidden
        className="login-fundo"
        decoding="async"
      />
      <div className="login-veu" aria-hidden />
      <div className="relative w-full max-w-[380px]">
        <div ref={cardRef} className="relative isolate p-8">
          {/* Superfície do card numa camada própria: entra depois do wordmark
              (que mora dentro dela) sem esconder o que está por cima. */}
          <div
            aria-hidden
            className={cn('absolute inset-0 -z-10 rounded-surface border bg-card shadow-overlay', ent)} style={ordem(2)}
          />
          {/* Wordmark no azul do portal (sólido: o degradê de antes usava tokens
              que saíram com o visual corporativo). */}
          <div className={cn('mb-6 flex items-center gap-2.5', ent)} style={ordem(0)}>
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-surface bg-primary text-body font-semibold text-primary-foreground">
              LHG
            </div>
            <span className="font-display text-title-sm font-semibold leading-tight tracking-tight text-[#1E40AF] dark:text-[#8DB4E0]">
              Portal Parceiros LHG
            </span>
          </div>
          {saiuPorInatividade && (
            <div role="status" className={cn('mb-5 flex items-start gap-2 rounded-[2px] border border-warning-border bg-warning-subtle px-3 py-2 text-body-sm leading-relaxed text-warning', ent)} style={ordem(3)}>
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Entre novamente para continuar. Por inatividade, o acesso é encerrado para
                proteger os dados do sistema.
              </span>
            </div>
          )}

          {step === 'welcome' ? (
            <div key="welcome" className={direcao === 'avanca' ? 'etapa-avanca' : direcao === 'volta' ? 'etapa-volta' : undefined}>
              <h1 className={cn('font-display text-page font-medium text-foreground', ent)} style={ordem(4)}>
                Acessar o portal
              </h1>
              <p className={cn('mt-1.5 text-body leading-relaxed text-muted-foreground', ent)} style={ordem(5)}>
                Acesso para transportadoras parceiras da LHG.
              </p>

              <Button
                type="button"
                className={cn('mt-6 h-10 w-full', ent)}
                style={ordem(6)}
                onClick={() => irPara('credentials')}
              >
                Login
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div key="credentials" className={direcao === 'avanca' ? 'etapa-avanca' : direcao === 'volta' ? 'etapa-volta' : undefined}>
              <button
                type="button"
                onClick={() => irPara('welcome')}
                style={ordem(3)}
                className={cn('mb-5 inline-flex items-center gap-1.5 text-body-sm font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1', ent)}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar
              </button>

              <h1 className={cn('font-display text-page font-medium text-foreground', ent)} style={ordem(4)}>
                Entrar no Portal Parceiros
              </h1>

              {/* react-hooks/refs acusa `handleSubmit` porque o react-hook-form
                  guarda o estado do formulário em refs internos. Aqui não há
                  leitura de ref nossa no render: o retorno é um handler de
                  evento, que só toca nos refs quando o submit dispara. */}
              {/* eslint-disable-next-line react-hooks/refs */}
              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
                <div className={cn('space-y-1.5', ent)} style={ordem(5)}>
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="nome@empresa.com.br"
                    className="h-10"
                    {...register('email')}
                  />
                  {errors.email && (
                    <p role="alert" className="text-body-sm text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <div className={cn('space-y-1.5', ent)} style={ordem(6)}>
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
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors duration-fast hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p role="alert" className="text-body-sm text-destructive">{errors.password.message}</p>
                  )}
                  {capsOn && !errors.password && (
                    <p className="text-body-sm font-medium text-warning">Caps Lock está ativado</p>
                  )}
                </div>

                <div className={cn('flex items-start gap-2', ent)} style={ordem(7)}>
                  <Checkbox
                    id="lembrar_email"
                    checked={lembrar}
                    onCheckedChange={(v) => setLembrar(v === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="lembrar_email" className="text-body-sm font-normal leading-relaxed text-muted-foreground">
                    Lembrar meu e-mail neste computador
                  </Label>
                </div>

                {captchaEnabled && (
                  <div className={ent} style={ordem(8)}>
                    <TurnstileWidget
                      ref={turnstileRef}
                      siteKey={TURNSTILE_SITE_KEY!}
                      // Tema do portal, não o do sistema operacional: com `auto` o
                      // widget saía escuro sobre o cartão claro.
                      theme={theme}
                      onVerify={setCaptchaToken}
                      onExpire={() => setCaptchaToken(null)}
                      onError={() => setCaptchaToken(null)}
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  className={cn('h-10 w-full', ent)}
                  style={ordem(8)}
                  aria-busy={submitting}
                  disabled={submitting || (captchaEnabled && !captchaToken)}
                >
                  {submitting && <Spinner />}
                  {submitting ? 'Entrando…' : 'Entrar'}
                </Button>
              </form>

              <p className={cn('mt-5 text-body-sm leading-relaxed text-muted-foreground', ent)} style={ordem(9)}>
                Para redefinir a senha, contate o administrador da transportadora ou o
                suporte da LHG. O portal não tem recuperação automática.
              </p>
            </div>
          )}
        </div>

        {/* Rodapé sobre a foto: `dark` faz os tokens resolverem para os tons
            claros do tema escuro, legíveis sobre o véu nos dois temas. */}
        <div className={cn('dark mt-5 space-y-1 text-center', ent)} style={ordem(9)}>
          <p className="text-meta text-muted-foreground">
            Acesso restrito a transportadoras parceiras · sessões registradas
          </p>
          <p className="text-meta text-muted-foreground">
            © {new Date().getFullYear()} LHG Logística, Portal de Parceiros ·{' '}
            <button
              type="button"
              onClick={() =>
                toast.info('Em caso de problemas de acesso, contate o administrador da transportadora ou o suporte da LHG.')
              }
              className="font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
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
