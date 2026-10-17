import { LinkDrill } from './LinkDrill'
import { SolicitacaoStatusBadge, StatusDot } from '@/components/shared/SolicitacaoStatusBadge'
import { STATUS_LABELS } from '@/features/solicitacoes/status'
import { linkSolicitacao } from '@/features/metricas/links'
import { rotuloOrigem } from '@/features/metricas/rotulos'
import type { PainelAtrasada } from '@/features/metricas/tipos'
import { fmtDur } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Vazio } from './Bloco'

interface Props {
  atrasadas: PainelAtrasada[]
  /** Momento do dado (gerado_em) e o relógio local: os minutos avançam entre buscas. */
  geradoEm: string
  agora: number
  limite?: number
  /** TV: sem link, tipografia grande, sempre em tabela. */
  tv?: boolean
}

function numero(n: number): string {
  return `#${String(n).padStart(4, '0')}`
}

/** P14 — as que mais passaram do alerta da etapa. Sem motorista nem solicitante. */
export function MaisAtrasadas({ atrasadas, geradoEm, agora, limite = 10, tv }: Props) {
  const decorrido = Math.max(0, (agora - new Date(geradoEm).getTime()) / 60_000)
  const linhas = atrasadas.slice(0, limite).map((a) => ({
    ...a,
    min_na_etapa: a.min_na_etapa + decorrido,
    excesso_min: a.excesso_min + decorrido,
  }))
  if (linhas.length === 0) {
    return <Vazio altura={tv ? 200 : 96}>Nenhuma solicitação fora do SLA.</Vazio>
  }
  return (
    <>
      {/* Tabela (≥ 768px; sempre na TV) */}
      <div className={cn(tv ? 'block' : 'hidden md:block')}>
        <table className={cn('w-full border-collapse', tv ? 'tv-texto' : 'text-body')}>
          <thead>
            <tr className={cn('border-b text-left text-muted-foreground', tv ? 'tv-meta' : 'bg-muted text-meta')}>
              <th scope="col" className="h-9 px-3 font-medium">Nº</th>
              <th scope="col" className="h-9 px-3 font-medium">Etapa</th>
              <th scope="col" className="h-9 px-3 font-medium">Cliente</th>
              <th scope="col" className="h-9 px-3 font-medium">Local</th>
              <th scope="col" className="h-9 px-3 font-medium">Origem</th>
              <th scope="col" className="h-9 px-3 text-right font-medium">Na etapa</th>
              <th scope="col" className="h-9 px-3 text-right font-medium">Excesso</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((a) => (
              <tr key={a.id} className={cn('border-b last:border-0', !tv && 'transition-colors duration-fast hover:bg-row-hover')}>
                <td className={cn('px-3 font-medium tabular-nums', tv ? 'py-2.5' : 'h-10')}>
                  {tv ? (
                    numero(a.numero_interno)
                  ) : (
                    <LinkDrill to={linkSolicitacao(a.id)} className="text-primary-strong hover:underline">
                      {numero(a.numero_interno)}
                    </LinkDrill>
                  )}
                </td>
                <td className="px-3">
                  {tv ? (
                    // Na TV o badge de 11px não se lê: ponto + rótulo no tamanho da tabela.
                    <span className="flex items-center gap-2 whitespace-nowrap text-foreground">
                      <StatusDot status={a.status} /> {STATUS_LABELS[a.status]}
                    </span>
                  ) : (
                    <SolicitacaoStatusBadge status={a.status} />
                  )}
                </td>
                <td className="max-w-[16rem] truncate px-3 text-foreground">{a.cliente ?? '—'}</td>
                <td className="max-w-[12rem] truncate px-3 text-muted-foreground">{a.local ?? 'Sem local'}</td>
                <td className="px-3 text-muted-foreground">{rotuloOrigem(a.origem)}</td>
                <td className="px-3 text-right tabular-nums text-foreground">{fmtDur(a.min_na_etapa)}</td>
                <td className="px-3 text-right font-medium tabular-nums text-primary-strong">+{fmtDur(a.excesso_min)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cartões (< 768px) */}
      {!tv && (
        <ul className="divide-y md:hidden">
          {linhas.map((a) => (
            <li key={a.id}>
              <LinkDrill to={linkSolicitacao(a.id)} className="block py-2.5 transition-colors duration-fast hover:bg-row-hover">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium tabular-nums text-primary-strong">{numero(a.numero_interno)}</span>
                  <span className="text-body-sm font-medium tabular-nums text-primary-strong">+{fmtDur(a.excesso_min)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
                  <SolicitacaoStatusBadge status={a.status} />
                  <span className="text-muted-foreground tabular-nums">há {fmtDur(a.min_na_etapa)}</span>
                </div>
                <p className="mt-1 truncate text-body-sm text-foreground">
                  {a.cliente ?? '—'} <span className="text-muted-foreground">· {a.local ?? 'Sem local'} · {rotuloOrigem(a.origem)}</span>
                </p>
              </LinkDrill>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
