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

export function AppLayout() {
  const location = useLocation()
  const realtimeStatus = useRealtimeSubscriptions()
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
    <div className="flex h-full print:block print:h-auto">
      <GlobalProgressBar />
      {/* Navegação em drawer (hamburger) — não há mais sidebar fixa. */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" hideClose className="w-[260px] p-0">
          <SidebarContent
            collapsed={false}
            onNavigate={() => setMobileOpen(false)}
            onClose={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col print:block">
        <div className="print:hidden">
          <Header
            onOpenMobileMenu={() => setMobileOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
            realtimeStatus={realtimeStatus}
          />
        </div>
        <main className="flex-1 overflow-y-auto bg-muted/60 p-3 print:overflow-visible print:bg-transparent print:p-0 sm:p-4 md:p-6">
          <div className="min-h-full rounded-lg border bg-background p-4 print:rounded-none print:border-0 print:p-0 sm:p-5 md:p-6">
            <NovaSolicitacaoProvider>
              <Outlet />
            </NovaSolicitacaoProvider>
          </div>
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
