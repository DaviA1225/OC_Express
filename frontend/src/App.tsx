import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import LoginPage from '@/pages/auth/LoginPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import PlaceholderPage from '@/pages/shared/PlaceholderPage'

export default function App() {
  return (
    <AuthProvider>
      <TooltipProvider delayDuration={200}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route
                path="/solicitacoes"
                element={<PlaceholderPage title="Solicitações" description="Será construída na Fase 4." />}
              />
              <Route
                path="/cargas-retorno"
                element={<PlaceholderPage title="Cargas de Retorno" description="Será construída na Fase 6." />}
              />
              <Route
                path="/cadastros/motoristas"
                element={<PlaceholderPage title="Motoristas" description="Será construída na Fase 3." />}
              />
              <Route
                path="/cadastros/veiculos"
                element={<PlaceholderPage title="Veículos" description="Será construída na Fase 3." />}
              />
              <Route
                path="/cadastros/carretas"
                element={<PlaceholderPage title="Carretas" description="Será construída na Fase 3." />}
              />
              <Route
                path="/cadastros/clientes"
                element={<PlaceholderPage title="Clientes" description="Será construída na Fase 3." />}
              />
              <Route
                path="/cadastros/materiais"
                element={<PlaceholderPage title="Materiais" description="Será construída na Fase 3." />}
              />
              <Route
                path="/cadastros/subcontratadas"
                element={<PlaceholderPage title="Subcontratadas" description="Será construída na Fase 3." />}
              />
              <Route
                path="/cadastros/usuarios"
                element={<PlaceholderPage title="Usuários" description="Será construída na Fase 3." />}
              />
              <Route
                path="/auditoria"
                element={<PlaceholderPage title="Auditoria" description="Será construída na Fase 7." />}
              />
              <Route
                path="/perfil"
                element={<PlaceholderPage title="Meu perfil" description="Em desenvolvimento." />}
              />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Route>
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  )
}
