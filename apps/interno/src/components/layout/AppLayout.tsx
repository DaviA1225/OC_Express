import * as React from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SidebarContent } from './Sidebar'
import { Header } from './Header'
import { GlobalProgressBar } from './GlobalProgressBar'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { NovaSolicitacaoProvider } from '@/features/solicitacoes/NovaSolicitacaoProvider'
import { useRealtimeSubscriptions } from '@/features/realtime/useRealtimeSubscriptions'

const GlobalSearchDialog = React.lazy(() =>
  import('@/features/search/GlobalSearchDialog').then((m) => ({ default: m.GlobalSearchDialog })),
)

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/solicitacoes': 'Solicitações',
  '/cargas-retorno': 'Cargas de Retorno',
  '/cadastros/motoristas': 'Motoristas',
  '/cadastros/veiculos': 'Veículos',
  '/cadastros/carretas': 'Carretas',
  '/cadastros/clientes': 'Clientes',
  '/cadastros/materiais': 'Materiais',
  '/cadastros/subcontratadas': 'Subcontratadas',
  '/cadastros/parceiros': 'Parceiros',
  '/cadastros/usuarios': 'Usuários',
  '/auditoria': 'Auditoria',
  '/relatorios': 'Relatórios',
  '/perfil': 'Meu perfil',
}

const COLLAPSED_KEY = 'sislog.sidebar.collapsed'

export function AppLayout() {
  const location = useLocation()
  const realtimeStatus = useRealtimeSubscriptions()
  const [collapsed, setCollapsed] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(COLLAPSED_KEY) === '1'
  })
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [lastPath, setLastPath] = React.useState(location.pathname)
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    if (mobileOpen) setMobileOpen(false)
    if (searchOpen) setSearchOpen(false)
  }

  React.useEffect(() => {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  // Atalhos globais (SPEC-FRONTEND 1.2)
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
        return
      }
      if (e.key === '/' && !isTyping) {
        const search = document.querySelector<HTMLInputElement>(
          '[data-page-search] input, input[data-page-search]',
        )
        if (search) {
          e.preventDefault()
          search.focus()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const pageTitle = PAGE_TITLES[location.pathname] ?? ''

  return (
    <div className="flex h-full print:block print:h-auto">
      <GlobalProgressBar />
      {/* Sidebar desktop */}
      <div className="hidden md:flex print:hidden">
        <SidebarContent
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
      </div>

      {/* Sidebar mobile (Sheet) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[260px] p-0">
          <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col print:block">
        <div className="print:hidden">
          <Header
            pageTitle={pageTitle}
            onOpenMobileMenu={() => setMobileOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
            realtimeStatus={realtimeStatus}
          />
        </div>
        <main className="flex-1 overflow-y-auto bg-muted/30 px-3 py-4 print:overflow-visible print:bg-transparent print:p-0 sm:px-4 sm:py-5 md:px-6 md:py-6">
          <NovaSolicitacaoProvider>
            <Outlet />
          </NovaSolicitacaoProvider>
        </main>
      </div>

      {searchOpen && (
        <React.Suspense fallback={null}>
          <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
        </React.Suspense>
      )}
    </div>
  )
}
