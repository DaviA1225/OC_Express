import { useNavigate } from 'react-router-dom'
import { Menu, Search, ChevronDown, LogOut, UserCircle, Sun, Moon, Rows3, Check } from 'lucide-react'
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

interface HeaderProps {
  pageTitle?: string
  onOpenMobileMenu: () => void
  onOpenSearch: () => void
  realtimeStatus?: RealtimeStatus
}

export function Header({ pageTitle, onOpenMobileMenu, onOpenSearch, realtimeStatus = 'connecting' }: HeaderProps) {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  const { density, toggle: toggleDensity } = useDensity()

  const nome = profile?.nome_completo ?? user?.email ?? 'Usuário'
  const inicial = nome.trim().charAt(0).toUpperCase() || '?'

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-[#1D1E1B] px-4 text-primary-foreground">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
        onClick={onOpenMobileMenu}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {pageTitle && (
        <h1 className="hidden truncate text-[15px] font-semibold text-primary-foreground md:block">
          {pageTitle}
        </h1>
      )}

      <div className="flex flex-1 justify-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="sm:hidden text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
          onClick={onOpenSearch}
          aria-label="Buscar (Ctrl+K)"
        >
          <Search className="h-5 w-5" />
        </Button>
        <button
          type="button"
          onClick={onOpenSearch}
          className={cn(
            'hidden h-9 w-full max-w-md items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 text-[13px] text-primary-foreground/90 transition-colors hover:bg-white/20 sm:flex',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
          )}
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Buscar (Ctrl+K)</span>
          <kbd className="hidden rounded border border-white/30 bg-white/10 px-1.5 py-0.5 text-[10px] text-primary-foreground/90 sm:inline">
            Ctrl K
          </kbd>
        </button>
      </div>

      <RealtimeIndicator status={realtimeStatus} />

      <ThemeToggle />

      <NotificationsBell />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <Avatar className="h-8 w-8 border border-white/30">
              <AvatarFallback className="bg-white/15 text-primary-foreground">{inicial}</AvatarFallback>
            </Avatar>
            <span className="hidden text-[13px] font-medium text-primary-foreground md:inline">
              {nome.split(' ')[0]}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-primary-foreground/80" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <div className="px-2 py-1.5">
            <p className="truncate text-[13px] font-medium text-foreground">{nome}</p>
            {profile && (
              <p className="text-[11px] text-muted-foreground">
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
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
      className="text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}

function RealtimeIndicator({ status }: { status: RealtimeStatus }) {
  const config: Record<RealtimeStatus, { dot: string; label: string }> = {
    connecting: { dot: 'bg-amber-300 animate-pulse', label: 'Conectando…' },
    live: { dot: 'bg-emerald-300', label: 'Ao vivo · sincronizado entre usuários' },
    error: { dot: 'bg-red-300', label: 'Sem conexão em tempo real' },
  }
  const c = config[status]
  return (
    <div
      className="hidden items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-2 py-1 text-[11px] text-primary-foreground/90 sm:flex"
      title={c.label}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />
      <span className="hidden md:inline">{status === 'live' ? 'Ao vivo' : c.label}</span>
    </div>
  )
}

function labelPerfil(p: string): string {
  switch (p) {
    case 'admin': return 'Administrador'
    case 'gerente': return 'Gerente'
    case 'supervisor': return 'Supervisor'
    case 'analista': return 'Analista'
    case 'assistente': return 'Assistente'
    default: return p
  }
}
