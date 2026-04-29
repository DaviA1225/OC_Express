import { Navigate, Outlet } from 'react-router-dom'
import { useAuth, hasPerfil } from '@/hooks/useAuth'
import type { PerfilUsuario } from '@/types/database.types'

interface PerfilRouteProps {
  allowed: PerfilUsuario[]
  redirectTo?: string
}

export function PerfilRoute({ allowed, redirectTo = '/dashboard' }: PerfilRouteProps) {
  const { profile } = useAuth()
  if (!hasPerfil(profile, ...allowed)) {
    return <Navigate to={redirectTo} replace />
  }
  return <Outlet />
}
