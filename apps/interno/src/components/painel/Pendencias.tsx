import { LinkDrill } from './LinkDrill'
import { ChevronRight } from 'lucide-react'
import { DRILL_ATIVO, linkSolicitacoes } from '@/features/metricas/links'
import type { FiltrosComuns, PainelEstadoAtual } from '@/features/metricas/tipos'
import { fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Item {
  rotulo: string
  ajuda: string
  qtd: number
  to: string
  critico?: boolean
}

/** P11, P12 e P7 (vencidas) — cada linha leva à lista filtrada. */
export function Pendencias({ estado, filtros, tv }: { estado: PainelEstadoAtual; filtros: FiltrosComuns; tv?: boolean }) {
  const itens: Item[] = [
    {
      rotulo: 'Pamcard a providenciar',
      ajuda: 'De parceiro, abertas, sem cartão e não providenciadas',
      qtd: estado.pamcard_pendente,
      // Mesmo recorte do tile (0080): abertas, inclusive OC enviada.
      to: linkSolicitacoes({ origem: 'parceiro', pamcard: 'pendente', status: 'recebida,em_cadastro,instrucao_emitida,oc_gerada,oc_enviada' }, filtros),
    },
    {
      rotulo: 'Pendências com parceiro',
      ajuda: 'Abertas para o parceiro e ainda sem resposta',
      qtd: estado.pendencias_parceiro,
      to: linkSolicitacoes({ pendencia: 'aberta' }, filtros),
    },
    {
      rotulo: 'OCs vencendo',
      ajuda: 'Validade dentro do alerta configurado',
      qtd: estado.validade.vencendo,
      to: linkSolicitacoes({ validade: 'vencendo' }, filtros),
    },
    {
      rotulo: 'OCs vencidas',
      ajuda: 'OC gerada ou enviada, não finalizada, já fora da validade',
      qtd: estado.validade.vencidas,
      to: linkSolicitacoes({ validade: 'vencida' }, filtros),
      critico: true,
    },
  ]
  return (
    <ul className="divide-y">
      {itens.map((i) => {
        const conteudo = (
          <>
            <div className="min-w-0 flex-1">
              <p className={cn('text-foreground', tv ? 'tv-texto' : 'text-body')}>{i.rotulo}</p>
              {!tv && <p className="truncate text-meta text-muted-foreground">{i.ajuda}</p>}
            </div>
            <span
              className={cn(
                'shrink-0 font-display font-medium tabular-nums',
                tv ? 'tv-kpi-sm' : 'text-title',
                i.critico && i.qtd > 0 ? 'text-danger' : i.qtd > 0 ? 'text-foreground' : 'text-tertiary',
              )}
            >
              {fmtInt(i.qtd)}
            </span>
          </>
        )
        return (
          <li key={i.rotulo}>
            {tv ? (
              <div className="flex items-center gap-3 py-3">{conteudo}</div>
            ) : (
              <LinkDrill
                to={i.to}
                className="group flex items-center gap-3 py-2.5 transition-colors duration-fast hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {conteudo}
                {DRILL_ATIVO && <ChevronRight className="h-4 w-4 shrink-0 text-tertiary group-hover:text-foreground" aria-hidden />}
              </LinkDrill>
            )}
          </li>
        )
      })}
    </ul>
  )
}
