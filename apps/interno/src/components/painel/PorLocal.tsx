import type { CSSProperties } from 'react'
import { LinkDrill } from './LinkDrill'
import { linkSolicitacoes } from '@/features/metricas/links'
import type { FiltrosComuns, PainelPorLocal } from '@/features/metricas/tipos'
import { fmtInt } from '@/lib/format'
import { Vazio } from './Bloco'

/** P13 — fila e fora do SLA por local de carregamento (6 maiores + "Outros"). */
export function PorLocal({ locais, filtros }: { locais: PainelPorLocal[]; filtros: FiltrosComuns }) {
  if (locais.length === 0) return <Vazio altura={80}>Fila vazia.</Vazio>
  const max = Math.max(1, ...locais.map((l) => l.qtd))
  return (
    <ul className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
      {locais.map((l, i) => {
        const linha = (
          <>
            <div className="flex items-baseline justify-between gap-2 text-body-sm">
              <span className="truncate text-foreground">{l.local}</span>
              <span className="shrink-0 tabular-nums">
                <span className="font-medium text-foreground">{fmtInt(l.qtd)}</span>
                {l.fora_sla > 0 && <span className="ml-2 text-primary-strong">{fmtInt(l.fora_sla)} fora</span>}
              </span>
            </div>
            <div className="mt-1 flex h-1.5 overflow-hidden rounded-[2px] bg-muted" aria-hidden>
              <div className="barra-x flex h-full w-full" style={{ '--ordem': i } as CSSProperties}>
                <div className="transition-[width] duration-500 ease-out" style={{ width: `${((l.qtd - l.fora_sla) / max) * 100}%`, backgroundColor: 'var(--chart-7)' }} />
                <div className="transition-[width] duration-500 ease-out" style={{ width: `${(l.fora_sla / max) * 100}%`, backgroundColor: 'var(--chart-1)' }} />
              </div>
            </div>
          </>
        )
        // "Outros" e "Sem local" não têm um valor exato para filtrar a lista.
        const filtravel = l.local !== 'Outros'
        return (
          <li key={l.local}>
            {filtravel ? (
              <LinkDrill
                to={linkSolicitacoes({ local: l.local, ordem: 'antiga' }, filtros)}
                className="-mx-2 block rounded-md px-2 py-1 transition-[transform,background-color] duration-fast ease-out hover:-translate-y-0.5 hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {linha}
              </LinkDrill>
            ) : (
              <div className="px-0 py-1">{linha}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
