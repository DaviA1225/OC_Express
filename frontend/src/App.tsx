import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { PerfilRoute } from '@/components/shared/PerfilRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import LoginPage from '@/pages/auth/LoginPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'

const SubcontratadasPage = lazy(() => import('@/pages/cadastros/SubcontratadasPage'))
const MotoristasPage = lazy(() => import('@/pages/cadastros/MotoristasPage'))
const VeiculosPage = lazy(() => import('@/pages/cadastros/VeiculosPage'))
const CarretasPage = lazy(() => import('@/pages/cadastros/CarretasPage'))
const ClientesPage = lazy(() => import('@/pages/cadastros/ClientesPage'))
const MateriaisPage = lazy(() => import('@/pages/cadastros/MateriaisPage'))
const UsuariosPage = lazy(() => import('@/pages/cadastros/UsuariosPage'))
const SolicitacoesListPage = lazy(() =>
  import('@/pages/solicitacoes/SolicitacoesListPage').then((m) => ({ default: m.SolicitacoesListPage })),
)
const SolicitacaoDetailPage = lazy(() =>
  import('@/pages/solicitacoes/SolicitacaoDetailPage').then((m) => ({ default: m.SolicitacaoDetailPage })),
)
const CargasRetornoPage = lazy(() => import('@/pages/cargas-retorno/CargasRetornoPage'))
const AuditoriaPage = lazy(() => import('@/pages/auditoria/AuditoriaPage'))
const RelatoriosPage = lazy(() => import('@/pages/relatorios/RelatoriosPage'))
const PerfilPage = lazy(() => import('@/pages/perfil/PerfilPage'))

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <TooltipProvider delayDuration={200}>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/solicitacoes" element={<SolicitacoesListPage />} />
                <Route path="/solicitacoes/:id" element={<SolicitacaoDetailPage />} />
                <Route path="/cargas-retorno" element={<CargasRetornoPage />} />
                <Route path="/cadastros/motoristas" element={<MotoristasPage />} />
                <Route path="/cadastros/veiculos" element={<VeiculosPage />} />
                <Route path="/cadastros/carretas" element={<CarretasPage />} />
                <Route path="/cadastros/clientes" element={<ClientesPage />} />
                <Route path="/cadastros/materiais" element={<MateriaisPage />} />
                <Route path="/cadastros/subcontratadas" element={<SubcontratadasPage />} />

                <Route element={<PerfilRoute allowed={['admin']} />}>
                  <Route path="/cadastros/usuarios" element={<UsuariosPage />} />
                </Route>

                <Route element={<PerfilRoute allowed={['admin', 'gerente', 'supervisor', 'analista']} />}>
                  <Route path="/relatorios" element={<RelatoriosPage />} />
                  <Route path="/auditoria" element={<AuditoriaPage />} />
                </Route>

                <Route path="/perfil" element={<PerfilPage />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </TooltipProvider>
    </AuthProvider>
  )
}
