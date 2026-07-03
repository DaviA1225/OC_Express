import * as React from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Activity, RefreshCw, Loader2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] font-medium text-foreground">
            <Activity className="h-5 w-5 text-muted-foreground" />
            Atividade da equipe
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            O que cada atendente está fazendo agora, com base nas ações registradas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border bg-card p-0.5">
            {LIMIARES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setLimiar(m)}
                className={cn(
                  'rounded px-2 py-1 text-[12px] font-medium transition-colors',
                  limiar === m
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                title={`Marcar como ocioso após ${m} min sem ação`}
              >
                {m} min
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <ResumoCard label="Equipe" valor={isLoading ? null : usuarios.length} />
        <ResumoCard label="Trabalhando" valor={isLoading ? null : ativos.length} tom="ok" />
        <ResumoCard label="Sem ação recente" valor={isLoading ? null : ociosos.length} tom="alerta" />
      </div>

      {isError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
          <TriangleAlert className="h-4 w-4" />
          Não foi possível carregar a atividade. {(error as Error)?.message}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b text-left text-[10px] uppercase tracking-[0.5px] text-muted-foreground">
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
                      ocioso && 'bg-amber-50/70 dark:bg-amber-950/20',
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            ocioso ? 'bg-amber-500' : 'bg-emerald-500',
                          )}
                          aria-hidden
                        />
                        <span className="font-medium text-foreground">{u.nome}</span>
                        <span className="text-[11px] capitalize text-muted-foreground">
                          {u.perfil}
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
                      <span className={ocioso ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'}>
                        {formatHaQuanto(u.ociosoMin)}
                      </span>
                      {u.ultimaAcao && (
                        <span
                          className="ml-1 text-[11px] text-muted-foreground"
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

      <p className="text-[11px] text-muted-foreground">
        Baseado no log de ações (criar, emitir, gerar e finalizar OC). Não detecta presença: quem
        está no telefone, lendo ou conferindo não registra ação e pode aparecer como ocioso.
        Atualiza a cada 30s
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

function ResumoCard({
  label,
  valor,
  tom,
}: {
  label: string
  valor: number | null
  tom?: 'ok' | 'alerta'
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground">{label}</div>
      {valor == null ? (
        <Skeleton className="mt-1 h-7 w-10" />
      ) : (
        <div
          className={cn(
            'text-[22px] font-medium leading-tight',
            tom === 'ok' && 'text-emerald-600 dark:text-emerald-400',
            tom === 'alerta' && valor > 0 && 'text-amber-600 dark:text-amber-400',
            !tom && 'text-foreground',
          )}
        >
          {valor}
        </div>
      )}
    </div>
  )
}
