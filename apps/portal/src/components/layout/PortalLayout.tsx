import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, User, Sun, Moon } from 'lucide-react'
import { useAuth, hasPerfilParceiro } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { PendenciasBell } from '@/components/layout/PendenciasBell'
import { usePortalRealtime } from '@/hooks/usePortalRealtime'
import { iniciais, labelPerfil } from '@/features/auth/perfis'
import { useEntradaDeRota } from '@/hooks/useMovimento'

// Contatos de suporte da LHG (WhatsApp +55 67 9 9871-2180).
const SUPORTE_EMAIL = 'davi.silva@lhgmining.com.br'
const SUPORTE_WHATSAPP = 'https://wa.me/5567998712180'

interface NavItem {
  to: string
  label: string
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/solicitacoes', label: 'Solicitações' },
  { to: '/motoristas', label: 'Motoristas' },
  { to: '/veiculos', label: 'Veículos' },
  { to: '/carretas', label: 'Carretas' },
  { to: '/subcontratadas', label: 'Subcontratadas' },
  { to: '/pamcards', label: 'Cartões Pamcard' },
  { to: '/usuarios', label: 'Usuários', adminOnly: true },
]

export function PortalLayout() {
  const { parceiroUsuario, parceiro, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Troca de rota: só o conteúdo faz fade + 4px; header e menu ficam parados.
  const conteudoRef = useEntradaDeRota<HTMLDivElement>(location.pathname)
  const isAdmin = hasPerfilParceiro(parceiroUsuario, 'admin_parceiro')
  const navItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)

  // Atualiza pendências ao vivo (o parceiro recebe os eventos das suas pendências).
  usePortalRealtime()

  const handleSignOut = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      {/* Header — 56px */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-body-sm font-semibold text-primary-foreground">
            LHG
          </div>
          <div className="leading-tight">
            <p className="text-body-lg font-semibold text-foreground">Portal Parceiros LHG</p>
            <p className="text-meta text-muted-foreground">
              {parceiro?.razao_social ?? 'Transportadora parceira'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
        <ThemeToggle />
        <PendenciasBell />
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-1.5 py-1 outline-none transition-colors duration-fast hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-accent text-body-sm font-medium text-foreground">
                {iniciais(parceiroUsuario?.nome_completo ?? '?')}
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-body font-medium text-foreground sm:inline">
              {parceiroUsuario?.nome_completo ?? 'Usuário'}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[220px]">
            <DropdownMenuLabel>
              {parceiroUsuario?.perfil === 'admin_parceiro'
                ? 'Administrador do parceiro'
                : labelPerfil(parceiroUsuario?.perfil ?? 'operador_parceiro')}
            </DropdownMenuLabel>
            <div className="px-2 pb-1.5 pt-0.5">
              <p className="truncate text-body font-medium text-foreground">
                {parceiroUsuario?.nome_completo}
              </p>
              <p className="truncate text-body-sm text-muted-foreground">
                {parceiroUsuario?.email}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/minha-conta')}>
              <User className="mr-2 h-4 w-4" />
              Minha conta
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void handleSignOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </header>

      {/* Navegação horizontal — 44px */}
      <nav className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b bg-card px-2 sm:px-5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                // Igual ao menu do interno: hover = elevação sutil (sobe 2px) +
                // realce de cor, 120ms; sem zoom nem deslize lateral. Ativo =
                // texto 1 + sublinhado de 2px do acento azul (sem glow).
                'relative my-1.5 flex h-8 items-center whitespace-nowrap rounded-md px-3 text-body font-medium',
                'transition-[transform,background-color,color] duration-fast ease-out hover:-translate-y-0.5',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                isActive
                  ? 'text-foreground after:absolute after:inset-x-2 after:-bottom-1.5 after:h-0.5 after:bg-primary after:content-[""]'
                  : 'text-muted-foreground hover:bg-row-hover hover:text-foreground',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Conteúdo — padding 24px */}
      <main className="flex-1 p-3 sm:p-4 md:px-6 md:py-5">
        <div ref={conteudoRef}>
          <Outlet />
        </div>
      </main>

      <footer className="shrink-0 border-t bg-card px-6 py-3">
        <p className="text-body-sm text-muted-foreground">
          Precisa de ajuda?{' '}
          <a href={`mailto:${SUPORTE_EMAIL}`} className="font-medium text-primary-strong hover:underline">
            Suporte por e-mail
          </a>
          {' · '}
          <a
            href={SUPORTE_WHATSAPP}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-primary-strong hover:underline"
          >
            Suporte por WhatsApp
          </a>
        </p>
      </footer>
    </div>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-fast hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
