import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Undo2, CalendarCheck } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { usePendenciasAbertas } from '@/features/solicitacoes/usePendencias'
import { useSolicitacoesPortal } from '@/features/solicitacoes/useSolicitacoes'
import { useAgendamentosRecentes } from '@/features/agendamentos/useAgendamentos'
import { dataCompleta, horaCurta } from '@/features/agendamentos/agendamento'
import { formatNumeroOC } from '@/lib/utils'

/** Sino do portal: o que precisa da atenção do parceiro. Duas origens —
 *  pendências que a LHG devolveu (estado aberto) e agendamentos confirmados nas
 *  últimas 24h, que trazem comprovante novo para baixar. */
export function PendenciasBell() {
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const { data: pendencias } = usePendenciasAbertas()
  const { data: solicitacoes } = useSolicitacoesPortal()
  const { data: agendamentos } = useAgendamentosRecentes()

  const numeroPorSolicitacao = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const s of solicitacoes ?? []) {
      if (s.id != null && s.numero_interno != null) m.set(s.id, s.numero_interno)
    }
    return m
  }, [solicitacoes])

  const itens = pendencias ?? []
  const agendados = agendamentos ?? []
  const total = itens.length + agendados.length

  const handleSelect = (solicitacaoId: string) => {
    setOpen(false)
    navigate(`/solicitacoes/${solicitacaoId}`)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={total > 0 ? `${total} aviso${total === 1 ? '' : 's'}` : 'Avisos'}
          title={total > 0 ? `${total} aviso${total === 1 ? '' : 's'} para você` : 'Nenhum aviso'}
        >
          <Bell className="h-5 w-5" />
          {total > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold text-white">
              {total > 99 ? '99+' : total}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
        <header className="border-b px-3 py-2">
          <p className="text-[13px] font-medium text-foreground">Avisos</p>
          <p className="text-[10px] text-muted-foreground">
            O que precisa da sua ação e o que ficou pronto
          </p>
        </header>
        <div className="max-h-[400px] overflow-y-auto">
          {total === 0 ? (
            <div className="px-3 py-10 text-center text-[13px] text-muted-foreground">
              Nada pendente. 🎉
              <p className="mt-1 text-[11px]">Nenhuma solicitação aguardando você.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {agendados.map((a) => {
                const numero = numeroPorSolicitacao.get(a.solicitacao_id)
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(a.solicitacao_id)}
                      className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/60"
                    >
                      <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <div className="min-w-0 flex-1">
                        {numero != null && (
                          <span className="text-[12px] font-medium tabular-nums text-primary">
                            {formatNumeroOC(numero)}
                          </span>
                        )}
                        <p className="text-[12px] text-foreground">
                          Descarga agendada para {dataCompleta(a.data_agendada)} às{' '}
                          {horaCurta(a.hora_agendada)} — comprovante disponível.
                        </p>
                      </div>
                    </button>
                  </li>
                )
              })}
              {itens.map((p) => {
                const numero = numeroPorSolicitacao.get(p.solicitacao_id)
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(p.solicitacao_id)}
                      className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/60"
                    >
                      <Undo2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                      <div className="min-w-0 flex-1">
                        {numero != null && (
                          <span className="text-[12px] font-medium tabular-nums text-primary">
                            {formatNumeroOC(numero)}
                          </span>
                        )}
                        <p className="line-clamp-2 text-[12px] text-foreground">{p.motivo}</p>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
