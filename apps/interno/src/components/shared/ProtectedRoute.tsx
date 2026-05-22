import * as React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { BrandedLoader } from '@/components/shared/BrandedLoader'
import { Button } from '@/components/ui/button'

export function ProtectedRoute() {
  const { session, profile, profileError, loading, refreshProfile } = useAuth()
  const location = useLocation()

  if (loading) {
    return <BrandedLoader />
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
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
      <div className="w-full max-w-md rounded-xl border bg-background p-6 text-center shadow-overlay">
        <h2 className="text-[18px] font-medium text-foreground">Não foi possível carregar seu acesso</h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Houve uma falha de conexão ao verificar seu perfil. Sua conta continua ativa —
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
      <div className="w-full max-w-md rounded-xl border bg-background p-6 text-center shadow-overlay">
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
      <div className="w-full max-w-md rounded-xl border bg-background p-6 text-center shadow-overlay">
        <h2 className="text-[18px] font-medium text-foreground">Conta desativada</h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Seu acesso ao SisLog foi desativado. Procure o administrador.
        </p>
      </div>
    </div>
  )
}
