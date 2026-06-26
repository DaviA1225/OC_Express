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
            Acessar o sistema
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
    <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-white/10 bg-[#1D1E1B] p-10 text-white lg:flex">
      <header className="flex items-center gap-2.5">
        <img src="/favicon.svg" alt="" aria-hidden className="h-7 w-7 shrink-0" />
        <span className="text-[15px] font-semibold tracking-tight">SisLog</span>
      </header>

      <div className="space-y-6">
        <div className="h-0.5 w-10 bg-primary" aria-hidden />
        <h2 className="max-w-md font-display text-[32px] font-semibold leading-[1.15] tracking-tight">
          Gestão de carregamentos com agilidade operacional.
        </h2>
        <p className="max-w-md text-[14px] leading-relaxed text-white/70">
          Centralize solicitações para emissão de ordens de carregamento e acompanhe a operação
          em tempo real, tudo num só lugar.
        </p>

        <ul className="grid max-w-md gap-2.5 border-t border-white/10 pt-5 text-[13px] text-white/75">
          <Feature icon={Truck}>Solicitações de OCs e cargas de retorno integradas</Feature>
          <Feature icon={Banknote}>Valores de frete por cliente sempre atualizados</Feature>
        </ul>
      </div>

      <footer className="text-[11px] text-white/45">
        © {new Date().getFullYear()} — Sistema operacional interno.
      </footer>
    </aside>
  )
}

function Feature({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
      <span>{children}</span>
    </li>
  )
}
