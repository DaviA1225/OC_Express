import * as React from 'react'
import {
  CalendarClock,
  Loader2,
  RefreshCw,
  Clock,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ExternalLink,
  FileText,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Combobox } from '@/components/shared/Combobox'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { PainelAgendamento } from '@/features/agendamentos/PainelAgendamento'
import { ReagendarDialog } from '@/features/agendamentos/ReagendarDialog'
import { useTerminais, useGradesAtivas } from '@/features/agendamentos/useTerminais'
import {
  dadosDoVeiculo,
  getDocumentoSignedUrl,
  nomeTerminal,
  useAssumirAgendamento,
  useCancelarAgendamento,
  useFilaAgendamentos,
  useLiberarAgendamento,
  useNomesInternos,
  type AgendamentoRow,
} from '@/features/agendamentos/useAgendamentos'
import {
  AGENDAMENTO_STATUS_CLASSES,
  AGENDAMENTO_STATUS_LABELS,
  assumidoExpirado,
  calcularEspera,
  dataCompleta,
  dataCurta,
  duracaoLegivel,
  horaCurta,
  numeroAgendamento,
} from '@/features/agendamentos/agendamento'
import type { AgendamentoStatus } from '@/types/database.types'

type Aba = 'fila' | 'agendados' | 'historico'

const ABAS: { valor: Aba; label: string; statuses: AgendamentoStatus[] }[] = [
  { valor: 'fila', label: 'Fila', statuses: ['solicitado', 'em_andamento'] },
  { valor: 'agendados', label: 'Agendados', statuses: ['agendado'] },
  {
    valor: 'historico',
    label: 'Histórico',
    statuses: ['solicitado', 'em_andamento', 'agendado', 'substituido', 'cancelado'],
  },
]

interface Grupo {
  clienteId: string
  titulo: string
  itens: AgendamentoRow[]
}

/**
 * Fila de agendamentos, agrupada por terminal.
 *
 * A equipe não agenda um de cada vez: entra no sistema do TCI e resolve todos
 * os TCI de uma vez. Por isso o agrupamento é por terminal e não cronológico —
 * dentro do grupo, sim, quem esperou mais aparece primeiro.
 */
export default function AgendamentosPage() {
  const { user } = useAuth()
  const [aba, setAba] = React.useState<Aba>('fila')
  const [clienteId, setClienteId] = React.useState<string | null>(null)
  const [soAtrasados, setSoAtrasados] = React.useState(false)
  const [painelId, setPainelId] = React.useState<string | null>(null)
  const [reagendar, setReagendar] = React.useState<AgendamentoRow | null>(null)
  const [cancelar, setCancelar] = React.useState<AgendamentoRow | null>(null)

  const statuses = ABAS.find((a) => a.valor === aba)?.statuses ?? ABAS[0].statuses
  // `soAtrasados` não entra no filtro do servidor de propósito: é recorte sobre
  // o tempo de espera, que muda a cada minuto sem o dado mudar. Filtrar aqui
  // evita refetch a cada toggle.
  const fila = useFilaAgendamentos({ clienteId, parceiroId: null, status: statuses })
  const terminais = useTerminais()
  const nomes = useNomesInternos()

  const assumir = useAssumirAgendamento()
  const liberar = useLiberarAgendamento()
  const cancelarMut = useCancelarAgendamento()

  const linhas = React.useMemo(() => {
    const todas = fila.data ?? []
    if (!soAtrasados) return todas
    return todas.filter((a) => calcularEspera(a.created_at).severidade !== 'normal')
  }, [fila.data, soAtrasados])

  const grupos = React.useMemo<Grupo[]>(() => {
    const mapa = new Map<string, Grupo>()
    // `linhas` já vem por `created_at` crescente, então cada grupo nasce na
    // ordem de chegada: quem enviou primeiro é agendado primeiro.
    for (const a of linhas) {
      const id = a.solicitacao?.cliente_id ?? 'sem-terminal'
      const grupo = mapa.get(id) ?? { clienteId: id, titulo: nomeTerminal(a), itens: [] }
      grupo.itens.push(a)
      mapa.set(id, grupo)
    }
    // E os terminais entre si seguem a mesma regra: primeiro o que tem o pedido
    // mais antigo esperando. Agrupar por terminal é só para a equipe resolver
    // todos os TCI numa entrada só no sistema deles — não muda quem vem antes.
    // (Ordenar por volume, como estava, furava a fila: cinco pedidos de uma
    // hora atrás passariam na frente de um que espera desde a manhã.)
    const maisAntigo = (g: Grupo) => new Date(g.itens[0].created_at).getTime()
    return [...mapa.values()].sort((a, b) => maisAntigo(a) - maisAntigo(b))
  }, [linhas])

  const grades = useGradesAtivas(grupos.map((g) => g.clienteId).filter((id) => id !== 'sem-terminal'))

  const opcoesTerminal = (terminais.data ?? []).map((t) => ({
    value: t.id,
    label: t.terminal_nome?.trim() || t.razao_social,
    hint: t.antecedencia_minima_horas != null ? `${t.antecedencia_minima_horas}h de antecedência` : undefined,
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] font-medium text-foreground">
            <CalendarClock className="h-5 w-5 text-muted-foreground" />
            Agendamentos
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Pedidos de agendamento de descarga, agrupados pelo terminal onde a equipe agenda.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void fila.refetch()}
          disabled={fila.isFetching}
        >
          {fila.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Atualizar
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border bg-card p-0.5">
          {ABAS.map((a) => (
            <button
              key={a.valor}
              type="button"
              onClick={() => setAba(a.valor)}
              className={cn(
                'rounded px-2.5 py-1 text-[12px] font-medium transition-colors',
                aba === a.valor
                  ? 'bg-primary/10 text-primary-strong'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="w-[240px]">
          <Combobox
            options={opcoesTerminal}
            value={clienteId}
            onChange={setClienteId}
            placeholder="Todos os terminais"
            searchPlaceholder="Buscar terminal…"
            emptyMessage="Nenhum cliente exige agendamento."
            loading={terminais.isLoading}
            ariaLabel="Filtrar por terminal"
          />
        </div>

        <button
          type="button"
          onClick={() => setSoAtrasados((v) => !v)}
          aria-pressed={soAtrasados}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors',
            soAtrasados
              ? 'border-amber-300 bg-amber-50 text-amber-800'
              : 'bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          <Clock className="h-3.5 w-3.5" />
          Só os que esperam há mais de 4h
        </button>
      </div>

      {fila.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : fila.isError ? (
        <div className="rounded-lg border bg-card p-6 text-center">
          <p className="text-[13px] text-foreground">Não foi possível carregar os agendamentos.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void fila.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : grupos.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={CalendarClock}
            title={aba === 'fila' ? 'Nenhum agendamento na fila' : 'Nada por aqui'}
            description={
              aba === 'fila'
                ? 'Quando um parceiro pedir agendamento, o card aparece aqui agrupado pelo terminal.'
                : 'Ajuste os filtros ou volte para a fila.'
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          {grupos.map((grupo) => (
            <section key={grupo.clienteId} className="space-y-2">
              <CabecalhoGrupo
                grupo={grupo}
                grade={grades.data?.get(grupo.clienteId) ?? []}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                {grupo.itens.map((item) => (
                  <CardAgendamento
                    key={item.id}
                    item={item}
                    nomes={nomes.data}
                    meuId={user?.id ?? null}
                    ocupado={assumir.isPending || liberar.isPending}
                    onAssumir={async () => {
                      await assumir.mutateAsync(item.id)
                      setPainelId(item.id)
                    }}
                    onAbrir={() => setPainelId(item.id)}
                    onLiberar={() => void liberar.mutateAsync(item.id)}
                    onReagendar={() => setReagendar(item)}
                    onCancelar={() => setCancelar(item)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <PainelAgendamento agendamentoId={painelId} onOpenChange={(o) => !o && setPainelId(null)} />

      <ReagendarDialog
        agendamento={reagendar}
        onOpenChange={(o: boolean) => !o && setReagendar(null)}
      />

      <ConfirmDialog
        open={!!cancelar}
        onOpenChange={(o) => !o && setCancelar(null)}
        title="Cancelar agendamento?"
        description={
          cancelar
            ? `O pedido ${numeroAgendamento(cancelar.numero_interno)} sai da fila. Se o terminal já confirmou a janela, prefira reagendar — assim o histórico fica encadeado.`
            : ''
        }
        confirmLabel="Sim, cancelar"
        destructive
        onConfirm={async () => {
          if (!cancelar) return
          await cancelarMut.mutateAsync(cancelar.id)
          setCancelar(null)
        }}
      />
    </div>
  )
}

function CabecalhoGrupo({ grupo, grade }: { grupo: Grupo; grade: { hora: string; duracao_minutos: number; capacidade: number | null }[] }) {
  const primeiro = grupo.itens[0]
  const cliente = primeiro?.solicitacao?.cliente
  const antecedencia = cliente?.antecedencia_minima_horas

  const resumoGrade = React.useMemo(() => {
    if (grade.length === 0) return 'Sem grade cadastrada'
    const primeiroSlot = grade[0]
    const ultimo = grade[grade.length - 1]
    const cap = primeiroSlot.capacidade
    const janela = `${horaCurta(primeiroSlot.hora)}–${horaCurta(ultimo.hora)}`
    const porSlot = cap != null ? ` · ${cap} por ${duracaoLegivel(primeiroSlot.duracao_minutos)}` : ''
    return `${janela}${porSlot}`
  }, [grade])

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-1.5">
      <h2 className="text-[14px] font-medium text-foreground">{grupo.titulo}</h2>
      <span className="text-[12px] tabular-nums text-muted-foreground">
        {grupo.itens.length} pendente{grupo.itens.length === 1 ? '' : 's'}
      </span>
      <span className="text-[11px] tabular-nums text-muted-foreground">{resumoGrade}</span>
      {antecedencia != null && (
        <span className="text-[11px] text-muted-foreground">
          exige {antecedencia}h de antecedência
        </span>
      )}
    </div>
  )
}

function CardAgendamento({
  item,
  nomes,
  meuId,
  ocupado,
  onAssumir,
  onAbrir,
  onLiberar,
  onReagendar,
  onCancelar,
}: {
  item: AgendamentoRow
  nomes: Map<string, string> | undefined
  meuId: string | null
  ocupado: boolean
  onAssumir: () => Promise<void>
  onAbrir: () => void
  onLiberar: () => void
  onReagendar: () => void
  onCancelar: () => void
}) {
  const dados = dadosDoVeiculo(item)
  const espera = calcularEspera(item.created_at)
  const emAndamento = item.status === 'em_andamento'
  // `assumido_por` é gravado pelo trigger com `auth.uid()`, o mesmo id do
  // usuário logado — daí a comparação direta.
  const meu = emAndamento && !!meuId && item.assumido_por === meuId
  const expirado = emAndamento && assumidoExpirado(item.assumido_em)
  const quem = item.assumido_por ? nomes?.get(item.assumido_por) ?? 'Outra pessoa' : null
  const divergiu =
    item.status === 'agendado' &&
    (item.data_agendada !== item.data_preferida ||
      (item.hora_preferida != null && item.hora_agendada !== item.hora_preferida))

  return (
    <article
      className={cn(
        // `border-slate-300` e não a borda padrão: a do token quase some contra
        // o fundo do card e os vizinhos ficam grudados. Mesmo par de tons dos
        // cards de solicitação, para as duas telas lerem igual.
        'relative flex flex-col gap-2 rounded-lg border border-slate-300 bg-card p-3 dark:border-slate-700',
        // Mesmo gesto dos cards de solicitação: a caixa inteira cresce sob o
        // ponteiro, então texto, borda e selos ampliam na mesma proporção. O
        // hover:z-10 mantém o card ampliado por cima dos vizinhos da grade.
        // Sem guarda `motion-reduce` — por decisão de produto o efeito roda
        // mesmo para quem liga "reduzir movimento" no sistema.
        'transition-transform duration-300 ease-out hover:z-10 hover:scale-[1.03]',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] text-muted-foreground">
          {numeroAgendamento(item.numero_interno)}
        </span>
        <span className="text-[13px] font-medium text-foreground">
          {item.parceiro?.razao_social ?? 'Solicitação interna'}
        </span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-medium',
            AGENDAMENTO_STATUS_CLASSES[item.status],
          )}
        >
          {AGENDAMENTO_STATUS_LABELS[item.status]}
        </span>
        {(item.status === 'solicitado' || emAndamento) && (
          <span
            className={cn(
              'ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums',
              espera.severidade === 'critico'
                ? 'bg-red-100 text-red-800'
                : espera.severidade === 'atencao'
                  ? 'bg-amber-100 text-amber-800'
                  : 'text-muted-foreground',
            )}
            title="Tempo desde o pedido"
          >
            <Clock className="h-3 w-3" />
            {espera.label}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] sm:grid-cols-4">
        <Campo rotulo="Motorista" valor={dados.motoristaNome} />
        <Campo rotulo="Cavalo" valor={dados.placaCavalo} mono />
        <Campo rotulo="Nota fiscal" valor={item.nota_fiscal} mono />
        <Campo
          rotulo="Pediu"
          valor={`${dataCurta(item.data_preferida)}${item.hora_preferida ? ` · ${horaCurta(item.hora_preferida)}` : ' · qualquer'}`}
        />
      </dl>

      {item.status === 'agendado' && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-[12px]">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span className="text-foreground">
            Agendado {dataCompleta(item.data_agendada)} às {horaCurta(item.hora_agendada)}
          </span>
          {divergiu && (
            <span className="text-muted-foreground">
              (pediu {dataCurta(item.data_preferida)}
              {item.hora_preferida ? ` · ${horaCurta(item.hora_preferida)}` : ''})
            </span>
          )}
          {item.hora_fora_da_grade && (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              fora da grade
            </span>
          )}
          <span className="ml-auto flex items-center gap-2.5">
            {item.comprovante_path && (
              <BotaoDocumento path={item.comprovante_path} rotulo="Comprovante" />
            )}
            {item.contrato_frete_path && (
              <BotaoDocumento path={item.contrato_frete_path} rotulo="Contrato" />
            )}
          </span>
        </div>
      )}

      {!item.nota_fiscal && item.status !== 'agendado' && (
        <p className="inline-flex items-center gap-1.5 text-[11px] text-amber-700">
          <AlertTriangle className="h-3 w-3" />
          NF ainda não importada — buscar no Corporate
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {item.solicitacao && (
          <Link
            to={`/solicitacoes/${item.solicitacao.id}`}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Solicitação #{item.solicitacao.numero_interno}
          </Link>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {item.status === 'solicitado' && (
            <Button size="sm" disabled={ocupado} onClick={() => void onAssumir()}>
              Assumir
            </Button>
          )}

          {emAndamento && (meu || expirado) && (
            <>
              <Button size="sm" variant="outline" onClick={onLiberar} disabled={ocupado}>
                Devolver à fila
              </Button>
              {/* Retomar passa pela RPC de novo: a trava tem que trocar de dono,
                  senão o card continua dizendo que é de quem saiu. */}
              <Button size="sm" disabled={ocupado} onClick={() => (meu ? onAbrir() : void onAssumir())}>
                {meu ? 'Continuar' : 'Retomar'}
              </Button>
            </>
          )}

          {emAndamento && !meu && !expirado && (
            <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] text-muted-foreground">
              <UserCheck className="h-3 w-3" />
              {quem} está agendando
            </span>
          )}

          {item.status === 'agendado' && (
            <>
              <Button size="sm" variant="outline" onClick={onAbrir}>
                Documentos
              </Button>
              <Button size="sm" variant="outline" onClick={onReagendar}>
                <RotateCcw className="h-3.5 w-3.5" />
                Reagendar
              </Button>
            </>
          )}

          {(item.status === 'solicitado' || emAndamento) && (
            <Button size="sm" variant="ghost" onClick={onCancelar}>
              Cancelar
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

function Campo({ rotulo, valor, mono = false }: { rotulo: string; valor: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground">{rotulo}</dt>
      <dd className={cn('truncate text-foreground', mono && 'font-mono text-[12px]')}>
        {valor || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  )
}

function BotaoDocumento({ path, rotulo }: { path: string; rotulo: string }) {
  const [abrindo, setAbrindo] = React.useState(false)
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-[11px] text-primary-strong underline-offset-2 hover:underline"
      onClick={async () => {
        setAbrindo(true)
        try {
          const url = await getDocumentoSignedUrl(path)
          window.open(url, '_blank', 'noopener,noreferrer')
        } catch {
          toast.error(`Não foi possível abrir o documento (${rotulo.toLowerCase()}).`)
        } finally {
          setAbrindo(false)
        }
      }}
    >
      {abrindo ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
      {rotulo}
    </button>
  )
}
