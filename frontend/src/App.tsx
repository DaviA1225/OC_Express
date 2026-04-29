import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { PerfilRoute } from '@/components/shared/PerfilRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import LoginPage from '@/pages/auth/LoginPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import PlaceholderPage from '@/pages/shared/PlaceholderPage'
import SubcontratadasPage from '@/pages/cadastros/SubcontratadasPage'
import MotoristasPage from '@/pages/cadastros/MotoristasPage'
import VeiculosPage from '@/pages/cadastros/VeiculosPage'
import CarretasPage from '@/pages/cadastros/CarretasPage'
import ClientesPage from '@/pages/cadastros/ClientesPage'
import MateriaisPage from '@/pages/cadastros/MateriaisPage'
import UsuariosPage from '@/pages/cadastros/UsuariosPage'

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
              <Route path="/cadastros/motoristas" element={<MotoristasPage />} />
              <Route path="/cadastros/veiculos" element={<VeiculosPage />} />
              <Route path="/cadastros/carretas" element={<CarretasPage />} />
              <Route path="/cadastros/clientes" element={<ClientesPage />} />
              <Route path="/cadastros/materiais" element={<MateriaisPage />} />
              <Route path="/cadastros/subcontratadas" element={<SubcontratadasPage />} />

              <Route element={<PerfilRoute allowed={['admin']} />}>
                <Route path="/cadastros/usuarios" element={<UsuariosPage />} />
              </Route>

              <Route element={<PerfilRoute allowed={['admin', 'supervisor']} />}>
                <Route
                  path="/auditoria"
                  element={<PlaceholderPage title="Auditoria" description="Será construída na Fase 7." />}
                />
              </Route>

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
