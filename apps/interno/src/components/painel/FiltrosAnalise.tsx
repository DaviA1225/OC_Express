import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Eraser, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Combobox } from '@/components/shared/Combobox'
import { useOpcoesClientes, useOpcoesLocais } from '@/features/metricas/useRelatorioMetricas'
import type { FiltrosComuns, OrigemFiltro } from '@/features/metricas/tipos'
import { cn } from '@/lib/utils'

const ORIGENS: { value: OrigemFiltro; label: string; title?: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'interno', label: 'Internas', title: 'Tudo que não veio do portal de parceiros (inclui e-mail e WhatsApp)' },
  { value: 'parceiro', label: 'Parceiros' },
]

const TODOS = '__todos'

// Opções de local: os locais com movimento nos últimos 90 dias (relatorio_locais).
function ultimos90(): { de: string; ate: string } {
  const hoje = new Date()
  const ini = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 89)
  const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { de: f(ini), ate: f(hoje) }
}

interface Props {
  filtros: FiltrosComuns
  setOrigem: (o: OrigemFiltro) => void
  setCliente: (id: string | null) => void
  setLocal: (l: string | null) => void
  limpar: () => void
  ativos: number
  /** Esconde o seletor de origem (ex.: aba Parceiros já é recorte de parceiro). */
  semOrigem?: boolean
}

/**
 * Filtros comuns `F` (§4): origem, cliente e local. Em linha a partir de 640px;
 * no celular viram uma folha "Filtros (n)", para não empurrar a página para o lado.
 */
export function FiltrosAnalise(props: Props) {
  const [aberto, setAberto] = React.useState(false)
  return (
    <>
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        <Controles {...props} />
      </div>
      <div className="sm:hidden">
        <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
          <SlidersHorizontal className="h-4 w-4" />
          {props.ativos > 0 ? `Filtros (${props.ativos})` : 'Filtros'}
        </Button>
        <Sheet open={aberto} onOpenChange={setAberto}>
          <SheetContent side="bottom" className="space-y-3 rounded-t-lg p-4 pb-6" aria-describedby={undefined}>
            <DialogPrimitive.Title className="text-title-sm font-medium text-foreground">Filtros</DialogPrimitive.Title>
            <div className="flex flex-col gap-3">
              <Controles {...props} empilhado />
            </div>
            <Button type="button" className="w-full" onClick={() => setAberto(false)}>
              Aplicar
            </Button>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}

function Controles({ filtros, setOrigem, setCliente, setLocal, limpar, ativos, semOrigem, empilhado }: Props & { empilhado?: boolean }) {
  const clientes = useOpcoesClientes()
  const [periodoLocais] = React.useState(ultimos90)
  const locais = useOpcoesLocais(periodoLocais)
  const opcoesClientes = React.useMemo(
    () => (clientes.data ?? []).map((c) => ({ value: c.id, label: c.nome })),
    [clientes.data],
  )
  return (
    <>
      {!semOrigem && <OrigemTabs value={filtros.origem} onChange={setOrigem} />}
      <div className={cn(empilhado ? 'w-full' : 'w-56')}>
        <Combobox
          options={opcoesClientes}
          value={filtros.clienteId}
          onChange={setCliente}
          placeholder="Todos os clientes"
          searchPlaceholder="Buscar cliente…"
          emptyMessage="Nenhum cliente encontrado."
          loading={clientes.isLoading}
          ariaLabel="Filtrar por cliente"
        />
      </div>
      <div className={cn(empilhado ? 'w-full' : 'w-48')}>
        <Select value={filtros.local ?? TODOS} onValueChange={(v) => setLocal(v === TODOS ? null : v)}>
          <SelectTrigger aria-label="Filtrar por local de carregamento">
            <SelectValue placeholder="Todos os locais" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os locais</SelectItem>
            {(locais.data ?? []).map((l) => (
              <SelectItem key={l.local} value={l.local}>
                {l.local}
              </SelectItem>
            ))}
            {filtros.local && !(locais.data ?? []).some((l) => l.local === filtros.local) && (
              <SelectItem value={filtros.local}>{filtros.local}</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
      {ativos > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={limpar}>
          <Eraser className="h-4 w-4" /> Limpar filtros
        </Button>
      )}
    </>
  )
}

export function OrigemTabs({ value, onChange }: { value: OrigemFiltro; onChange: (v: OrigemFiltro) => void }) {
  return (
    <div className="inline-flex w-fit rounded-surface border bg-card p-0.5" role="radiogroup" aria-label="Recorte por origem">
      {ORIGENS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          title={o.title}
          className={cn(
            'rounded-control px-2.5 py-1 text-body-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === o.value
              ? 'bg-primary/[0.08] text-primary-strong'
              : 'text-muted-foreground hover:bg-row-hover hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
