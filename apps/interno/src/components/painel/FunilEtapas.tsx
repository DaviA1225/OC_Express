import { LinkDrill } from './LinkDrill'
import { StatusDot } from '@/components/shared/SolicitacaoStatusBadge'
import { STATUS_LABELS } from '@/features/solicitacoes/status'
import { linkSolicitacoes } from '@/features/metricas/links'
import type { FiltrosComuns, PainelEtapa } from '@/features/metricas/tipos'
import { fmtDur, fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'

// Cores do funil: etapas em grafite; laranja SÓ no que estourou o SLA.
const COR_OK = 'var(--chart-7)'
// Aviso no tom semântico de atenção (não é o acento): no escuro, chart-7 e
// chart-ref ficavam indistinguíveis.
const COR_AVISO = 'hsl(var(--warning))'
const COR_FORA = 'var(--chart-1)'

interface Props {
  etapas: PainelEtapa[]
  filtros?: FiltrosComuns
  /** TV: tipografia maior e sem links (ninguém clica na parede). */
  tv?: boolean
}

/** P8 — quantidade por etapa, quantas em aviso/fora do SLA e a mais antiga. */
export function FunilEtapas({ etapas, filtros, tv }: Props) {
  const max = Math.max(1, ...etapas.map((e) => e.qtd))
  return (
    <div>
      <ul className={cn('space-y-2', tv && 'space-y-4')}>
        {etapas.map((e) => {
          const semSla = e.status === 'oc_enviada'
          const ok = e.qtd - e.aviso - e.fora_sla
          const conteudo = (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn('flex min-w-0 items-center gap-1.5 text-foreground', tv ? 'tv-texto' : 'text-body-sm')}>
                  <StatusDot status={e.status} />
                  <span className="truncate">{STATUS_LABELS[e.status]}</span>
                  {semSla && <span className={cn('shrink-0 text-muted-foreground', tv ? 'tv-meta' : 'text-meta')}>sem SLA</span>}
                </span>
                <span className={cn('shrink-0 tabular-nums', tv ? 'tv-texto' : 'text-body-sm')}>
                  <span className="font-medium text-foreground">{fmtInt(e.qtd)}</span>
                  {e.fora_sla > 0 && <span className="ml-2 font-medium text-primary-strong">{fmtInt(e.fora_sla)} fora</span>}
                </span>
              </div>
              <div
                className={cn('mt-1 flex overflow-hidden rounded-[2px] bg-muted', tv ? 'h-3' : 'h-2')}
                role="img"
                aria-label={`${STATUS_LABELS[e.status]}: ${e.qtd} no total, ${e.aviso} em aviso, ${e.fora_sla} fora do SLA`}
              >
                <div style={{ width: `${(ok / max) * 100}%`, backgroundColor: COR_OK }} />
                <div style={{ width: `${(e.aviso / max) * 100}%`, backgroundColor: COR_AVISO }} />
                <div style={{ width: `${(e.fora_sla / max) * 100}%`, backgroundColor: COR_FORA }} />
              </div>
              <p className={cn('mt-0.5 text-muted-foreground tabular-nums', tv ? 'tv-meta' : 'text-meta')}>
                {e.mais_antiga_min == null ? 'Vazia' : `Mais antiga há ${fmtDur(e.mais_antiga_min)}`}
              </p>
            </>
          )
          return (
            <li key={e.status}>
              {tv || !filtros ? (
                conteudo
              ) : (
                <LinkDrill
                  to={linkSolicitacoes({ status: e.status, ordem: 'antiga' }, filtros)}
                  className="-mx-2 block rounded-md px-2 py-1 transition-[transform,background-color] duration-fast ease-out hover:-translate-y-0.5 hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {conteudo}
                </LinkDrill>
              )}
            </li>
          )
        })}
      </ul>
      <Legenda tv={tv} />
    </div>
  )
}

function Legenda({ tv }: { tv?: boolean }) {
  const itens = [
    { cor: COR_OK, rotulo: 'No prazo' },
    { cor: COR_AVISO, rotulo: 'Em aviso' },
    { cor: COR_FORA, rotulo: 'Fora do SLA' },
  ]
  return (
    <div className={cn('mt-3 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground', tv ? 'tv-meta' : 'text-meta')}>
      {itens.map((i) => (
        <span key={i.rotulo} className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-[1px]" style={{ backgroundColor: i.cor }} />
          {i.rotulo}
        </span>
      ))}
    </div>
  )
}
