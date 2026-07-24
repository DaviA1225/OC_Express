import * as React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { BrandedLoader } from '@/components/shared/BrandedLoader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ProtectedRoute() {
  const { session, profile, profileError, loading, mfaRequired, verifyMfa, signOut, refreshProfile } = useAuth()
  const location = useLocation()

  if (loading) {
    return <BrandedLoader />
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // Step-up: usuário autenticou por senha (aal1) mas tem 2FA ativo — exige o
  // código antes de liberar o app. Vale mesmo se navegar direto por URL.
  if (mfaRequired) {
    return <MfaChallenge onVerify={verifyMfa} onCancel={signOut} />
  }

  if (!profile) {
    // Diferencia "sem perfil de verdade" de "falha ao carregar o perfil":
    // um erro transitório não deve aparecer como "Aguardando liberação".
    if (profileError) {
      return <ConnectionError onRetry={refreshProfile} />
    }
    return <AwaitingApproval />
  }

  if (!profile.ativo) {
    return <DeactivatedAccount />
  }

  return <Outlet />
}

function MfaChallenge({
  onVerify,
  onCancel,
}: {
  onVerify: (code: string) => Promise<{ error: string | null }>
  onCancel: () => Promise<void>
}) {
  const [code, setCode] = React.useState('')
  const [erro, setErro] = React.useState<string | null>(null)
  const [verificando, setVerificando] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.trim().length < 6) return
    setVerificando(true)
    setErro(null)
    const { error } = await onVerify(code)
    setVerificando(false)
    if (error) {
      setErro(error)
      setCode('')
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-overlay">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary-strong">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <h2 className="text-[16px] font-medium text-foreground">Verificação em duas etapas</h2>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          Digite o código de 6 dígitos do seu app autenticador para concluir o acesso.
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="000000"
            className="text-center text-[18px] tracking-[0.3em] tabular-nums"
            aria-label="Código de verificação"
          />
          {erro && <p className="text-[12px] text-destructive">{erro}</p>}
          <Button type="submit" className="w-full" disabled={verificando || code.length < 6}>
            {verificando && <Loader2 className="h-4 w-4 animate-spin" />}
            {verificando ? 'Verificando…' : 'Verificar e entrar'}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => onCancel()}
          className="mt-3 w-full text-[12px] text-muted-foreground hover:text-foreground"
        >
          Usar outra conta
        </button>
      </div>
    </div>
  )
}

function ConnectionError({ onRetry }: { onRetry: () => Promise<void> }) {
  const [retrying, setRetrying] = React.useState(false)
  const handleRetry = async () => {
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }
  return (
    <div className="flex min-h-full items-center justify-center bg-muted px-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-overlay">
        <h2 className="text-[18px] font-medium text-foreground">Não foi possível carregar seu acesso</h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Houve uma falha de conexão ao verificar seu perfil. Sua conta continua ativa,
          tente novamente.
        </p>
        <Button className="mt-4" onClick={handleRetry} disabled={retrying}>
          {retrying ? 'Tentando…' : 'Tentar de novo'}
        </Button>
      </div>
    </div>
  )
}

function AwaitingApproval() {
  return (
    <div className="flex min-h-full items-center justify-center bg-muted px-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-overlay">
        <h2 className="text-[18px] font-medium text-foreground">Aguardando liberação</h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Sua conta ainda não tem perfil de acesso. Peça ao administrador para liberar o
          acesso.
        </p>
      </div>
    </div>
  )
}

function DeactivatedAccount() {
  return (
    <div className="flex min-h-full items-center justify-center bg-muted px-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-overlay">
        <h2 className="text-[18px] font-medium text-foreground">Conta desativada</h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Seu acesso ao SisLog foi desativado. Procure o administrador.
        </p>
      </div>
    </div>
  )
}
