import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { PortalLayout } from '@/components/layout/PortalLayout'
import { PortalLoader } from '@/components/PortalLoader'
import LoginPage from '@/pages/LoginPage'

const SolicitacoesPage = lazy(() => import('@/pages/SolicitacoesPlaceholder'))
const MotoristasPage = lazy(() => import('@/pages/cadastros/MotoristasPage'))
const VeiculosPage = lazy(() => import('@/pages/cadastros/VeiculosPage'))
const CarretasPage = lazy(() => import('@/pages/cadastros/CarretasPage'))
const SubcontratadasPage = lazy(() => import('@/pages/cadastros/SubcontratadasPage'))
const UsuariosPage = lazy(() => import('@/pages/UsuariosPage'))

export function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<PortalLoader />}>
        <Routes>
          <Route path="/" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<PortalLayout />}>
              <Route path="/solicitacoes" element={<SolicitacoesPage />} />
              <Route path="/motoristas" element={<MotoristasPage />} />
              <Route path="/veiculos" element={<VeiculosPage />} />
              <Route path="/carretas" element={<CarretasPage />} />
              <Route path="/subcontratadas" element={<SubcontratadasPage />} />
              <Route path="/usuarios" element={<UsuariosPage />} />
              <Route path="*" element={<Navigate to="/solicitacoes" replace />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </AuthProvider>
  )
}
