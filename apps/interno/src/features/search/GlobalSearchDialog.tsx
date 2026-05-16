import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useNavigate } from 'react-router-dom'
import {
  Inbox,
  Building2,
  User,
  Truck,
  Container,
  Package,
  Handshake,
} from 'lucide-react'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { useDebounce } from '@/hooks/useDebounce'
import { useGlobalSearch, TYPE_LABELS, type SearchEntityType, type SearchResultItem } from './useGlobalSearch'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
}

const TYPE_ICONS: Record<SearchEntityType, React.ComponentType<{ className?: string }>> = {
  solicitacao: Inbox,
  cliente: Building2,
  motorista: User,
  veiculo: Truck,
  carreta: Container,
  material: Package,
  subcontratada: Handshake,
}

const TYPE_ORDER: SearchEntityType[] = [
  'solicitacao',
  'cliente',
  'motorista',
  'veiculo',
  'carreta',
  'material',
  'subcontratada',
]

export function GlobalSearchDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = React.useState('')
  const debounced = useDebounce(query, 200)
  const search = useGlobalSearch(debounced, open)

  const [lastOpen, setLastOpen] = React.useState(open)
  if (lastOpen !== open) {
    setLastOpen(open)
    if (!open) setQuery('')
  }

  const grouped: Record<SearchEntityType, SearchResultItem[]> = {
    solicitacao: [],
    cliente: [],
    motorista: [],
    veiculo: [],
    carreta: [],
    material: [],
    subcontratada: [],
  }
  for (const item of search.data ?? []) grouped[item.type].push(item)

  const handleSelect = (href: string) => {
    onOpenChange(false)
    navigate(href)
  }

  const term = debounced.trim()

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-[50%] top-[15%] z-50 w-full max-w-[640px] translate-x-[-50%] overflow-hidden rounded-xl border bg-popover shadow-overlay duration-150',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          <DialogPrimitive.Title className="sr-only">Busca global</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Buscar solicitações, clientes, motoristas, veículos, carretas, materiais ou subcontratadas.
          </DialogPrimitive.Description>
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar OC, cliente, motorista, placa, material…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-[420px]">
              {term.length < 2 && (
                <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                  Digite ao menos 2 caracteres para buscar.
                  <p className="mt-1 text-[11px]">
                    Dica: <kbd className="rounded border bg-background px-1">↑</kbd>{' '}
                    <kbd className="rounded border bg-background px-1">↓</kbd> navegar ·{' '}
                    <kbd className="rounded border bg-background px-1">Enter</kbd> abrir ·{' '}
                    <kbd className="rounded border bg-background px-1">Esc</kbd> fechar
                  </p>
                </div>
              )}

              {term.length >= 2 && search.isLoading && (
                <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                  Buscando…
                </div>
              )}

              {term.length >= 2 && !search.isLoading && (search.data?.length ?? 0) === 0 && (
                <CommandEmpty>Nenhum resultado para "{term}".</CommandEmpty>
              )}

              {term.length >= 2 && !search.isLoading && TYPE_ORDER.map((type) => {
                const items = grouped[type]
                if (items.length === 0) return null
                const Icon = TYPE_ICONS[type]
                return (
                  <CommandGroup key={type} heading={TYPE_LABELS[type]}>
                    {items.map((item) => (
                      <CommandItem
                        key={`${item.type}:${item.id}`}
                        value={`${item.type}:${item.id}`}
                        onSelect={() => handleSelect(item.href)}
                      >
                        <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-foreground">{item.label}</div>
                          {item.hint && (
                            <div className="truncate text-[11px] text-muted-foreground">{item.hint}</div>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )
              })}
            </CommandList>

            <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
              <span>Busca global</span>
              <span>
                <kbd className="rounded border bg-background px-1">Esc</kbd> para fechar
              </span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
