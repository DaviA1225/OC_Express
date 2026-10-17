import { useNavigate } from 'react-router-dom'
import { Menu, Search, ChevronDown, LogOut, UserCircle, Sun, Moon, Rows3, Check, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { useDensity } from '@/hooks/useDensity'
import { cn } from '@/lib/utils'
import type { RealtimeStatus } from '@/features/realtime/useRealtimeSubscriptions'
import { NotificationsBell } from '@/features/notifications/NotificationsBell'
import { useLayoutPreferido } from '@/features/layout/useLayoutPreferido'
import { iniciais, labelPerfil } from '@/features/auth/perfis'

interface HeaderProps {
  onOpenMobileMenu: () => void
  onOpenSearch: () => void
  realtimeStatus?: RealtimeStatus
}

export function Header({ onOpenMobileMenu, onOpenSearch, realtimeStatus = 'connecting' }: HeaderProps) {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  const { density, toggle: toggleDensity } = useDensity()
  const { modoErp, podeUsarErp, salvando, definir } = useLayoutPreferido()

  const nome = profile?.nome_completo ?? user?.email ?? 'Usuário'

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    // Barra superior fria (token --header) nos dois temas, 48px; no escuro um
    // hairline separa do canvas.
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-white/10 bg-header px-2 text-header-foreground sm:gap-3 sm:px-3">
      {/* Esquerda: hamburger + logo */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onOpenMobileMenu}
          aria-label="Abrir menu de navegação"
          // No modo ERP a barra de módulos fica fixa ao lado no desktop; o
          // botão só sobra em tela estreita, onde a barra não cabe.
          className={cn(modoErp && 'lg:hidden', 'h-9 gap-2 px-2.5 text-body font-medium text-white hover:bg-white/10 hover:text-white focus-visible:ring-white/70 focus-visible:ring-offset-0 [&_svg]:size-5')}
        >
          <Menu strokeWidth={1.75} />
          Menu
        </Button>
        <div className={cn('flex items-center gap-2', modoErp && 'lg:hidden')}>
          <img src="/favicon.svg" alt="" aria-hidden className="h-6 w-6 shrink-0" />
          <span className="hidden text-body-lg font-semibold text-white sm:inline">
            SisLog
          </span>
        </div>
      </div>

      {/* Centro: busca global */}
      <div className="flex min-w-0 flex-1 justify-center px-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="sm:hidden text-white hover:bg-white/10 hover:text-white"
          onClick={onOpenSearch}
          aria-label="Buscar (Ctrl+K)"
        >
          <Search className="h-5 w-5" />
        </Button>
        <button
          type="button"
          onClick={onOpenSearch}
          className={cn(
            'hidden h-8 w-full max-w-md items-center gap-2 rounded-md border border-white/20 bg-white/[0.06] px-3 text-body text-white/80 transition-colors duration-fast hover:bg-white/10 sm:flex',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
          )}
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-left">Buscar (Ctrl+K)</span>
          <kbd className="hidden rounded-[2px] border border-white/25 px-1.5 text-meta text-white/80 sm:inline">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Direita: status de rede + controles */}
      <div className="flex items-center gap-1.5 sm:gap-2">

        <RealtimeIndicator status={realtimeStatus} />

      <ThemeToggle />

      <NotificationsBell />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-md px-1.5 transition-colors duration-fast hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-white/15 text-body-sm text-white">{iniciais(nome)}</AvatarFallback>
            </Avatar>
            <span className="hidden text-body font-medium text-white md:inline">
              {nome.split(' ')[0]}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-white/80" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <div className="px-2 py-1.5">
            <p className="truncate text-body font-medium text-foreground">{nome}</p>
            {profile && (
              <p className="text-meta text-muted-foreground">
                {labelPerfil(profile.perfil)}
              </p>
            )}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/perfil')}>
            <UserCircle className="mr-2 h-4 w-4" />
            Meu perfil
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.preventDefault(); toggleDensity() }}>
            <Rows3 className="mr-2 h-4 w-4" />
            <span className="flex-1">Densidade compacta</span>
            {density === 'compact' && <Check className="ml-2 h-3.5 w-3.5 text-primary-strong" />}
          </DropdownMenuItem>
          {podeUsarErp && (
            <DropdownMenuItem
              disabled={salvando}
              onClick={(e) => { e.preventDefault(); void definir(modoErp ? 'classico' : 'erp') }}
            >
              <LayoutGrid className="mr-2 h-4 w-4" />
              <span className="flex-1">Modo ERP (beta)</span>
              {modoErp && <Check className="ml-2 h-3.5 w-3.5 text-primary-strong" />}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
      className="text-white hover:bg-white/10 hover:text-white"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}

function RealtimeIndicator({ status }: { status: RealtimeStatus }) {
  const config: Record<RealtimeStatus, { dot: string; label: string }> = {
    connecting: { dot: 'bg-warning animate-pulse', label: 'Conectando…' },
    live: { dot: 'bg-success', label: 'Ao vivo · sincronizado entre usuários' },
    error: { dot: 'bg-danger', label: 'Sem conexão em tempo real' },
  }
  const c = config[status]
  // `dark` no contêiner: a barra do header é escura nos dois temas, então os
  // tokens semânticos resolvem para os tons claros do tema escuro (legíveis aqui).
  return (
    <div
      className="dark hidden items-center gap-1.5 rounded-[2px] px-2 py-1 text-meta text-white/80 sm:flex"
      title={c.label}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />
      <span className="hidden md:inline">{status === 'live' ? 'Ao vivo' : c.label}</span>
    </div>
  )
}

