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
import { useAuth } from '@/hooks/useAuth'

const loginSchema = z.object({
  email: z.string().min(1, 'Informe seu e-mail').email('E-mail inválido'),
  password: z.string().min(1, 'Informe sua senha'),
})

type LoginValues = z.infer<typeof loginSchema>
type Step = 'welcome' | 'credentials'

export default function LoginPage() {
  const { signIn, session, loading } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = React.useState<Step>('welcome')
  const [showPassword, setShowPassword] = React.useState(false)
  const [capsOn, setCapsOn] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  if (!loading && session) {
    return <Navigate to="/solicitacoes" replace />
  }

  const onSubmit = async (values: LoginValues) => {
    setSubmitting(true)
    const { error } = await signIn(values.email, values.password)
    setSubmitting(false)
    if (error) {
      toast.error(error)
      return
    }
    navigate('/solicitacoes', { replace: true })
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-[#1E3A8A] px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="rounded-[4px] border border-border bg-background p-8 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.5)]">
          {step === 'welcome' ? (
            <div
              key="welcome"
              className="animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"
            >
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-[4px] bg-primary text-[13px] font-semibold text-primary-foreground">
                LHG
              </div>
              <h1 className="mt-5 font-display text-[22px] font-semibold tracking-tight text-foreground">
                Portal Parceiros LHG
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

                <Button type="submit" className="h-10 w-full" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? 'Entrando…' : 'Entrar'}
                </Button>
              </form>

              <p className="mt-5 text-[12px] leading-relaxed text-muted-foreground">
                Esqueceu a senha? Procure o administrador da sua transportadora ou o suporte
                da LHG — o portal não tem recuperação automática.
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 space-y-1 text-center">
          <p className="text-[11px] text-white/50">
            Acesso restrito a transportadoras parceiras · sessões registradas
          </p>
          <p className="text-[11px] text-white/40">
            © {new Date().getFullYear()} LHG Logística — Portal de Parceiros ·{' '}
            <button
              type="button"
              onClick={() =>
                toast.info('Procure o administrador da sua transportadora ou o suporte da LHG.')
              }
              className="font-medium text-white/60 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1E3A8A]"
            >
              Suporte
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
