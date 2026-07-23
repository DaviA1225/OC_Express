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
  Gauge,
  Activity,
  ShieldAlert,
  ChevronsLeft,
  ChevronsRight,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuth } from '@/hooks/useAuth'
import {
  canViewAuditoria,
  canViewUsuarios,
  canViewRelatorios,
  canViewProdutividade,
  canViewAtividade,
  canViewSeguranca,
} from '@/features/auth/permissions'
import { usePamcardPendenteCount } from '@/features/solicitacoes/useSolicitacoes'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const APP_VERSION = 'v1.3.1'

const PERFIL_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  supervisor: 'Supervisor',
  analista: 'Analista',
  assistente: 'Assistente',
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
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
const sistemaProdutividade: NavItem = { to: '/relatorios-internos', label: 'Relatórios Internos', icon: Gauge }
const sistemaAtividade: NavItem = { to: '/atividade', label: 'Atividade da Equipe', icon: Activity }
const sistemaAuditoria: NavItem = { to: '/auditoria', label: 'Auditoria', icon: Search }
const sistemaSeguranca: NavItem = { to: '/seguranca', label: 'Segurança', icon: ShieldAlert }

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse?: () => void
  onNavigate?: () => void
  onClose?: () => void
  className?: string
}

export function SidebarContent({ collapsed, onToggleCollapse, onNavigate, onClose, className }: SidebarProps) {
  const { profile } = useAuth()
  const showUsuarios = canViewUsuarios(profile)
  const showAuditoria = canViewAuditoria(profile)
  const showRelatorios = canViewRelatorios(profile)
  const showProdutividade = canViewProdutividade(profile)
  const showAtividade = canViewAtividade(profile)
  const showSeguranca = canViewSeguranca(profile)
  const pamcardPendente = usePamcardPendenteCount()
  const pamcardPendenteCount = pamcardPendente.data ?? 0

  return (
    <aside
      className={cn(
        'relative z-30 flex h-full flex-col bg-background',
        collapsed ? 'w-16' : 'w-full',
        className,
      )}
    >
      <div
        className={cn(
          'flex h-14 items-center justify-between',
          collapsed ? 'justify-center px-2' : 'px-4',
        )}
      >
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" aria-hidden className="h-7 w-7 shrink-0" />
          {!collapsed && (
            <span className="text-[14px] font-medium text-foreground">SisLog</span>
          )}
        </div>
        {!collapsed && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-1.5">
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
        <ul className="space-y-1.5">
          {cadastros.map((item) => (
            <NavListItem
              key={item.to}
              item={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </ul>

        {(showUsuarios || showAuditoria || showRelatorios || showProdutividade || showAtividade || showSeguranca) && (
          <>
            <SectionLabel collapsed={collapsed}>Sistema</SectionLabel>
            <ul className="space-y-1.5">
              {showRelatorios && (
                <NavListItem
                  item={sistemaRelatorios}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              )}
              {showProdutividade && (
                <NavListItem
                  item={sistemaProdutividade}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              )}
              {showAtividade && (
                <NavListItem
                  item={sistemaAtividade}
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

      <div className="p-2">
        {!collapsed && (
          <p className="px-2 pb-1.5 text-[10px] tabular-nums text-muted-foreground">
            SisLog {APP_VERSION}
          </p>
        )}
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg px-2 py-1.5',
            collapsed && 'justify-center px-0',
          )}
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-accent text-[12px] font-medium text-accent-foreground">
              {iniciais(profile?.nome_completo ?? '?')}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-medium text-foreground">
                {profile?.nome_completo ?? 'Usuário'}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {PERFIL_LABELS[profile?.perfil ?? ''] ?? profile?.perfil ?? '—'}
              </p>
            </div>
          )}
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              'mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              collapsed && 'justify-center px-0',
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
        )}
      </div>
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
    <div className="mb-1 mt-3 px-2 text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
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
            'group relative flex items-center gap-2 rounded-lg border py-2 text-[13px] font-medium transition-all duration-200 ease-out',
            collapsed ? 'justify-center px-0' : 'px-3',
            isActive
              ? 'border-border bg-accent text-accent-foreground before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-primary before:content-[""]'
              : 'border-border bg-muted/40 text-foreground/80 hover:translate-x-0.5 hover:border-primary/40 hover:bg-accent hover:text-foreground motion-reduce:hover:translate-x-0',
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
