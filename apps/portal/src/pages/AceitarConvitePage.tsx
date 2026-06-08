import * as React from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { PortalLoader } from '@/components/PortalLoader'

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

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { senha: '', confirmar: '' },
  })

  if (loading) return <PortalLoader />

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
    toast.success('Senha definida — bem-vindo ao portal!')
    navigate('/solicitacoes', { replace: true })
  }

  return (
    <div className="grid min-h-full grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel parceiroNome={parceiro?.razao_social} />

      <div className="flex items-center justify-center bg-background px-4 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <img src="/favicon.svg" alt="" aria-hidden className="h-10 w-10" />
          </div>

          <h1 className="font-display text-[26px] font-semibold tracking-tight text-foreground">
            Defina sua senha
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {parceiroUsuario.nome_completo} ({user?.email}) — crie uma senha forte para
            acessar o portal.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="senha">Nova senha</Label>
              <PasswordInput
                id="senha"
                show={showSenha}
                onToggle={() => setShowSenha((v) => !v)}
                autoFocus
                {...register('senha')}
              />
              {errors.senha && (
                <p className="text-[11px] text-destructive">{errors.senha.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmar">Confirmar senha</Label>
              <PasswordInput
                id="confirmar"
                show={showConf}
                onToggle={() => setShowConf((v) => !v)}
                {...register('confirmar')}
              />
              {errors.confirmar && (
                <p className="text-[11px] text-destructive">{errors.confirmar.message}</p>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              Use no mínimo 12 caracteres. Combine letras, números e símbolos.
            </p>

            <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Salvando…' : 'Definir senha e entrar'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string
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
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1E40AF] from-0% via-[#1E3A8A] via-40% to-[#172554] to-100% p-10 text-white lg:flex">
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

      <div className="relative space-y-6">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-white/70">
          Bem-vindo
        </p>
        <h2 className="max-w-md font-display text-[30px] font-semibold leading-[1.15] tracking-tight">
          Você foi convidado{parceiroNome ? ` pela ${parceiroNome}` : ''} para o
          Portal Parceiros LHG.
        </h2>
        <p className="max-w-md text-[14px] leading-relaxed text-white/80">
          Defina uma senha para começar a usar o portal e enviar suas solicitações
          de carregamento.
        </p>

        <ul className="grid max-w-md gap-3 text-[13px] text-white/85">
          <Feature icon={ShieldCheck}>
            Sua conta enxerga apenas os dados da sua transportadora
          </Feature>
        </ul>
      </div>

      <footer className="relative text-[11px] text-white/60">
        © {new Date().getFullYear()} LHG — Portal de Parceiros.
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
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/15">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span>{children}</span>
    </li>
  )
}

function ConviteInvalido() {
  return (
    <div className="flex min-h-full items-center justify-center bg-muted px-4 py-16">
      <div className="w-full max-w-md rounded-xl border bg-background p-6 text-center shadow-overlay">
        <h2 className="text-[18px] font-medium text-foreground">Convite inválido ou expirado</h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Este link de convite não é mais válido. Peça ao administrador da sua
          transportadora para enviar um novo convite, ou procure o suporte da LHG.
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
