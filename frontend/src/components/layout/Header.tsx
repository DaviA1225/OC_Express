import { useNavigate } from 'react-router-dom'
import { Menu, Search, ChevronDown, LogOut, UserCircle } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import type { RealtimeStatus } from '@/features/realtime/useRealtimeSubscriptions'

interface HeaderProps {
  pageTitle?: string
  onOpenMobileMenu: () => void
  onOpenSearch: () => void
  realtimeStatus?: RealtimeStatus
}

export function Header({ pageTitle, onOpenMobileMenu, onOpenSearch, realtimeStatus = 'idle' }: HeaderProps) {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()

  const nome = profile?.nome_completo ?? user?.email ?? 'Usuário'
  const inicial = nome.trim().charAt(0).toUpperCase() || '?'

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onOpenMobileMenu}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {pageTitle && (
        <h1 className="hidden truncate text-[15px] font-medium text-foreground md:block">
          {pageTitle}
        </h1>
      )}

      <div className="flex flex-1 justify-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="sm:hidden"
          onClick={onOpenSearch}
          aria-label="Buscar (Ctrl+K)"
        >
          <Search className="h-5 w-5" />
        </Button>
        <button
          type="button"
          onClick={onOpenSearch}
          className={cn(
            'hidden h-9 w-full max-w-md items-center gap-2 rounded-md border bg-muted/40 px-3 text-[13px] text-muted-foreground transition-colors hover:bg-muted sm:flex',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Buscar (Ctrl+K)</span>
          <kbd className="hidden rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            Ctrl K
          </kbd>
        </button>
      </div>

      <RealtimeIndicator status={realtimeStatus} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback>{inicial}</AvatarFallback>
            </Avatar>
            <span className="hidden text-[13px] font-medium text-foreground md:inline">
              {nome.split(' ')[0]}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
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

function RealtimeIndicator({ status }: { status: RealtimeStatus }) {
  const config: Record<RealtimeStatus, { dot: string; label: string }> = {
    idle: { dot: 'bg-slate-300', label: 'Aguardando…' },
    connecting: { dot: 'bg-amber-400 animate-pulse', label: 'Conectando…' },
    live: { dot: 'bg-emerald-500', label: 'Ao vivo · sincronizado entre usuários' },
    error: { dot: 'bg-red-500', label: 'Sem conexão em tempo real' },
  }
  const c = config[status]
  return (
    <div
      className="hidden items-center gap-1.5 rounded-full border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground sm:flex"
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
