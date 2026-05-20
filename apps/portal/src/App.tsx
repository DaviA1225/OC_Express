import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { PortalLayout } from '@/components/layout/PortalLayout'
import { PortalLoader } from '@/components/PortalLoader'
import LoginPage from '@/pages/LoginPage'

const SolicitacoesPage = lazy(() => import('@/pages/solicitacoes/SolicitacoesListPage'))
const NovaSolicitacaoPage = lazy(() => import('@/pages/solicitacoes/NovaSolicitacaoPage'))
const SolicitacaoDetailPage = lazy(() => import('@/pages/solicitacoes/SolicitacaoDetailPage'))
const MotoristasPage = lazy(() => import('@/pages/cadastros/MotoristasPage'))
const VeiculosPage = lazy(() => import('@/pages/cadastros/VeiculosPage'))
const CarretasPage = lazy(() => import('@/pages/cadastros/CarretasPage'))
const SubcontratadasPage = lazy(() => import('@/pages/cadastros/SubcontratadasPage'))
const UsuariosPage = lazy(() => import('@/pages/UsuariosPage'))
const MinhaContaPage = lazy(() => import('@/pages/MinhaContaPage'))

export function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<PortalLoader />}>
        <Routes>
          <Route path="/" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<PortalLayout />}>
              <Route path="/solicitacoes" element={<SolicitacoesPage />} />
              <Route path="/solicitacoes/nova" element={<NovaSolicitacaoPage />} />
              <Route path="/solicitacoes/:id" element={<SolicitacaoDetailPage />} />
              <Route path="/motoristas" element={<MotoristasPage />} />
              <Route path="/veiculos" element={<VeiculosPage />} />
              <Route path="/carretas" element={<CarretasPage />} />
              <Route path="/subcontratadas" element={<SubcontratadasPage />} />
              <Route path="/usuarios" element={<UsuariosPage />} />
              <Route path="/minha-conta" element={<MinhaContaPage />} />
              <Route path="*" element={<Navigate to="/solicitacoes" replace />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </AuthProvider>
  )
}
