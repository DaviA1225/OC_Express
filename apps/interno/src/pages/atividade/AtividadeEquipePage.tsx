import * as React from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { RefreshCw, TriangleAlert, Users, UserCheck, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiTile } from '@/components/shared/KpiTile'
import { Spinner } from '@/components/shared/Spinner'
import { labelPerfil } from '@/features/auth/perfis'
import { fmtInt } from '@/lib/format'
import {
  useAtividadeEquipe,
  formatHaQuanto,
  type AtividadeUsuario,
} from '@/features/atividade/useAtividadeEquipe'
import { cn } from '@/lib/utils'

// Minutos sem registrar ação a partir dos quais o atendente é sinalizado como
// ocioso. Ajustável na própria tela.
const LIMIARES = [15, 30, 60] as const
type Limiar = (typeof LIMIARES)[number]

function ehOcioso(u: AtividadeUsuario, limiarMin: number): boolean {
  return u.ociosoMin == null || u.ociosoMin > limiarMin
}

function numeroFmt(n: number | null): string {
  return n == null ? '' : `#${String(n).padStart(4, '0')}`
}

export default function AtividadeEquipePage() {
  const [limiar, setLimiar] = React.useState<Limiar>(30)
  const { data, isLoading, isError, error, isFetching, refetch } = useAtividadeEquipe()

  const usuarios = React.useMemo(() => data?.usuarios ?? [], [data])
  const ociosos = usuarios.filter((u) => ehOcioso(u, limiar))
  const ativos = usuarios.filter((u) => !ehOcioso(u, limiar))

  // Ociosos primeiro (o que o gestor quer enxergar), do mais parado ao menos;
  // depois os ativos, do mais recente ao mais antigo.
  const ordenados = React.useMemo(() => {
    const ocioMin = (u: AtividadeUsuario) => u.ociosoMin ?? Number.POSITIVE_INFINITY
    return [...usuarios].sort((a, b) => {
      const ao = ehOcioso(a, limiar)
      const bo = ehOcioso(b, limiar)
      if (ao !== bo) return ao ? -1 : 1
      return ao ? ocioMin(b) - ocioMin(a) : ocioMin(a) - ocioMin(b)
    })
  }, [usuarios, limiar])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Atividade da equipe"
        description="O que cada atendente está fazendo agora, com base nas ações registradas."
        actions={
          <>
          <div className="flex items-center gap-0.5 rounded-surface border bg-card p-0.5" role="group" aria-label="Limite de inatividade">
            {LIMIARES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setLimiar(m)}
                aria-pressed={limiar === m}
                className={cn(
                  'rounded-control px-2 py-1 text-body-sm font-medium transition-colors duration-fast',
                  limiar === m
                    ? 'bg-primary/[0.08] text-primary-strong'
                    : 'text-muted-foreground hover:bg-row-hover hover:text-foreground',
                )}
                title={`Marcar como ocioso após ${m} min sem ação`}
              >
                {m} min
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </Button>
          </>
        }
      />

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <KpiTile label="Equipe" value={resumoValor(isLoading, usuarios.length)} icon={Users} />
        <KpiTile label="Trabalhando" value={resumoValor(isLoading, ativos.length)} icon={UserCheck} />
        <KpiTile
          label="Sem ação recente"
          value={resumoValor(isLoading, ociosos.length)}
          icon={Clock}
          hint={`Mais de ${limiar} min sem registrar ação`}
        />
      </div>

      {isError && (
        <div className="flex items-center gap-2 rounded-lg border border-danger-border bg-danger-subtle px-3 py-2 text-body text-danger">
          <TriangleAlert className="h-4 w-4" />
          Não foi possível carregar a atividade. {(error as Error)?.message}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-body">
          <thead>
            <tr className="border-b bg-muted text-left text-meta text-muted-foreground">
              <th className="px-4 py-2 font-medium">Atendente</th>
              <th className="px-4 py-2 font-medium">Última ação</th>
              <th className="px-4 py-2 font-medium">Quando</th>
              <th className="px-4 py-2 text-right font-medium">Hoje</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-4 py-2.5" colSpan={4}>
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))}

            {!isLoading && ordenados.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={4}>
                  Nenhum atendente operacional ativo encontrado.
                </td>
              </tr>
            )}

            {!isLoading &&
              ordenados.map((u) => {
                const ocioso = ehOcioso(u, limiar)
                return (
                  <tr
                    key={u.userId}
                    className={cn(
                      'border-b last:border-0 align-middle',
                      ocioso && 'bg-warning-subtle',
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            ocioso ? 'bg-warning' : 'bg-success',
                          )}
                          aria-hidden
                        />
                        <span className="font-medium text-foreground">{u.nome}</span>
                        <span className="text-meta text-muted-foreground">
                          {labelPerfil(u.perfil)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-foreground">
                      {u.ultimaAcao ? (
                        <>
                          {u.ultimaAcao.descricao}{' '}
                          <span className="text-muted-foreground">
                            {numeroFmt(u.ultimaAcao.numero)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Sem ação em 7 dias</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={ocioso ? 'text-warning' : 'text-foreground'}>
                        {formatHaQuanto(u.ociosoMin)}
                      </span>
                      {u.ultimaAcao && (
                        <span
                          className="ml-1 text-meta text-muted-foreground"
                          title={format(new Date(u.ultimaAcao.at), "dd/MM/yyyy 'às' HH:mm", {
                            locale: ptBR,
                          })}
                        >
                          ({format(new Date(u.ultimaAcao.at), 'HH:mm', { locale: ptBR })})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {u.hoje.total > 0 ? (
                        <span className="text-foreground" title={resumoHoje(u)}>
                          {u.hoje.total} {u.hoje.total === 1 ? 'ação' : 'ações'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">nada hoje</span>
                      )}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      <p className="text-meta text-muted-foreground">
        Baseado no log de ações (criar, emitir, gerar e finalizar OC). Não detecta presença: quem
        está no telefone, lendo ou conferindo não registra ação e pode aparecer como ocioso.
        Atualiza a cada 60 s
        {data ? ` · atualizado às ${format(new Date(data.geradoEm), 'HH:mm')}` : ''}.
      </p>
    </div>
  )
}

function resumoHoje(u: AtividadeUsuario): string {
  const partes: string[] = []
  if (u.hoje.criou) partes.push(`${u.hoje.criou} criada(s)`)
  if (u.hoje.emEmissao) partes.push(`${u.hoje.emEmissao} em emissão`)
  if (u.hoje.gerouOC) partes.push(`${u.hoje.gerouOC} OC gerada(s)`)
  if (u.hoje.enviouOC) partes.push(`${u.hoje.enviouOC} enviada(s)`)
  if (u.hoje.finalizou) partes.push(`${u.hoje.finalizou} finalizada(s)`)
  return partes.join(' · ') || 'Sem ações hoje'
}

// Valor do <KpiTile> do resumo: esqueleto enquanto carrega.
function resumoValor(isLoading: boolean, n: number): React.ReactNode {
  return isLoading ? <Skeleton className="inline-block h-8 w-10 align-middle" /> : fmtInt(n)
}
