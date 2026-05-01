import * as React from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { SidebarContent } from './Sidebar'
import { Header } from './Header'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { NovaSolicitacaoProvider } from '@/features/solicitacoes/NovaSolicitacaoProvider'

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
  '/cadastros/usuarios': 'Usuários',
  '/auditoria': 'Auditoria',
  '/perfil': 'Meu perfil',
}

const COLLAPSED_KEY = 'sislog.sidebar.collapsed'

export function AppLayout() {
  const location = useLocation()
  const [collapsed, setCollapsed] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(COLLAPSED_KEY) === '1'
  })
  const [mobileOpen, setMobileOpen] = React.useState(false)

  React.useEffect(() => {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  React.useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

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
        toast.info('Busca global em desenvolvimento.')
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
    <div className="flex h-full">
      {/* Sidebar desktop */}
      <div className="hidden md:flex">
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

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          pageTitle={pageTitle}
          onOpenMobileMenu={() => setMobileOpen(true)}
          onOpenSearch={() => toast.info('Busca global em desenvolvimento.')}
        />
        <main className="flex-1 overflow-y-auto bg-muted/30 px-4 py-5 md:px-6 md:py-6">
          <NovaSolicitacaoProvider>
            <Outlet />
          </NovaSolicitacaoProvider>
        </main>
      </div>
    </div>
  )
}
