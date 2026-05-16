import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { History, MapPin, ArrowRight, User, Truck } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { SolicitacaoStatusBadge } from '@/components/shared/SolicitacaoStatusBadge'
import { formatNumeroOC } from '@/lib/utils'
import { HISTORICO_JANELA_DIAS, useHistoricoOperacional } from './useHistorico'

interface Props {
  solicitacaoId: string
  motoristaId: string | null
  veiculoId: string | null
  clienteId: string | null
  motoristaNome?: string | null
  veiculoPlaca?: string | null
}

export function HistoricoCard({
  solicitacaoId,
  motoristaId,
  veiculoId,
  clienteId,
  motoristaNome,
  veiculoPlaca,
}: Props) {
  const q = useHistoricoOperacional({
    motoristaId,
    veiculoId,
    clienteId,
    currentId: solicitacaoId,
  })

  if (!motoristaId) {
    return (
      <section className="rounded-lg border bg-background">
        <header className="flex items-center gap-2 border-b px-4 py-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[14px] font-medium text-foreground">Histórico operacional</h2>
        </header>
        <div className="p-4 text-[13px] text-muted-foreground">
          Atribua um motorista para ver o histórico.
        </div>
      </section>
    )
  }

  const data = q.data

  return (
    <section className="rounded-lg border bg-background">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[14px] font-medium text-foreground">Histórico operacional</h2>
        </div>
        <span className="text-[11px] text-muted-foreground">Últimos {HISTORICO_JANELA_DIAS}d</span>
      </header>
      <div className="space-y-3 p-4">
        {q.isLoading || !data ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat
                icon={<User className="h-3.5 w-3.5" />}
                label="Motorista"
                hint={motoristaNome ?? '—'}
                value={data.totalMotorista}
              />
              <Stat
                icon={<Truck className="h-3.5 w-3.5" />}
                label="Cavalo"
                hint={veiculoPlaca ?? '—'}
                value={data.totalVeiculo}
              />
              <Stat
                icon={<MapPin className="h-3.5 w-3.5" />}
                label="Mesmo cliente"
                hint="motorista × cliente"
                value={data.totalParaCliente}
              />
            </div>

            {data.topRota && (
              <p className="rounded-md bg-muted/50 px-3 py-2 text-[12px] text-foreground">
                Rota mais frequente:{' '}
                <span className="font-medium">{data.topRota.cliente}</span>
                <span className="text-muted-foreground"> ({data.topRota.count}× nos últimos {HISTORICO_JANELA_DIAS}d)</span>
              </p>
            )}

            {data.ultimaParaCliente && (
              <Link
                to={`/solicitacoes/${data.ultimaParaCliente.id}`}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-[12px] transition-colors hover:bg-muted"
              >
                <div className="min-w-0">
                  <p className="text-muted-foreground">Última OC desse motorista para este cliente</p>
                  <p className="truncate text-foreground">
                    {formatNumeroOC(data.ultimaParaCliente.numero_interno)}
                    {' · '}
                    {format(new Date(data.ultimaParaCliente.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            )}

            {data.recentes.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[10px] uppercase tracking-[0.5px] text-muted-foreground">
                  Recentes ({data.recentes.length})
                </p>
                <ul className="divide-y">
                  {data.recentes.map((r) => (
                    <li key={r.id}>
                      <Link
                        to={`/solicitacoes/${r.id}`}
                        className="flex items-center gap-2 py-2 text-[12px] hover:bg-muted/50"
                      >
                        <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                          {formatNumeroOC(r.numero_interno)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-foreground">
                            {r.cliente?.razao_social ?? '—'}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {r.tipo === 'retorno' ? 'Retorno' : 'Carregamento'}
                            {r.veiculo?.placa ? ` · ${r.veiculo.placa}` : ''}
                            {' · '}
                            {format(new Date(r.created_at), 'dd/MM', { locale: ptBR })}
                          </p>
                        </div>
                        <SolicitacaoStatusBadge status={r.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                Nenhuma OC anterior nos últimos {HISTORICO_JANELA_DIAS} dias.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}

interface StatProps {
  icon: React.ReactNode
  label: string
  hint: string
  value: number
}

function Stat({ icon, label, hint, value }: StatProps) {
  return (
    <div className="rounded-md border px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.5px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-0.5 text-[18px] font-medium tabular-nums leading-none text-foreground">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={hint}>{hint}</p>
    </div>
  )
}
