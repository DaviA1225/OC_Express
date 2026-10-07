import * as React from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SidebarContent } from './Sidebar'
import { Header } from './Header'
import { GlobalProgressBar } from './GlobalProgressBar'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { ErrorBoundary, ErroDaTela } from '@/components/shared/ErrorBoundary'
import { NovaSolicitacaoProvider } from '@/features/solicitacoes/NovaSolicitacaoProvider'
import { useRealtimeSubscriptions } from '@/features/realtime/useRealtimeSubscriptions'
import { useLayoutPreferido } from '@/features/layout/useLayoutPreferido'
import { BarraStatusErp, AtalhosErp } from './BarraStatusErp'
import { JanelasErp } from './JanelasErp'

const GlobalSearchDialog = React.lazy(() =>
  import('@/features/search/GlobalSearchDialog').then((m) => ({ default: m.GlobalSearchDialog })),
)

const BARRA_KEY = 'sislog.erp.barra-recolhida'

// Recolher a barra é conveniência do computador, não preferência da pessoa:
// fica no navegador. Sem storage (aba anônima), começa aberta.
function lerBarraRecolhida(): boolean {
  try {
    return window.localStorage.getItem(BARRA_KEY) === '1'
  } catch {
    return false
  }
}

export function AppLayout() {
  const location = useLocation()
  const realtimeStatus = useRealtimeSubscriptions()
  const { modoErp } = useLayoutPreferido()
  const [barraRecolhida, setBarraRecolhida] = React.useState(lerBarraRecolhida)
  const alternarBarra = () => {
    setBarraRecolhida((v) => {
      try { window.localStorage.setItem(BARRA_KEY, v ? '0' : '1') } catch { /* sem storage: vale só na sessão */ }
      return !v
    })
  }
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [lastPath, setLastPath] = React.useState(location.pathname)
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    if (mobileOpen) setMobileOpen(false)
    if (searchOpen) setSearchOpen(false)
  }

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

  return (
    <div className="flex h-full flex-col print:block print:h-auto">
    <div className="flex min-h-0 flex-1 print:block">
      <GlobalProgressBar />
      {/* Navegação em drawer (hamburger) — não há mais sidebar fixa. */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" hideClose className="w-[300px] max-w-[85vw] p-0">
          <SidebarContent
            collapsed={false}
            onNavigate={() => setMobileOpen(false)}
            onClose={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Modo ERP (fase 1): a navegação vira barra de módulos FIXA no desktop.
          Em tela estreita não cabe — lá segue o drawer do botão Menu. */}
      {modoErp && (
        <div
          className={cn(
            'hidden shrink-0 border-r lg:block print:hidden',
            barraRecolhida ? 'w-16' : 'w-[260px]',
          )}
        >
          <SidebarContent collapsed={barraRecolhida} onToggleCollapse={alternarBarra} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col print:block">
        <div className="print:hidden">
          <Header
            onOpenMobileMenu={() => setMobileOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
            realtimeStatus={realtimeStatus}
          />
        </div>
        {modoErp && <JanelasErp />}
        <main className="flex-1 overflow-y-auto bg-muted/60 p-3 print:overflow-visible print:bg-transparent print:p-0 sm:p-4 md:p-6">
          <div className="min-h-full rounded-lg border bg-background p-4 print:rounded-none print:border-0 print:p-0 sm:p-5 md:p-6">
            <NovaSolicitacaoProvider>
              {modoErp && <AtalhosErp />}
              {/* Erro numa tela fica nela: menu e cabeçalho seguem vivos, e
                  trocar de rota descarta o erro. */}
              <ErrorBoundary resetKey={location.pathname} fallback={(p) => <ErroDaTela {...p} />}>
                <Outlet />
              </ErrorBoundary>
            </NovaSolicitacaoProvider>
          </div>
        </main>
      </div>
    </div>

      {modoErp && <BarraStatusErp realtimeStatus={realtimeStatus} />}

      {searchOpen && (
        <React.Suspense fallback={null}>
          <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
        </React.Suspense>
      )}
    </div>
  )
}
