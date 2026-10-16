import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { PortalLoader } from '@/components/PortalLoader'
import { Button } from '@/components/ui/button'

/** Protege as rotas internas do portal. Só passa quem tem sessão ativa E um
 *  vínculo `parceiro_usuarios` ativo — contas internas ou desativadas caem
 *  na tela de acesso não autorizado. */
export function ProtectedRoute() {
  const { session, parceiroUsuario, loading } = useAuth()

  if (loading) {
    return <PortalLoader />
  }

  if (!session) {
    return <Navigate to="/" replace />
  }

  if (!parceiroUsuario) {
    return <AcessoNaoAutorizado />
  }

  return <Outlet />
}

function AcessoNaoAutorizado() {
  const { signOut } = useAuth()
  return (
    <div className="flex min-h-full items-center justify-center bg-canvas px-4 py-16">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center">
        <h2 className="text-title font-semibold text-foreground">Acesso não autorizado</h2>
        <p className="mt-2 text-body text-muted-foreground">
          Esta conta não está vinculada a nenhuma transportadora parceira ativa.
          Procure o administrador da sua empresa ou o suporte da LHG.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => void signOut()}>
          Sair
        </Button>
      </div>
    </div>
  )
}
