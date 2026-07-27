import * as React from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ClipboardList, Lock, Plus, Search as SearchIcon, Truck, Building2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/solicitacoes/StatusBadge'
import { useAuth } from '@/hooks/useAuth'
import { useDebounce } from '@/hooks/useDebounce'
import { formatNumeroOC, cn } from '@/lib/utils'
import {
  useSolicitacoesPortal,
  useMotoristasBase,
  useVeiculosBase,
  useCarretasBase,
  useClientesPublicos,
  type PortalSolicitacao,
} from '@/features/solicitacoes/useSolicitacoes'
import { usePendenciasAbertas } from '@/features/solicitacoes/usePendencias'
import {
  STATUS_FILTRO_OPTIONS,
  matchStatusFiltro,
  type StatusFiltro,
} from '@/features/solicitacoes/status'

type Periodo = 'todo' | '7' | '30' | '90'

const PERIODO_OPTIONS: { value: Periodo; label: string }[] = [
  { value: 'todo', label: 'Todo o período' },
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
]

interface SolicitacaoView {
  sol: PortalSolicitacao
  motorista: string
  cavalo: string
  carreta: string | null
  cliente: string
}

export default function SolicitacoesListPage() {
  const { parceiro } = useAuth()
  const bloqueado = parceiro?.solicitacoes_bloqueadas === true
  const lista = useSolicitacoesPortal()
  const motoristas = useMotoristasBase()
  const veiculos = useVeiculosBase()
  const carretas = useCarretasBase()
  const clientes = useClientesPublicos()
  const pendencias = usePendenciasAbertas()
  const pendenciaPorSolicitacao = React.useMemo(
    () => new Set((pendencias.data ?? []).map((p) => p.solicitacao_id)),
    [pendencias.data],
  )

  const [search, setSearch] = React.useState('')
  const [statusFiltro, setStatusFiltro] = React.useState<StatusFiltro>('todas')
  const [periodo, setPeriodoState] = React.useState<Periodo>('todo')
  // Snapshot do "agora" capturado quando o usuário muda o período. Manter fora
  // do render evita Date.now() impuro durante a renderização (regra do React
  // Compiler) e congela a fronteira do filtro no momento da seleção.
  const [minDataMs, setMinDataMs] = React.useState<number | null>(null)
  const setPeriodo = (next: Periodo) => {
    setPeriodoState(next)
    setMinDataMs(next === 'todo' ? null : Date.now() - Number(next) * 24 * 60 * 60 * 1000)
  }
  const debouncedSearch = useDebounce(search, 300)

  // Mapas de resolução: a view só traz IDs.
  const views = React.useMemo<SolicitacaoView[]>(() => {
    const mot = new Map((motoristas.data ?? []).map((m) => [m.id, m.nome_completo]))
    const veic = new Map((veiculos.data ?? []).map((v) => [v.id, v.placa]))
    const carr = new Map((carretas.data ?? []).map((c) => [c.id, c.placa]))
    const cli = new Map((clientes.data ?? []).map((c) => [c.id, c.razao_social]))
    return (lista.data ?? []).map((sol) => ({
      sol,
      motorista: (sol.parceiro_motorista_id && mot.get(sol.parceiro_motorista_id)) || 'Motorista não identificado',
      cavalo: (sol.parceiro_veiculo_id && veic.get(sol.parceiro_veiculo_id)) || '—',
      carreta: sol.parceiro_carreta_id ? carr.get(sol.parceiro_carreta_id) ?? '—' : null,
      cliente: (sol.cliente_id && cli.get(sol.cliente_id)) || 'Cliente não identificado',
    }))
  }, [lista.data, motoristas.data, veiculos.data, carretas.data, clientes.data])

  const filtradas = React.useMemo(() => {
    const termo = debouncedSearch.trim().toLowerCase()
    return views.filter(({ sol, motorista, cavalo, carreta, cliente }) => {
      if (!matchStatusFiltro(sol.status, statusFiltro)) return false
      if (minDataMs && sol.created_at && new Date(sol.created_at).getTime() < minDataMs) {
        return false
      }
      if (termo) {
        const alvo = [
          motorista, cavalo, carreta ?? '', cliente,
          sol.numero_interno != null ? formatNumeroOC(sol.numero_interno) : '',
          sol.numero_interno != null ? String(sol.numero_interno) : '',
        ]
          .join(' ')
          .toLowerCase()
        if (!alvo.includes(termo)) return false
      }
      return true
    })
  }, [views, debouncedSearch, statusFiltro, minDataMs])

  const carregando =
    lista.isLoading || motoristas.isLoading || veiculos.isLoading ||
    carretas.isLoading || clientes.isLoading
  const total = lista.data?.length ?? 0
  const temFiltro = !!debouncedSearch.trim() || statusFiltro !== 'todas' || periodo !== 'todo'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            Minhas solicitações
          </h1>
          <p className="text-[12px] text-muted-foreground">
            {total} {total === 1 ? 'solicitação enviada' : 'solicitações enviadas'}
          </p>
        </div>
        {bloqueado ? (
          <Button size="lg" disabled title="Novas solicitações temporariamente indisponíveis">
            <Lock className="h-4 w-4" />
            Nova solicitação
          </Button>
        ) : (
          <Button asChild size="lg">
            <Link to="/solicitacoes/nova">
              <Plus className="h-4 w-4" />
              Nova solicitação
            </Link>
          </Button>
        )}
      </div>

      {bloqueado && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="text-[13px] font-semibold">
              Novas solicitações temporariamente indisponíveis
            </p>
            <p className="text-[12px] leading-relaxed">
              Você ainda pode acompanhar as solicitações já enviadas e baixar os
              arquivos. Para liberar novamente, fale com a equipe da LHG.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3">
        <div className="relative min-w-[220px] flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por motorista, placa, cliente ou número"
            className="pl-9"
          />
        </div>
        <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as StatusFiltro)}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_FILTRO_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODO_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {carregando && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[150px] rounded-lg" />
          ))}
        </div>
      )}

      {!carregando && filtradas.length === 0 && (
        <div className="rounded-lg border bg-background">
          <EmptyState
            icon={ClipboardList}
            title={temFiltro ? 'Nenhuma solicitação encontrada' : 'Você ainda não enviou solicitações'}
            description={
              temFiltro
                ? 'Ajuste os filtros para ver outras solicitações.'
                : 'Crie sua primeira solicitação de carregamento, ela vai direto para a equipe da LHG.'
            }
            action={
              !temFiltro && !bloqueado && (
                <Button asChild>
                  <Link to="/solicitacoes/nova">
                    <Plus className="h-4 w-4" />
                    Nova solicitação
                  </Link>
                </Button>
              )
            }
          />
        </div>
      )}

      {!carregando && filtradas.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtradas.map((v) => (
            <SolicitacaoCard
              key={v.sol.id}
              view={v}
              temPendencia={v.sol.id != null && pendenciaPorSolicitacao.has(v.sol.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SolicitacaoCard({ view, temPendencia }: { view: SolicitacaoView; temPendencia: boolean }) {
  const { sol, motorista, cavalo, carreta, cliente } = view
  const enviada = sol.created_at
    ? format(new Date(sol.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    : '—'

  return (
    <Link
      to={`/solicitacoes/${sol.id}`}
      className={cn(
        'relative flex flex-col gap-3 rounded-lg border bg-background p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        // Mesmo hover dos cards do interno: o card cresce por inteiro — texto,
        // borda e badges na mesma proporção — sem realce de borda ou de fundo.
        // O hover:z-10 o mantém por cima dos vizinhos enquanto está ampliado.
        'transition-transform duration-300 ease-out hover:z-10 hover:scale-[1.03]',
        temPendencia && 'border-red-400 ring-1 ring-red-200 dark:border-red-900/60 dark:ring-red-900/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[15px] font-semibold tabular-nums text-foreground">
          {sol.numero_interno != null ? formatNumeroOC(sol.numero_interno) : 'Solicitação'}
        </span>
        <StatusBadge status={sol.status} />
      </div>
      {temPendencia && (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800 dark:bg-red-950/60 dark:text-red-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <Undo2 className="h-3 w-3" />
          Pendência
        </span>
      )}
      <p className="text-[11px] text-muted-foreground">Enviada em {enviada}</p>
      <div className="space-y-1.5 text-[13px]">
        <div className="flex items-center gap-2">
          <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium text-foreground">{motorista}</span>
        </div>
        <p className="pl-[22px] text-[12px] text-muted-foreground">
          Cavalo {cavalo}
          {carreta && ` · Carreta ${carreta}`}
        </p>
        <div className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-foreground">{cliente}</span>
        </div>
      </div>
    </Link>
  )
}
