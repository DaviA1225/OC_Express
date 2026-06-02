import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Hourglass, FileX, Send, CalendarClock, CheckCheck, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useNotifications, NOTIFICATION_LABELS, type NotificationKind, type NotificationItem } from './useNotifications'
import { formatNumeroOC } from '@/lib/utils'
import { cn } from '@/lib/utils'

const DISMISSED_KEY = 'sislog.notifications.dismissed'
const DISMISSAL_TTL_MS = 24 * 3_600_000

type DismissalMap = Map<string, number>

function loadDismissed(): DismissalMap {
  if (typeof window === 'undefined') return new Map()
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY)
    if (!raw) return new Map()
    const parsed = JSON.parse(raw) as unknown
    const now = Date.now()
    const out: DismissalMap = new Map()
    if (Array.isArray(parsed)) {
      // formato antigo: array de keys sem timestamp — descarta para forçar reaparição
      return out
    }
    if (parsed && typeof parsed === 'object') {
      for (const [key, ts] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof ts === 'number' && now - ts < DISMISSAL_TTL_MS) {
          out.set(key, ts)
        }
      }
    }
    return out
  } catch {
    return new Map()
  }
}

function saveDismissed(m: DismissalMap) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(Object.fromEntries(m)))
  } catch {
    // sem espaço/desabilitado — silencioso
  }
}

const KIND_ORDER: NotificationKind[] = ['pendencia_resolvida', 'validade_vencendo', 'sem_oc', 'oc_nao_enviada', 'pendente']

const KIND_STYLES: Record<NotificationKind, { dot: string; icon: React.ComponentType<{ className?: string }> }> = {
  pendencia_resolvida: { dot: 'bg-emerald-500', icon: CheckCircle2 },
  validade_vencendo: { dot: 'bg-red-500', icon: CalendarClock },
  sem_oc: { dot: 'bg-orange-500', icon: FileX },
  oc_nao_enviada: { dot: 'bg-orange-400', icon: Send },
  pendente: { dot: 'bg-amber-500', icon: Hourglass },
}

export function NotificationsBell() {
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const [dismissed, setDismissed] = React.useState<DismissalMap>(() => loadDismissed())
  const { data, isLoading } = useNotifications()

  const keyOf = (i: NotificationItem) => `${i.kind}:${i.id}`
  const visible = React.useMemo(
    () => (data ?? []).filter((i) => !dismissed.has(keyOf(i))),
    [data, dismissed],
  )
  const total = visible.length

  const grouped: Record<NotificationKind, NotificationItem[]> = {
    pendencia_resolvida: [],
    pendente: [],
    sem_oc: [],
    oc_nao_enviada: [],
    validade_vencendo: [],
  }
  for (const item of visible) grouped[item.kind].push(item)

  const handleSelect = (id: string) => {
    setOpen(false)
    navigate(`/solicitacoes/${id}`)
  }

  const handleDismissAll = () => {
    const next = new Map(dismissed)
    const now = Date.now()
    for (const item of data ?? []) next.set(keyOf(item), now)
    saveDismissed(next)
    setDismissed(next)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative rounded-md p-1.5 text-primary-foreground transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          aria-label={total > 0 ? `${total} notificações` : 'Notificações'}
          title={total > 0 ? `${total} alerta${total === 1 ? '' : 's'} operacional${total === 1 ? '' : 'is'}` : 'Sem alertas'}
        >
          <Bell className="h-5 w-5" />
          {total > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold text-primary ring-1 ring-primary">
              {total > 99 ? '99+' : total}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-foreground">Alertas operacionais</p>
            <p className="text-[10px] text-muted-foreground">Atualiza a cada minuto · {total} {total === 1 ? 'item' : 'itens'}</p>
          </div>
          {total > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 text-[11px]"
              onClick={handleDismissAll}
              title="Marcar todos como lidos e ocultar"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Limpar tudo
            </Button>
          )}
        </header>

        <div className="max-h-[400px] overflow-y-auto">
          {isLoading && (
            <div className="px-3 py-8 text-center text-[12px] text-muted-foreground">Carregando…</div>
          )}
          {!isLoading && total === 0 && (
            <div className="px-3 py-10 text-center text-[13px] text-muted-foreground">
              Nada pendente. 🎉
              <p className="mt-1 text-[11px]">Todas as solicitações estão em dia.</p>
            </div>
          )}
          {!isLoading && total > 0 && KIND_ORDER.map((kind) => {
            const items = grouped[kind]
            if (items.length === 0) return null
            const Icon = KIND_STYLES[kind].icon
            return (
              <section key={kind}>
                <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 text-[10px] uppercase tracking-[0.5px] text-muted-foreground">
                  <span className={cn('h-1.5 w-1.5 rounded-full', KIND_STYLES[kind].dot)} />
                  {NOTIFICATION_LABELS[kind]}
                  <span className="ml-auto">{items.length}</span>
                </div>
                <ul className="divide-y">
                  {items.map((item) => (
                    <li key={`${kind}:${item.id}`}>
                      <button
                        type="button"
                        onClick={() => handleSelect(item.id)}
                        className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-muted/60"
                      >
                        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', kindIconColor(kind))} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-medium tabular-nums text-primary">
                              {formatNumeroOC(item.numero_interno)}
                            </span>
                            <span className="text-[11px] text-muted-foreground">{item.age_label}</span>
                          </div>
                          <p className="truncate text-[12px] text-foreground">
                            {item.cliente_nome ?? item.solicitante_nome ?? 'Sem destino'}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function kindIconColor(kind: NotificationKind): string {
  switch (kind) {
    case 'pendencia_resolvida': return 'text-emerald-500'
    case 'validade_vencendo': return 'text-red-500'
    case 'sem_oc': return 'text-orange-500'
    case 'oc_nao_enviada': return 'text-orange-400'
    case 'pendente': return 'text-amber-500'
  }
}
