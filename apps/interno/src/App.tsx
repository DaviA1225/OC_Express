import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { PerfilRoute } from '@/components/shared/PerfilRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { VigiaDeSessao } from '@/features/auth/VigiaDeSessao'
import { TermosDialog } from '@/features/termos/TermosDialog'
import LoginPage from '@/pages/auth/LoginPage'

// O Dashboard entra em lazy junto com as demais páginas. Importado direto, ele
// arrastava o recharts (~107 kB gzip, chunk `charts`) para o modulepreload do
// index.html — baixado até por quem estava só na tela de login. O LoginPage
// segue estático de propósito: é a primeira tela de quem não tem sessão.
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
const SubcontratadasPage = lazy(() => import('@/pages/cadastros/SubcontratadasPage'))
const MotoristasPage = lazy(() => import('@/pages/cadastros/MotoristasPage'))
const VeiculosPage = lazy(() => import('@/pages/cadastros/VeiculosPage'))
const CarretasPage = lazy(() => import('@/pages/cadastros/CarretasPage'))
const ClientesPage = lazy(() => import('@/pages/cadastros/ClientesPage'))
const MateriaisPage = lazy(() => import('@/pages/cadastros/MateriaisPage'))
const ParceirosPage = lazy(() => import('@/pages/cadastros/ParceirosPage'))
const ParceiroUsuariosPage = lazy(() => import('@/pages/cadastros/ParceiroUsuariosPage'))
const UsuariosPage = lazy(() => import('@/pages/cadastros/UsuariosPage'))
const SolicitacoesListPage = lazy(() =>
  import('@/pages/solicitacoes/SolicitacoesListPage').then((m) => ({ default: m.SolicitacoesListPage })),
)
const SolicitacaoDetailPage = lazy(() =>
  import('@/pages/solicitacoes/SolicitacaoDetailPage').then((m) => ({ default: m.SolicitacaoDetailPage })),
)
const AgendamentosPage = lazy(() => import('@/pages/agendamentos/AgendamentosPage'))
const CargasRetornoPage = lazy(() => import('@/pages/cargas-retorno/CargasRetornoPage'))
const ConferenciaViagemPage = lazy(() => import('@/pages/conferencia/ConferenciaViagemPage'))
const AuditoriaPage = lazy(() => import('@/pages/auditoria/AuditoriaPage'))
const SegurancaPage = lazy(() => import('@/pages/seguranca/SegurancaPage'))
const RelatoriosPage = lazy(() => import('@/pages/relatorios/RelatoriosPage'))
const RelatoriosInternosPage = lazy(() => import('@/pages/relatorios/RelatoriosInternosPage'))
const AtividadeEquipePage = lazy(() => import('@/pages/atividade/AtividadeEquipePage'))
const PerfilPage = lazy(() => import('@/pages/perfil/PerfilPage'))
const NotFoundPage = lazy(() => import('@/pages/errors/NotFoundPage'))
// Página pública de apresentação. Lazy como as demais: quem só vai logar não
// baixa a maquete do painel junto com a tela de login.
const ApresentacaoPage = lazy(() => import('@/pages/publico/ApresentacaoPage'))

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
        {/* Fora do <Routes>: a contagem de inatividade não pode reiniciar a
            cada navegação. */}
        <VigiaDeSessao />
        <TermosDialog />
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* Fora do ProtectedRoute de propósito: é para quem ainda não
                entrou, e para quem nem tem conta. */}
            <Route path="/sobre" element={<ApresentacaoPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/solicitacoes" element={<SolicitacoesListPage />} />
                <Route path="/solicitacoes/:id" element={<SolicitacaoDetailPage />} />
                <Route path="/agendamentos" element={<AgendamentosPage />} />
                <Route path="/cargas-retorno" element={<CargasRetornoPage />} />
                <Route path="/conferencia-viagem" element={<ConferenciaViagemPage />} />
                <Route path="/cadastros/motoristas" element={<MotoristasPage />} />
                <Route path="/cadastros/veiculos" element={<VeiculosPage />} />
                <Route path="/cadastros/carretas" element={<CarretasPage />} />
                <Route path="/cadastros/clientes" element={<ClientesPage />} />
                <Route path="/cadastros/materiais" element={<MateriaisPage />} />
                <Route path="/cadastros/subcontratadas" element={<SubcontratadasPage />} />
                <Route path="/cadastros/parceiros" element={<ParceirosPage />} />

                <Route element={<PerfilRoute allowed={['admin', 'gerente', 'supervisor']} />}>
                  <Route path="/cadastros/parceiros/:id/usuarios" element={<ParceiroUsuariosPage />} />
                </Route>

                <Route element={<PerfilRoute allowed={['admin']} />}>
                  <Route path="/cadastros/usuarios" element={<UsuariosPage />} />
                </Route>

                <Route element={<PerfilRoute allowed={['admin', 'gerente', 'supervisor', 'analista']} />}>
                  <Route path="/relatorios" element={<RelatoriosPage />} />
                </Route>
                <Route element={<PerfilRoute allowed={['admin', 'gerente', 'supervisor']} />}>
                  <Route path="/relatorios-internos" element={<RelatoriosInternosPage />} />
                </Route>
                <Route element={<PerfilRoute allowed={['admin', 'gerente', 'supervisor']} />}>
                  <Route path="/atividade" element={<AtividadeEquipePage />} />
                </Route>
                <Route element={<PerfilRoute allowed={['admin', 'gerente', 'supervisor']} />}>
                  <Route path="/auditoria" element={<AuditoriaPage />} />
                </Route>
                <Route element={<PerfilRoute allowed={['admin']} />}>
                  <Route path="/seguranca" element={<SegurancaPage />} />
                </Route>

                <Route path="/perfil" element={<PerfilPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </TooltipProvider>
    </AuthProvider>
  )
}
