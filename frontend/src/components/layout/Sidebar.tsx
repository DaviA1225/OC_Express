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
  Users,
  Search,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth, hasPerfil } from '@/hooks/useAuth'

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
]

const sistemaAdmin: NavItem = { to: '/cadastros/usuarios', label: 'Usuários', icon: Users }
const sistemaAuditoria: NavItem = { to: '/auditoria', label: 'Auditoria', icon: Search }

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse?: () => void
  onNavigate?: () => void
  className?: string
}

export function SidebarContent({ collapsed, onToggleCollapse, onNavigate, className }: SidebarProps) {
  const { profile } = useAuth()
  const isAdmin = hasPerfil(profile, 'admin')
  const isAdminOrSupervisor = hasPerfil(profile, 'admin', 'supervisor')

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
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-[12px] font-semibold text-primary-foreground">
            LH
          </div>
          {!collapsed && (
            <span className="text-[14px] font-medium text-foreground">SisLog LHG</span>
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

        {(isAdmin || isAdminOrSupervisor) && (
          <>
            <SectionLabel collapsed={collapsed}>Sistema</SectionLabel>
            <ul className="space-y-0.5">
              {isAdmin && (
                <NavListItem
                  item={sistemaAdmin}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              )}
              {isAdminOrSupervisor && (
                <NavListItem
                  item={sistemaAuditoria}
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
}: {
  item: NavItem
  collapsed: boolean
  onNavigate?: () => void
}) {
  const Icon = item.icon
  return (
    <li>
      <NavLink
        to={item.to}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'group flex h-9 items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors',
            isActive
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground/80 hover:bg-muted hover:text-foreground',
            collapsed && 'justify-center px-0',
          )
        }
        title={collapsed ? item.label : undefined}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </NavLink>
    </li>
  )
}
