import * as React from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, Truck, Banknote } from 'lucide-react'
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

export default function LoginPage() {
  const { signIn, session, loading } = useAuth()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = React.useState(false)
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
    return <Navigate to="/dashboard" replace />
  }

  const onSubmit = async (values: LoginValues) => {
    setSubmitting(true)
    const { error } = await signIn(values.email, values.password)
    setSubmitting(false)
    if (error) {
      toast.error(error)
      return
    }
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="grid min-h-full grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel />

      <div className="flex items-center justify-center bg-background px-4 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <img src="/favicon.svg" alt="" aria-hidden className="h-10 w-10" />
          </div>

          <h1 className="font-display text-[26px] font-semibold tracking-tight text-foreground">
            Bem-vindo
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Entre com suas credenciais para acessar o SisLog.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
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
                  className="text-[12px] font-medium text-primary hover:underline"
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
            </div>

            <Button type="submit" className="h-10 w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>

          <p className="mt-10 text-center text-[11px] text-muted-foreground/80">
            SisLog · v1.2.1
          </p>
        </div>
      </div>
    </div>
  )
}

function BrandPanel() {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#C44612] from-0% via-[#3A1E10] via-15% to-[#1D1E1B] to-100% p-10 text-white lg:flex">
      {/* Padrão decorativo sutil — círculos translúcidos */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.15), transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.08), transparent 35%)',
        }}
      />

      <header className="relative">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20">
          <img src="/favicon.svg" alt="" aria-hidden className="h-7 w-7" />
        </div>
      </header>

      <div className="relative space-y-8">
        <div className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[2px] text-white/70">
            SisLog
          </p>
          <h2 className="max-w-md font-display text-[34px] font-semibold leading-[1.15] tracking-tight">
            Gestão de carregamentos com agilidade operacional.
          </h2>
          <p className="max-w-md text-[14px] leading-relaxed text-white/80">
            Centralize solicitações para emissão de ordens de carregamento e acompanhe a operação
            em tempo real, tudo num só lugar.
          </p>
        </div>

        <ul className="grid max-w-md gap-3 text-[13px] text-white/85">
          <Feature icon={Truck}>Solicitações de OCs e cargas de retorno integradas</Feature>
          <Feature icon={Banknote}>Valores de frete por cliente sempre atualizados</Feature>
        </ul>
      </div>

      <footer className="relative text-[11px] text-white/60">
        © {new Date().getFullYear()} — Sistema operacional interno.
      </footer>
    </aside>
  )
}

function Feature({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/15">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span>{children}</span>
    </li>
  )
}
