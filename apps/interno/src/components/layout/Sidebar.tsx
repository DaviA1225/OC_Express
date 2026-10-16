import * as React from 'react'
import { NavLink } from 'react-router-dom'
import { SISLOG_VERSAO } from '@sislog/shared/versao'
import {
  LayoutDashboard,
  Inbox,
  CalendarClock,
  RotateCcw,
  ClipboardCheck,
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
  Fingerprint,
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
  canViewPrivacidade,
} from '@/features/auth/permissions'
import { iniciais, labelPerfil } from '@/features/auth/perfis'
import { useRecebidasCount } from '@/features/solicitacoes/useSolicitacoes'
import { useAgendamentosPendentesCount } from '@/features/agendamentos/useAgendamentos'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  /** Guarda de permissão; ausente = todo o time interno vê. */
  visivel?: boolean
}

interface NavSecao {
  titulo: string
  itens: NavItem[]
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`
}

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse?: () => void
  onNavigate?: () => void
  onClose?: () => void
  className?: string
}

export function SidebarContent({ collapsed, onToggleCollapse, onNavigate, onClose, className }: SidebarProps) {
  const { profile } = useAuth()
  const recebidasCount = useRecebidasCount().data ?? 0
  const agendamentosCount = useAgendamentosPendentesCount().data ?? 0

  // Menu em 4 seções (Operação / Cadastros / Análise / Administração). Rotas e
  // guardas de permissão são as mesmas de antes; só mudaram rótulos e agrupamento.
  const secoes: NavSecao[] = [
    {
      titulo: 'Operação',
      itens: [
        { to: '/dashboard', label: 'Painel', icon: LayoutDashboard },
        { to: '/solicitacoes', label: 'Solicitações', icon: Inbox },
        { to: '/agendamentos', label: 'Agendamentos', icon: CalendarClock },
        { to: '/conferencia-viagem', label: 'Conferência de viagem', icon: ClipboardCheck },
      ],
    },
    {
      titulo: 'Cadastros',
      itens: [
        { to: '/cadastros/clientes', label: 'Clientes', icon: Building2 },
        { to: '/cadastros/materiais', label: 'Materiais', icon: Package },
        { to: '/cargas-retorno', label: 'Cargas de retorno', icon: RotateCcw },
        { to: '/cadastros/motoristas', label: 'Motoristas', icon: User },
        { to: '/cadastros/veiculos', label: 'Veículos', icon: Truck },
        { to: '/cadastros/carretas', label: 'Carretas', icon: Container },
        { to: '/cadastros/subcontratadas', label: 'Subcontratadas', icon: Handshake },
      ],
    },
    {
      titulo: 'Análise',
      itens: [
        { to: '/relatorios', label: 'Relatórios', icon: BarChart3, visivel: canViewRelatorios(profile) },
        { to: '/relatorios-internos', label: 'Produtividade da equipe', icon: Gauge, visivel: canViewProdutividade(profile) },
        { to: '/atividade', label: 'Atividade da equipe', icon: Activity, visivel: canViewAtividade(profile) },
      ],
    },
    {
      titulo: 'Administração',
      itens: [
        { to: '/cadastros/parceiros', label: 'Parceiros e acessos', icon: Network },
        { to: '/cadastros/usuarios', label: 'Usuários', icon: Users, visivel: canViewUsuarios(profile) },
        { to: '/auditoria', label: 'Auditoria', icon: Search, visivel: canViewAuditoria(profile) },
        { to: '/seguranca', label: 'Segurança', icon: ShieldAlert, visivel: canViewSeguranca(profile) },
        { to: '/privacidade', label: 'Privacidade', icon: Fingerprint, visivel: canViewPrivacidade(profile) },
      ],
    },
  ]

  // Contadores por rota: o badge é sempre "o que está esperando a equipe" —
  // solicitações recebidas e agendamentos ainda não concluídos.
  const badges: Record<string, { count: number; title: string }> = {
    '/solicitacoes': {
      count: recebidasCount,
      title: plural(recebidasCount, 'solicitação recebida', 'solicitações recebidas'),
    },
    '/agendamentos': {
      count: agendamentosCount,
      title: plural(agendamentosCount, 'agendamento na fila', 'agendamentos na fila'),
    },
  }

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
          'flex h-12 shrink-0 items-center justify-between border-b',
          collapsed ? 'justify-center px-2' : 'pl-4 pr-2',
        )}
      >
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" aria-hidden className="h-6 w-6 shrink-0" />
          {!collapsed && <span className="text-body-lg font-semibold text-foreground">SisLog</span>}
        </div>
        {!collapsed && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-2 py-2">
        {secoes.map((secao, i) => {
          const itens = secao.itens.filter((it) => it.visivel !== false)
          if (itens.length === 0) return null
          return (
            <div key={secao.titulo} className={cn(i > 0 && 'mt-4')}>
              <SectionLabel collapsed={collapsed} first={i === 0}>
                {secao.titulo}
              </SectionLabel>
              <ul className="space-y-px">
                {itens.map((item) => (
                  <NavListItem
                    key={item.to}
                    item={item}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                    badgeCount={badges[item.to]?.count ?? 0}
                    badgeTitle={badges[item.to]?.title}
                  />
                ))}
              </ul>
            </div>
          )
        })}
      </nav>

      <div className="border-t p-2">
        {!collapsed && (
          <p className="px-2 pb-1 text-meta tabular-nums text-tertiary">SisLog v{SISLOG_VERSAO}</p>
        )}
        <div className={cn('flex items-center gap-2.5 px-2 py-1.5', collapsed && 'justify-center px-0')}>
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-accent text-body-sm font-medium text-accent-foreground">
              {iniciais(profile?.nome_completo)}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-body font-medium text-foreground">
                {profile?.nome_completo ?? 'Usuário'}
              </p>
              <p className="truncate text-meta text-muted-foreground">{labelPerfil(profile?.perfil)}</p>
            </div>
          )}
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              'mt-1 flex h-8 w-full items-center gap-2 rounded-md px-2 text-body-sm text-muted-foreground transition-colors duration-fast hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
  first,
}: {
  children: React.ReactNode
  collapsed: boolean
  first: boolean
}) {
  if (collapsed) {
    return first ? null : <div className="mx-2 mb-2 h-px bg-border" />
  }
  // 12px semibold, sem maiúsculas/tracking (Fluent/Carbon).
  return <div className="mb-1 px-2.5 text-body-sm font-semibold text-muted-foreground">{children}</div>
}

function NavListItem({
  item,
  collapsed,
  onNavigate,
  badgeCount = 0,
  badgeTitle,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate?: () => void
  badgeCount?: number
  badgeTitle?: string
}) {
  const Icon = item.icon
  return (
    <li>
      <NavLink
        to={item.to}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            // 36px, sem borda/fundo em repouso; hover = elevação sutil: sobe 2px
            // + realce de fundo/cor (120ms), sem zoom nem deslize lateral.
            'group relative flex h-9 items-center gap-2.5 rounded-md text-body transition-[transform,background-color,color] duration-fast ease-out hover:-translate-y-0.5',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
            collapsed ? 'justify-center px-0' : 'px-2.5',
            isActive
              ? // Ativo: fundo accent + barra de 2px do acento à esquerda.
                'bg-accent font-medium text-accent-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-[2px] before:bg-primary before:content-[""]'
              : 'text-muted-foreground hover:bg-row-hover hover:text-foreground',
          )
        }
        title={collapsed ? [item.label, badgeCount > 0 ? badgeTitle : null].filter(Boolean).join(' — ') : undefined}
      >
        <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {badgeCount > 0 &&
          (collapsed ? (
            <span aria-hidden className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-foreground" />
          ) : (
            <span
              className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-[2px] border bg-background px-1 text-meta font-medium tabular-nums text-foreground"
              title={badgeTitle}
              aria-label={badgeTitle}
            >
              {badgeCount}
            </span>
          ))}
      </NavLink>
    </li>
  )
}
