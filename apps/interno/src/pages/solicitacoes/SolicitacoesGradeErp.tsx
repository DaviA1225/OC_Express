import * as React from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ExternalLink, MousePointerClick, X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { SolicitacaoStatusBadge } from '@/components/shared/SolicitacaoStatusBadge'
import { ErrorBoundary, ErroDaTela } from '@/components/shared/ErrorBoundary'
import { SolicitacaoDetailPage } from '@/pages/solicitacoes/SolicitacaoDetailPage'
import { getSlaInfo } from '@/features/solicitacoes/status'
import { cn, formatNumeroOC } from '@/lib/utils'
import type { SolicitacaoListRow } from '@/features/solicitacoes/useSolicitacoes'

// Modo ERP, fase 2: a lista de solicitações vira grade densa, e o detalhe abre
// num painel ao lado — sem sair da lista. Em tela que não comporta os dois
// (abaixo de 1280px) o clique abre a página de detalhe, como no clássico.

const PAINEL_MIN_PX = 1280

function cabeDoisPaineis(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(`(min-width: ${PAINEL_MIN_PX}px)`).matches
}

const ORIGEM_LABELS: Record<string, string> = {
  interno: 'Interno',
  parceiro: 'Parceiro',
  email: 'E-mail',
}

interface Props {
  rows: SolicitacaoListRow[]
  selecionada: string | null
  onSelecionar: (id: string | null) => void
  onAbrir: (id: string) => void
  selectable: boolean
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleAll: () => void
  allVisibleSelected: boolean
}

export function SolicitacoesGradeErp({
  rows, selecionada, onSelecionar, onAbrir,
  selectable, selectedIds, onToggleSelect, onToggleAll, allVisibleSelected,
}: Props) {
  const tabelaRef = React.useRef<HTMLTableSectionElement>(null)

  const escolher = (id: string) => {
    if (cabeDoisPaineis()) onSelecionar(id)
    else onAbrir(id)
  }

  // ↑/↓ andam pela grade com o painel acompanhando; Enter abre em tela cheia.
  // Só reage com o foco DENTRO da grade, para não roubar as setas de um campo.
  const onKeyDown = (e: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return
    const atual = rows.findIndex((r) => r.id === selecionada)
    if (e.key === 'Enter') {
      if (selecionada) {
        e.preventDefault()
        onAbrir(selecionada)
      }
      return
    }
    e.preventDefault()
    const prox = e.key === 'ArrowDown'
      ? Math.min(rows.length - 1, atual + 1)
      : Math.max(0, atual < 0 ? 0 : atual - 1)
    const row = rows[prox]
    if (!row) return
    escolher(row.id)
    tabelaRef.current
      ?.querySelector<HTMLElement>(`[data-row-id="${row.id}"]`)
      ?.focus()
  }

  const painelAberto = !!selecionada && rows.some((r) => r.id === selecionada)

  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1 overflow-x-auto rounded-lg border bg-card">
        <table className="w-full border-collapse whitespace-nowrap text-[13px]">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-[12px] text-muted-foreground">
              {selectable && (
                <th className="w-9 px-3 py-2 font-medium">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={onToggleAll}
                    aria-label={allVisibleSelected ? 'Desmarcar página' : 'Selecionar página'}
                  />
                </th>
              )}
              <th className="px-3 py-2 font-medium">Nº</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Motorista</th>
              <th className="px-3 py-2 font-medium">Placa</th>
              <th className="px-3 py-2 font-medium">Origem</th>
              <th className="px-3 py-2 font-medium">Criada</th>
              <th className="px-3 py-2 text-right font-medium">SLA</th>
            </tr>
          </thead>
          <tbody ref={tabelaRef} onKeyDown={onKeyDown}>
            {rows.map((row) => {
              const ativa = row.id === selecionada
              const sla = getSlaInfo(row.status, row.created_at)
              const created = row.created_at ? new Date(row.created_at) : null
              return (
                <tr
                  key={row.id}
                  data-row-id={row.id}
                  tabIndex={0}
                  aria-selected={ativa}
                  onClick={() => escolher(row.id)}
                  onDoubleClick={() => onAbrir(row.id)}
                  className={cn(
                    'cursor-pointer border-b last:border-b-0 outline-none transition-colors',
                    'hover:bg-muted/40 focus-visible:bg-muted/60',
                    ativa && 'bg-primary/[0.06] shadow-[inset_3px_0_0_hsl(var(--primary))] hover:bg-primary/[0.08]',
                  )}
                >
                  {selectable && (
                    <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        onCheckedChange={() => onToggleSelect(row.id)}
                        aria-label={`Selecionar ${formatNumeroOC(row.numero_interno)}`}
                      />
                    </td>
                  )}
                  <td className="px-3 py-1.5 font-medium text-foreground">{formatNumeroOC(row.numero_interno)}</td>
                  <td className="px-3 py-1.5"><SolicitacaoStatusBadge status={row.status} /></td>
                  <td className="max-w-[220px] truncate px-3 py-1.5">{row.cliente?.razao_social ?? '—'}</td>
                  <td className="max-w-[200px] truncate px-3 py-1.5">
                    {row.motorista?.nome_completo ?? row.solicitante_nome ?? '—'}
                  </td>
                  <td className="px-3 py-1.5 tracking-wide">{row.veiculo?.placa ?? '—'}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{ORIGEM_LABELS[row.origem] ?? row.origem}</td>
                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                    {created ? format(created, 'dd/MM HH:mm', { locale: ptBR }) : '—'}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-1.5 text-right tabular-nums',
                      // Mesmas cores do SlaBadge da lista clássica: âmbar no
                      // aviso, vermelho quando estoura o limite.
                      sla?.severity === 'alert' && 'font-semibold text-red-700 dark:text-red-300',
                      sla?.severity === 'warning' && 'font-medium text-amber-700 dark:text-amber-300',
                      !sla && 'text-muted-foreground',
                    )}
                  >
                    {sla?.label ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          Clique para ver ao lado · duplo clique ou Enter abre em tela cheia · ↑ ↓ andam pela lista
        </p>
      </div>

      <aside
        aria-label="Detalhe da solicitação"
        className="sticky top-0 hidden max-h-[calc(100vh-11rem)] w-[440px] shrink-0 flex-col overflow-hidden rounded-lg border bg-card xl:flex"
      >
        {painelAberto ? (
          <>
            <div className="flex shrink-0 items-center justify-end gap-1 border-b px-2 py-1.5">
              <Link
                to={`/solicitacoes/${selecionada}`}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Tela cheia
              </Link>
              <button
                type="button"
                onClick={() => onSelecionar(null)}
                aria-label="Fechar detalhe"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {/* key: trocar de linha descarta estado dos formulários da anterior. */}
              <ErrorBoundary resetKey={selecionada!} fallback={(p) => <ErroDaTela {...p} />}>
                <SolicitacaoDetailPage key={selecionada} embutido={{ id: selecionada! }} />
              </ErrorBoundary>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 py-16 text-center text-[13px] text-muted-foreground">
            <MousePointerClick className="h-5 w-5" />
            Selecione uma solicitação na lista para ver os detalhes aqui.
          </div>
        )}
      </aside>
    </div>
  )
}
