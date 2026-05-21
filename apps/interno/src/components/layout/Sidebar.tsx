import * as React from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Inbox,
  RotateCcw,
  User,
  Truck,
  Container,
  Building2,
  Package,
  Handshake,
  Network,
  Users,
  Search,
  BarChart3,
  ShieldAlert,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { canViewAuditoria, canViewUsuarios, canViewRelatorios, canViewSeguranca } from '@/features/auth/permissions'
import { usePamcardPendenteCount } from '@/features/solicitacoes/useSolicitacoes'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const operacional: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/solicitacoes', label: 'Solicitações', icon: Inbox },
  { to: '/cargas-retorno', label: 'Cargas de Retorno', icon: RotateCcw },
]

const cadastros: NavItem[] = [
  { to: '/cadastros/motoristas', label: 'Motoristas', icon: User },
  { to: '/cadastros/veiculos', label: 'Veículos', icon: Truck },
  { to: '/cadastros/carretas', label: 'Carretas', icon: Container },
  { to: '/cadastros/clientes', label: 'Clientes', icon: Building2 },
  { to: '/cadastros/materiais', label: 'Materiais', icon: Package },
  { to: '/cadastros/subcontratadas', label: 'Subcontratadas', icon: Handshake },
  { to: '/cadastros/parceiros', label: 'Parceiros', icon: Network },
]

const sistemaAdmin: NavItem = { to: '/cadastros/usuarios', label: 'Usuários', icon: Users }
const sistemaRelatorios: NavItem = { to: '/relatorios', label: 'Relatórios', icon: BarChart3 }
const sistemaAuditoria: NavItem = { to: '/auditoria', label: 'Auditoria', icon: Search }
const sistemaSeguranca: NavItem = { to: '/seguranca', label: 'Segurança', icon: ShieldAlert }

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse?: () => void
  onNavigate?: () => void
  className?: string
}

export function SidebarContent({ collapsed, onToggleCollapse, onNavigate, className }: SidebarProps) {
  const { profile } = useAuth()
  const showUsuarios = canViewUsuarios(profile)
  const showAuditoria = canViewAuditoria(profile)
  const showRelatorios = canViewRelatorios(profile)
  const showSeguranca = canViewSeguranca(profile)
  const pamcardPendente = usePamcardPendenteCount()
  const pamcardPendenteCount = pamcardPendente.data ?? 0

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r bg-background',
        collapsed ? 'w-16' : 'w-[220px]',
        className,
      )}
    >
      <div
        className={cn(
          'flex h-14 items-center border-b',
          collapsed ? 'justify-center px-2' : 'px-4',
        )}
      >
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" aria-hidden className="h-7 w-7 shrink-0" />
          {!collapsed && (
            <span className="text-[14px] font-medium text-foreground">SisLog</span>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {operacional.map((item) => (
            <NavListItem
              key={item.to}
              item={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
              badgeCount={item.to === '/solicitacoes' ? pamcardPendenteCount : 0}
            />
          ))}
        </ul>

        <SectionLabel collapsed={collapsed}>Cadastros</SectionLabel>
        <ul className="space-y-0.5">
          {cadastros.map((item) => (
            <NavListItem
              key={item.to}
              item={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </ul>

        {(showUsuarios || showAuditoria || showRelatorios || showSeguranca) && (
          <>
            <SectionLabel collapsed={collapsed}>Sistema</SectionLabel>
            <ul className="space-y-0.5">
              {showRelatorios && (
                <NavListItem
                  item={sistemaRelatorios}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              )}
              {showUsuarios && (
                <NavListItem
                  item={sistemaAdmin}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              )}
              {showAuditoria && (
                <NavListItem
                  item={sistemaAuditoria}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              )}
              {showSeguranca && (
                <NavListItem
                  item={sistemaSeguranca}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              )}
            </ul>
          </>
        )}
      </nav>

      {onToggleCollapse && (
        <div className="border-t p-2">
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              collapsed && 'justify-center',
            )}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronsLeft className="h-4 w-4" />
                <span>Recolher</span>
              </>
            )}
          </button>
        </div>
      )}
    </aside>
  )
}

function SectionLabel({
  children,
  collapsed,
}: {
  children: React.ReactNode
  collapsed: boolean
}) {
  if (collapsed) {
    return <div className="my-3 h-px bg-border" />
  }
  return (
    <div className="mb-1 mt-4 px-2 text-[10px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
      {children}
    </div>
  )
}

function NavListItem({
  item,
  collapsed,
  onNavigate,
  badgeCount = 0,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate?: () => void
  badgeCount?: number
}) {
  const Icon = item.icon
  return (
    <li>
      <NavLink
        to={item.to}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'group relative flex h-9 items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors',
            isActive
              ? 'bg-primary/10 text-primary before:absolute before:left-0 before:top-1/2 before:h-5 before:-translate-y-1/2 before:rounded-r-full before:bg-primary before:content-[""] ' +
                (collapsed ? 'before:w-0.5' : 'before:w-1')
              : 'text-foreground/80 hover:bg-muted hover:text-foreground',
            collapsed && 'justify-center px-0',
          )
        }
        title={
          collapsed
            ? item.label + (badgeCount > 0 ? ` (${badgeCount} Pamcard pendente)` : '')
            : undefined
        }
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {badgeCount > 0 && (
          collapsed ? (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500" />
          ) : (
            <span
              className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white"
              title={`${badgeCount} solicitação(ões) com Pamcard pendente`}
            >
              {badgeCount}
            </span>
          )
        )}
      </NavLink>
    </li>
  )
}
