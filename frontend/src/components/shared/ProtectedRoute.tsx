import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export function ProtectedRoute() {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!profile) {
    return <AwaitingApproval />
  }

  if (!profile.ativo) {
    return <DeactivatedAccount />
  }

  return <Outlet />
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
          Seu acesso ao SisLog LHG foi desativado. Procure o administrador.
        </p>
      </div>
    </div>
  )
}
