import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search as SearchIcon, Inbox, Eraser, ChevronLeft, ChevronRight, X, CheckSquare, Square, Download, Trash2, Clock, Undo2, Reply, AlertTriangle, RefreshCw, LayoutGrid, List as ListIcon } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { Spinner } from '@/components/shared/Spinner'
import { PageHeader } from '@/components/layout/PageHeader'
import { fmtInt } from '@/lib/format'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { SolicitacaoStatusBadge } from '@/components/shared/SolicitacaoStatusBadge'
import { useDebounce } from '@/hooks/useDebounce'
import { useCascataInicial } from '@/hooks/useMovimento'
import { useAuth } from '@/hooks/useAuth'
import { canEditSolicitacoes, canUseBulkActions } from '@/features/auth/permissions'
import { useNovaSolicitacao } from '@/features/solicitacoes/NovaSolicitacaoProvider'
import { useLayoutPreferido } from '@/features/layout/useLayoutPreferido'
import { SolicitacoesGradeErp } from './SolicitacoesGradeErp'
import { useCrudOptions } from '@/features/crud/useCrudOptions'
import {
  useSolicitacoesList,
  useContagemFila,
  FILA_STATUSES,
  FILA_CHIPS,
  useBulkTransitStatus,
  useBulkDeleteSolicitacoes,
  fetchSolicitacoesParaExport,
  type ListFilters,
  type PeriodoFiltro,
  type PamcardFiltro,
  type SolicitacaoListRow,
} from '@/features/solicitacoes/useSolicitacoes'
import { buildCsv, downloadCsv, type CsvColumn } from '@/lib/csv'
import { STATUS_LABELS, getSlaInfo, type SlaInfo } from '@/features/solicitacoes/status'
import { usePendenciasSinais, type PendenciaSinal } from '@/features/solicitacoes/usePendencias'
import { formatNumeroOC } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { SolicitacaoStatus, SolicitacaoTipo, SolicitacaoOrigem, Tables } from '@/types/database.types'

type MaterialOpt = Pick<Tables<'materiais'>, 'id' | 'nome'>

// Filtros ficam na URL (fonte da verdade), mas os botões "Voltar"/breadcrumb do
// detalhe navegam para /solicitacoes "limpo". Guardamos a query em sessionStorage
// para restaurar os filtros ao voltar sem parâmetros na URL.
const FILTERS_STORAGE_KEY = 'solicitacoes:list-filters'

const VALID_PERIODOS: PeriodoFiltro[] = ['todos', 'hoje', '7d', 'mes']
const VALID_TIPOS: (SolicitacaoTipo | 'todos')[] = ['todos', 'carregamento', 'retorno']
const VALID_ORIGENS: (SolicitacaoOrigem | 'todos')[] = ['todos', 'interno', 'parceiro', 'email']
const VALID_PAMCARD: PamcardFiltro[] = ['todos', 'com_cartao', 'pendente']
const VALID_STATUSES: SolicitacaoStatus[] = [
  'recebida', 'em_cadastro', 'instrucao_emitida', 'oc_gerada', 'oc_enviada', 'finalizada', 'cancelada',
]

export function SolicitacoesListPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canEdit = canEditSolicitacoes(profile)
  const canBulk = canUseBulkActions(profile)
  const { open: onNova } = useNovaSolicitacao()
  const [params, setParams] = useSearchParams()

  const search = params.get('search') ?? ''
  const debouncedSearch = useDebounce(search, 300)
  const statuses = React.useMemo<SolicitacaoStatus[]>(() => {
    const raw = params.get('status')
    if (!raw) return []
    return raw.split(',').filter((s): s is SolicitacaoStatus => VALID_STATUSES.includes(s as SolicitacaoStatus))
  }, [params])
  const periodo = (() => {
    const raw = params.get('periodo')
    return VALID_PERIODOS.includes(raw as PeriodoFiltro) ? (raw as PeriodoFiltro) : 'todos'
  })()
  const materialId = params.get('material') || null
  const tipo = (() => {
    const raw = params.get('tipo')
    return VALID_TIPOS.includes(raw as SolicitacaoTipo | 'todos') ? (raw as SolicitacaoTipo | 'todos') : 'todos'
  })()
  const origem = (() => {
    const raw = params.get('origem')
    return VALID_ORIGENS.includes(raw as SolicitacaoOrigem | 'todos') ? (raw as SolicitacaoOrigem | 'todos') : 'todos'
  })()
  const pamcard = (() => {
    const raw = params.get('pamcard')
    return VALID_PAMCARD.includes(raw as PamcardFiltro) ? (raw as PamcardFiltro) : 'todos'
  })()
  const apenasAtrasadas = params.get('atrasadas') === '1'
  // Escopo: "Fila de trabalho" (padrão) mostra só o que ainda não terminou;
  // "Todas" é o histórico completo. As duas na mesma ordem de sempre, mais
  // recentes no topo (a equipe está acostumada a ela — Davi, 2026-10-16).
  // Busca e filtro por etapa encerrada (ex.: drill-down de "Finalizadas")
  // sempre olham o histórico inteiro: ninguém procura uma placa só na fila.
  const escopoTodas = params.get('ver') === 'todas'
  const buscando = debouncedSearch.trim() !== ''
  const pedeEncerradas = statuses.some((s) => !FILA_CHIPS.includes(s))
  const emFila = !escopoTodas && !buscando && !pedeEncerradas
  const statusesEfetivos = emFila && statuses.length === 0 ? FILA_STATUSES : statuses
  const view: 'grade' | 'lista' = params.get('view') === 'lista' ? 'lista' : 'grade'
  // Modo ERP (fase 2): grade densa + detalhe ao lado. A linha aberta no painel
  // fica na URL (?sel=) para sobreviver a recarregar e voltar do detalhe.
  const { modoErp } = useLayoutPreferido()
  const selecionada = params.get('sel')
  const page = Math.max(1, Number(params.get('page')) || 1)
  const pageSize = 30

  // true depois que o usuário mexe em algum filtro — distingue "limpou de fato"
  // (deve apagar o storage) do primeiro render antes da restauração.
  const interacted = React.useRef(false)

  const updateParams = React.useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      interacted.current = true
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          mutate(next)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  // Restaura os filtros salvos quando a página abre sem nenhum parâmetro na URL
  // (ex.: voltar do detalhe pelo botão "Voltar"). Só na montagem.
  React.useEffect(() => {
    const saved = sessionStorage.getItem(FILTERS_STORAGE_KEY)
    if (saved && !params.toString()) {
      setParams(new URLSearchParams(saved), { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persiste os filtros atuais. Não apaga no primeiro render (params vazio antes
  // da restauração); só remove quando o usuário zera os filtros de propósito.
  React.useEffect(() => {
    const qs = params.toString()
    if (qs) {
      sessionStorage.setItem(FILTERS_STORAGE_KEY, qs)
    } else if (interacted.current) {
      sessionStorage.removeItem(FILTERS_STORAGE_KEY)
    }
  }, [params])

  const setSearch = (v: string) =>
    updateParams((n) => {
      if (v) n.set('search', v); else n.delete('search')
      n.delete('page')
    })
  const setStatuses = (v: SolicitacaoStatus[]) =>
    updateParams((n) => {
      if (v.length > 0) n.set('status', v.join(',')); else n.delete('status')
      n.delete('page')
    })
  const setPeriodo = (v: PeriodoFiltro) =>
    updateParams((n) => {
      if (v !== 'todos') n.set('periodo', v); else n.delete('periodo')
      n.delete('page')
    })
  const setMaterialId = (v: string | null) =>
    updateParams((n) => {
      if (v) n.set('material', v); else n.delete('material')
      n.delete('page')
    })
  const setTipo = (v: SolicitacaoTipo | 'todos') =>
    updateParams((n) => {
      if (v !== 'todos') n.set('tipo', v); else n.delete('tipo')
      n.delete('page')
    })
  const setOrigem = (v: SolicitacaoOrigem | 'todos') =>
    updateParams((n) => {
      if (v !== 'todos') n.set('origem', v); else n.delete('origem')
      n.delete('page')
    })
  const setPamcard = (v: PamcardFiltro) =>
    updateParams((n) => {
      if (v !== 'todos') n.set('pamcard', v); else n.delete('pamcard')
      n.delete('page')
    })
  const setApenasAtrasadas = (v: boolean) =>
    updateParams((n) => {
      if (v) n.set('atrasadas', '1'); else n.delete('atrasadas')
      n.delete('page')
    })
  const setPage = (p: number) =>
    updateParams((n) => {
      if (p > 1) n.set('page', String(p)); else n.delete('page')
    })
  const setSelecionada = (id: string | null) =>
    updateParams((n) => {
      if (id) n.set('sel', id); else n.delete('sel')
    })
  const setEscopo = (todas: boolean) =>
    updateParams((n) => {
      if (todas) n.set('ver', 'todas'); else n.delete('ver')
      // A busca sempre olha o histórico inteiro: voltar à fila a encerra.
      if (!todas) n.delete('search')
      // Etapas encerradas não existem na fila: sair delas ao voltar para a fila.
      if (!todas) {
        const abertas = statuses.filter((st) => FILA_CHIPS.includes(st))
        if (abertas.length > 0) n.set('status', abertas.join(',')); else n.delete('status')
      }
      n.delete('page')
    })
  const setView = (v: 'grade' | 'lista') =>
    updateParams((n) => {
      if (v === 'lista') n.set('view', 'lista'); else n.delete('view')
    })

  const filters: ListFilters = {
    search: debouncedSearch,
    statuses: statusesEfetivos,
    periodo,
    materialId,
    tipo,
    origem,
    pamcard,
    atendenteId: null,
    apenasAtrasadas,
    page,
    pageSize,
  }

  const list = useSolicitacoesList(filters)
  // Só os filtros que valem para a contagem: busca, etapa e página ficam de
  // fora (senão cada página nova refaria a contagem).
  const contagemFila = useContagemFila({ periodo, materialId, tipo, origem, pamcard, apenasAtrasadas }, emFila)
  const pendenciaSinais = usePendenciasSinais()
  // Cascata só no 1º paint com dados; refetch/realtime/filtro não re-animam.
  const cascata = useCascataInicial(!list.isLoading && !list.isError && (list.data?.data.length ?? 0) > 0)
  const materiais = useCrudOptions<MaterialOpt>({
    table: 'materiais', selectColumns: 'id, nome', orderBy: 'nome',
  })
  const bulkTransit = useBulkTransitStatus()
  const bulkDelete = useBulkDeleteSolicitacoes()

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = React.useState<{ status: SolicitacaoStatus; label: string } | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false)

  const visibleIds = React.useMemo(
    () => (list.data?.data ?? []).map((r) => r.id),
    [list.data],
  )

  const [lastVisible, setLastVisible] = React.useState<string>('')
  const visibleKey = visibleIds.join(',')
  if (lastVisible !== visibleKey) {
    setLastVisible(visibleKey)
    if (selectedIds.size > 0) {
      const next = new Set<string>()
      for (const id of selectedIds) {
        if (visibleIds.includes(id)) next.add(id)
      }
      if (next.size !== selectedIds.size) setSelectedIds(next)
    }
  }

  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  const toggleId = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(visibleIds))
    }
  }

  const clearSelection = () => setSelectedIds(new Set())

  const [exporting, setExporting] = React.useState(false)

  const exportCsv = async () => {
    setExporting(true)
    try {
      // Passa o MESMO objeto que alimenta a lista (a exportação ignora
      // page/pageSize de propósito — o CSV leva tudo). Reescrever os filtros à
      // mão aqui já fez o arquivo ignorar "Atrasadas": a tela mostrava 12
      // registros e o CSV baixava todos. Reutilizando o objeto, todo filtro
      // novo entra na exportação sem ninguém precisar lembrar disso.
      const rows = await fetchSolicitacoesParaExport(filters)
      if (rows.length === 0) {
        toast.info('Nenhuma solicitação para exportar com os filtros atuais.')
        return
      }
      const cols: CsvColumn<SolicitacaoListRow>[] = [
        { header: 'Número', accessor: (r) => `#${String(r.numero_interno).padStart(4, '0')}` },
        { header: 'Status', accessor: (r) => r.status },
        { header: 'Tipo', accessor: (r) => r.tipo },
        { header: 'Solicitante', accessor: (r) => r.solicitante_nome },
        { header: 'Telefone solicitante', accessor: (r) => r.solicitante_telefone },
        { header: 'Motorista', accessor: (r) => r.motorista?.nome_completo },
        { header: 'CPF motorista', accessor: (r) => r.motorista?.cpf },
        { header: 'Cavalo', accessor: (r) => r.veiculo?.placa },
        { header: 'Carreta', accessor: (r) => r.carreta?.placa },
        { header: 'Subcontratada', accessor: (r) => r.subcontratada?.razao_social },
        { header: 'Cliente', accessor: (r) => r.cliente?.razao_social },
        { header: 'Cidade/UF', accessor: (r) => [r.cliente?.cidade, r.cliente?.uf].filter(Boolean).join('/') },
        { header: 'Material', accessor: (r) => r.material?.nome },
        { header: 'Subtipo', accessor: (r) => r.material_subtipo },
        { header: 'Local de carregamento', accessor: (r) => r.local_carregamento },
        { header: 'Validade início', accessor: (r) => r.validade_inicio },
        { header: 'Validade fim', accessor: (r) => r.validade_fim },
        { header: 'Nº instrução', accessor: (r) => r.numero_instrucao },
        { header: 'Observações', accessor: (r) => r.observacoes },
        { header: 'PDF', accessor: (r) => (r.pdf_url ? 'Sim' : '') },
        { header: 'Criada em', accessor: (r) => r.created_at },
        { header: 'Enviada em', accessor: (r) => r.enviada_em },
        { header: 'Finalizada em', accessor: (r) => r.finalizada_em },
      ]
      const csv = buildCsv(rows, cols)
      const ts = new Date()
      const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}_${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}`
      downloadCsv(`solicitacoes_${emFila ? 'fila_' : ''}${stamp}.csv`, csv)
      toast.success(
        `${rows.length} ${rows.length === 1 ? 'registro exportado' : 'registros exportados'}${emFila ? ' (só a fila de trabalho)' : ''}`,
      )
    } catch (err) {
      toast.error('Falha ao exportar. Tente novamente.')
      console.error('export csv error', err)
    } finally {
      setExporting(false)
    }
  }

  const runBulkTransit = async (status: SolicitacaoStatus) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    // Sem material não dá para saber se a OC exige instrução (Pedra, Milho e
    // Areia dispensam), e o banco recusa sair de "recebida" sem ele (0076).
    // Avisa quais são, em vez de deixar o lote falhar com erro de constraint.
    if (status === 'em_cadastro') {
      const semMaterial = (list.data?.data ?? []).filter(
        (r) => selectedIds.has(r.id) && !r.material_id,
      )
      if (semMaterial.length > 0) {
        toast.error(
          `Defina o material antes de marcar em emissão: ${semMaterial
            .map((r) => formatNumeroOC(r.numero_interno))
            .join(', ')}.`,
        )
        return
      }
    }
    const extra =
      status === 'finalizada'
        ? { finalizada_em: new Date().toISOString() }
        : status === 'oc_enviada'
        ? { enviada_em: new Date().toISOString() }
        : undefined
    await bulkTransit.mutateAsync({ ids, status, extra })
    clearSelection()
  }

  const runBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    await bulkDelete.mutateAsync({ ids })
    clearSelection()
  }

  const totalPages = Math.max(1, Math.ceil((list.data?.count ?? 0) / pageSize))
  const hasFilters =
    search.trim() !== '' || statuses.length > 0 || periodo !== 'todos' || !!materialId ||
    tipo !== 'todos' || origem !== 'todos' || pamcard !== 'todos' || apenasAtrasadas

  // UMA chamada só, de propósito. Antes eram oito setters em sequência
  // (setSearch(''), setStatuses([])…) e o botão simplesmente NÃO limpava nada:
  // o `setSearchParams` do React Router lê os params da última renderização, não
  // de uma fila de atualizações, então as oito chamadas do mesmo handler partiam
  // todas do MESMO estado e a última vencia — sobrando um "delete atrasadas"
  // sozinho. Ao mexer aqui, mantenha tudo dentro de um único updateParams.
  // `view` fica de fora: é preferência de exibição, não filtro.
  const clearFilters = () =>
    updateParams((n) => {
      for (const p of ['search', 'status', 'periodo', 'material', 'tipo', 'origem', 'pamcard', 'atrasadas', 'page']) {
        n.delete(p)
      }
    })

  const toggleStatus = (s: SolicitacaoStatus) => {
    setStatuses(statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s])
  }

  return (
    <div className="space-y-4">
      <PageHeader
        className="mb-0"
        title="Solicitações"
        description={`${fmtInt(list.data?.count ?? 0)} ${list.data?.count === 1 ? 'registro' : 'registros'}`}
        actions={
        <>
          {!modoErp && (
          <div className="flex items-center rounded-md border p-0.5" role="group" aria-label="Modo de exibição">
            <button
              type="button"
              onClick={() => setView('grade')}
              aria-pressed={view === 'grade'}
              title="Ver em grade"
              className={cn(
                'inline-flex items-center justify-center rounded p-1.5 transition-colors',
                view === 'grade' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView('lista')}
              aria-pressed={view === 'lista'}
              title="Ver em lista"
              className={cn(
                'inline-flex items-center justify-center rounded p-1.5 transition-colors',
                view === 'lista' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <ListIcon className="h-4 w-4" />
            </button>
          </div>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={exportCsv}
            disabled={exporting || list.isLoading}
            title="Exportar resultados filtrados em CSV"
          >
            {exporting ? <Spinner /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">Exportar CSV</span>
          </Button>
          {canEdit && (
            <Button onClick={onNova} title="Ctrl+N">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nova solicitação</span>
              <span className="sm:hidden">Nova</span>
              <kbd className="ml-1 hidden text-meta text-primary-foreground/70 md:inline">Ctrl+N</kbd>
            </Button>
          )}
        </>
        }
      />

      <div className="space-y-3 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]" data-page-search>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por número, solicitante, motorista ou placa"
              className="pl-9"
            />
          </div>
          <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="carregamento">Carregamento</SelectItem>
              <SelectItem value="retorno">Retorno</SelectItem>
            </SelectContent>
          </Select>
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoFiltro)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todo período</SelectItem>
              <SelectItem value="hoje">Hoje</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="mes">Mês atual</SelectItem>
            </SelectContent>
          </Select>
          <Select value={materialId ?? 'todos'} onValueChange={(v) => setMaterialId(v === 'todos' ? null : v)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os materiais</SelectItem>
              {(materiais.data ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={origem} onValueChange={(v) => setOrigem(v as typeof origem)}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as origens</SelectItem>
              <SelectItem value="interno">Internas</SelectItem>
              <SelectItem value="parceiro">Parceiros</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
            </SelectContent>
          </Select>
          <Select value={pamcard} onValueChange={(v) => setPamcard(v as PamcardFiltro)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Pamcard: todos</SelectItem>
              <SelectItem value="com_cartao">Com cartão</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <Eraser className="h-3.5 w-3.5" />
              Limpar
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="mr-1 flex items-center gap-0.5 rounded-surface border bg-card p-0.5" role="group" aria-label="Escopo da lista">
            {[
              { todas: false, label: 'Fila de trabalho', qtd: emFila ? contagemFila.data?.total : undefined },
              { todas: true, label: 'Todas', qtd: undefined },
            ].map((o) => {
              const ativo = o.todas ? !emFila : emFila
              return (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => setEscopo(o.todas)}
                  aria-pressed={ativo}
                  className={cn(
                    'rounded-control px-2.5 py-1 text-body-sm font-medium transition-colors duration-fast',
                    ativo ? 'bg-primary/[0.08] text-primary-strong' : 'text-muted-foreground hover:bg-row-hover hover:text-foreground',
                  )}
                >
                  {o.label}
                  {o.qtd != null && (
                    <span className="ml-1.5 tabular-nums">
                      {fmtInt(o.qtd)}
                      {contagemFila.data?.truncado ? '+' : ''}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setApenasAtrasadas(!apenasAtrasadas)}
            aria-pressed={apenasAtrasadas}
            className={cn(
              'inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-meta transition-colors duration-fast',
              apenasAtrasadas
                ? 'border-danger-border bg-danger-subtle font-semibold text-danger'
                : 'border-border bg-card text-danger hover:bg-row-hover',
            )}
            title="Pendentes há mais de 8 h"
          >
            <Clock className="h-3 w-3" />
            Atrasadas
          </button>
          {(emFila ? FILA_CHIPS : VALID_STATUSES).map((s) => {
            const active = statuses.includes(s)
            const qtd = emFila ? contagemFila.data?.porEtapa[s] : undefined
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                aria-pressed={active}
                className={cn(
                  'rounded-[2px] border px-2 py-0.5 text-meta transition-colors duration-fast',
                  active
                    ? `status-${s} border-transparent font-semibold`
                    : 'border-border bg-card text-muted-foreground hover:bg-row-hover',
                )}
              >
                {STATUS_LABELS[s]}
                {qtd != null && (
                  <span className={cn('ml-1 tabular-nums', qtd === 0 && !active && 'text-tertiary')}>{fmtInt(qtd)}</span>
                )}
              </button>
            )
          })}
          {!escopoTodas && buscando && (
            <span className="ml-1 text-meta text-muted-foreground">Buscando em todas, inclusive finalizadas</span>
          )}
        </div>
      </div>

      {list.isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-4">
              <Skeleton className="h-5 w-1/2 mb-3" />
              <Skeleton className="h-3 w-3/4 mb-2" />
              <Skeleton className="h-3 w-2/3 mb-2" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {!list.isLoading && list.isError && (
        <div className="rounded-lg border bg-card py-2">
          <EmptyState
            icon={AlertTriangle}
            title="Não foi possível carregar"
            description="Houve um erro ao buscar as solicitações. Verifique a conexão e tente novamente."
            action={
              <Button variant="outline" onClick={() => { void list.refetch() }}>
                <RefreshCw className="h-4 w-4" /> Tentar novamente
              </Button>
            }
          />
        </div>
      )}

      {!list.isLoading && !list.isError && (list.data?.data.length ?? 0) === 0 && (
        <div className="rounded-lg border bg-card py-2">
          <EmptyState
            icon={Inbox}
            title={hasFilters ? 'Nada encontrado com esses filtros' : emFila ? 'Fila vazia' : 'Nenhuma solicitação registrada'}
            description={
              hasFilters
                ? 'Ajuste ou limpe os filtros.'
                : emFila
                  ? 'Nada aguardando a equipe agora. O histórico fica em "Todas".'
                  : 'Crie a primeira solicitação para começar.'
            }
            action={
              hasFilters ? (
                <Button variant="outline" onClick={clearFilters}>Limpar filtros</Button>
              ) : (
                <Button onClick={onNova}>
                  <Plus className="h-4 w-4" /> Nova solicitação
                </Button>
              )
            }
          />
        </div>
      )}

      {!list.isLoading && !list.isError && (list.data?.data.length ?? 0) > 0 && (
        <>
          {canBulk && (
            <div className="flex flex-wrap items-center gap-2">
              {/* No modo ERP o checkbox do cabeçalho da grade faz este papel. */}
              {!modoErp && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={toggleAll}
                className="text-muted-foreground"
              >
                {allVisibleSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                {allVisibleSelected ? 'Desmarcar página' : 'Selecionar página'}
              </Button>
              )}
              {selectedIds.size > 0 && (
                <span className="text-body-sm text-muted-foreground">
                  {selectedIds.size} {selectedIds.size === 1 ? 'selecionada' : 'selecionadas'}
                </span>
              )}
            </div>
          )}

          {canBulk && selectedIds.size > 0 && (
            <BulkActionsBar
              count={selectedIds.size}
              isPending={bulkTransit.isPending || bulkDelete.isPending}
              onClear={clearSelection}
              onAdvanceEmCadastro={() => runBulkTransit('em_cadastro')}
              onMarkEnviada={() => runBulkTransit('oc_enviada')}
              onMarkFinalizada={() => runBulkTransit('finalizada')}
              onCancelarRequest={() =>
                setBulkConfirm({ status: 'cancelada', label: 'Cancelar' })
              }
              onDeleteRequest={() => setDeleteConfirmOpen(true)}
            />
          )}

          {modoErp ? (
            <SolicitacoesGradeErp
              rows={list.data!.data}
              selecionada={selecionada}
              onSelecionar={setSelecionada}
              onAbrir={(id) => navigate(`/solicitacoes/${id}`)}
              selectable={canBulk}
              selectedIds={selectedIds}
              onToggleSelect={toggleId}
              onToggleAll={toggleAll}
              allVisibleSelected={allVisibleSelected}
            />
          ) : view === 'grade' ? (
            <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3', cascata && 'cascata')}>
              {list.data!.data.map((row) => (
                <SolicitacaoCard
                  key={row.id}
                  row={row}
                  sinalPendencia={pendenciaSinais.data?.get(row.id) ?? null}
                  selectable={canBulk}
                  selected={selectedIds.has(row.id)}
                  onToggleSelect={() => toggleId(row.id)}
                  onOpen={() => navigate(`/solicitacoes/${row.id}`)}
                />
              ))}
            </div>
          ) : (
            <div className={cn('divide-y rounded-lg border bg-card', cascata && 'cascata')}>
              {list.data!.data.map((row) => (
                <SolicitacaoListaRow
                  key={row.id}
                  row={row}
                  sinalPendencia={pendenciaSinais.data?.get(row.id) ?? null}
                  selectable={canBulk}
                  selected={selectedIds.has(row.id)}
                  onToggleSelect={() => toggleId(row.id)}
                  onOpen={() => navigate(`/solicitacoes/${row.id}`)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!bulkConfirm}
        onOpenChange={(o) => !o && setBulkConfirm(null)}
        title={`${bulkConfirm?.label} ${selectedIds.size} ${selectedIds.size === 1 ? 'solicitação' : 'solicitações'}?`}
        description="A ação vale para todos os registros selecionados. Para refazer, duplique a solicitação depois."
        confirmLabel={bulkConfirm ? `${bulkConfirm.label} solicitações` : undefined}
        destructive
        onConfirm={async () => {
          if (bulkConfirm) {
            await runBulkTransit(bulkConfirm.status)
            setBulkConfirm(null)
          }
        }}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`Excluir ${selectedIds.size} ${selectedIds.size === 1 ? 'solicitação' : 'solicitações'}?`}
        description="Esta ação é irreversível. Os registros selecionados e seus dados associados serão removidos permanentemente."
        confirmLabel="Excluir"
        destructive
        onConfirm={async () => {
          await runBulkDelete()
          setDeleteConfirmOpen(false)
        }}
      />

      {(list.data?.count ?? 0) > pageSize && (
        <div className="flex items-center justify-between text-body-sm text-muted-foreground">
          <span>Página {page} de {totalPages} · {fmtInt(list.data?.count ?? 0)} registros</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
              Próxima <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

interface CardProps {
  row: SolicitacaoListRow
  sinalPendencia: PendenciaSinal | null
  selectable: boolean
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
}

function SolicitacaoCard({ row, sinalPendencia, selectable, selected, onToggleSelect, onOpen }: CardProps) {
  const created = row.created_at ? new Date(row.created_at) : null
  const sla = getSlaInfo(row.status, row.created_at)
  const ativa = row.status !== 'finalizada' && row.status !== 'cancelada'
  const sinal = ativa ? sinalPendencia : null
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      aria-label={`Abrir ${formatNumeroOC(row.numero_interno)}`}
      className={cn(
        'relative cursor-pointer overflow-hidden rounded-lg border bg-card p-4 pl-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        // Hover = elevação sutil (decisão de 2026-10-15): sobe 2px + realce de
        // borda e fundo; sem ampliar, sem glow. Vale com "reduzir movimento".
        'transition-[transform,background-color,border-color] duration-fast ease-out hover:-translate-y-0.5 hover:border-input hover:bg-row-hover',
        `card-status card-status-${row.status}`,
        selectable && selected && 'border-primary bg-primary/[0.08] hover:border-primary hover:bg-primary/[0.08]',
        !selected && sinal === 'parceiro_respondeu' && 'border-success hover:border-success',
        !selected && sinal === 'aguardando_parceiro' && 'border-danger hover:border-danger',
        !selected && !sinal && sla?.severity === 'alert' && 'border-danger-border',
        !selected && !sinal && sla?.severity === 'warning' && 'border-warning-border',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {selectable && (
          <span onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selected}
              onCheckedChange={onToggleSelect}
              aria-label={`Selecionar ${formatNumeroOC(row.numero_interno)}`}
            />
          </span>
          )}
          <span className="shrink-0 text-body-lg font-medium text-primary-strong">{formatNumeroOC(row.numero_interno)}</span>
          {sinal && <PendenciaPop sinal={sinal} />}
          {row.origem === 'parceiro'
            && row.pamcard_status === 'nao_tem_cartao'
            && !row.pamcard_providenciado_em && (
            <span
              className="shrink-0 rounded-[2px] bg-warning-subtle px-1.5 py-0.5 text-meta font-medium text-warning"
              title="Cartão Pamcard ainda não providenciado"
            >
              Cartão pendente
            </span>
          )}
          {row.origem === 'email' && (
            <span className="shrink-0 rounded-[2px] bg-muted px-1.5 py-0.5 text-meta font-medium text-muted-foreground">
              via e-mail
            </span>
          )}
          {row.origem === 'parceiro' && (
            <span
              className="max-w-[150px] shrink-0 truncate rounded-[2px] cat-partner px-1.5 py-0.5 text-meta font-medium"
              title={`Solicitação criada pelo parceiro ${row.parceiro?.razao_social ?? ''}`}
            >
              via {row.parceiro?.razao_social ?? 'parceiro'}
            </span>
          )}
          {row.solicitante_nome && (
            <span className="truncate text-body text-muted-foreground" title={row.solicitante_nome}>
              · Solicitante: <span className="text-foreground">{row.solicitante_nome}</span>
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {sla && <SlaBadge sla={sla} />}
          <SolicitacaoStatusBadge status={row.status} />
        </div>
      </div>
      <div className="mt-3 border-t pt-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-body">
          <Field
            label="Motorista"
            value={row.motorista?.nome_completo}
            extra={row.motorista?.cpf}
          />
          <Field
            label="Veículo"
            value={[row.veiculo?.placa, row.carreta?.placa].filter(Boolean).join(' / ') || null}
          />
          <Field label="Cliente" value={row.cliente?.razao_social} />
          {row.origem === 'parceiro' && !row.material_id ? (
            <div>
              <dt className="text-meta text-muted-foreground">Material</dt>
              <dd className="font-medium text-warning">Material a definir</dd>
            </div>
          ) : (
            <Field label="Material" value={row.material?.nome} />
          )}
        </dl>
      </div>
      <div className="mt-3 flex items-center justify-between border-t pt-3 text-meta text-muted-foreground">
        <span>
          {created ? format(created, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—'}
          {row.numero_instrucao ? ` · Instr. ${row.numero_instrucao}` : ''}
        </span>
        <span className="inline-flex items-center gap-0.5 text-body-sm font-medium text-primary-strong">
          Abrir <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  )
}

// Linha compacta da visualização em lista — mesma informação essencial dos
// cards, numa densidade maior e sem estouro lateral em telas pequenas.
function SolicitacaoListaRow({ row, sinalPendencia, selectable, selected, onToggleSelect, onOpen }: CardProps) {
  const created = row.created_at ? new Date(row.created_at) : null
  const sla = getSlaInfo(row.status, row.created_at)
  const ativa = row.status !== 'finalizada' && row.status !== 'cancelada'
  const sinal = ativa ? sinalPendencia : null
  const motorista = row.motorista?.nome_completo
  const cliente = row.cliente?.razao_social
  const resumo = [row.solicitante_nome, motorista, cliente].filter(Boolean).join(' · ')
  return (
    <div
      className={cn(
        // Linha de lista: sob o ponteiro só o fundo muda (row-hover).
        'relative flex items-center gap-3 px-3 py-2.5 transition-colors duration-fast hover:bg-row-hover',
        selectable && selected && 'bg-primary/[0.08] shadow-[inset_2px_0_0_hsl(var(--primary))] hover:bg-primary/[0.08]',
      )}
    >
      {selectable && (
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          aria-label={`Selecionar ${formatNumeroOC(row.numero_interno)}`}
        />
      )}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="shrink-0 text-body font-medium text-primary-strong">{formatNumeroOC(row.numero_interno)}</span>
        {sinal && <PendenciaPop sinal={sinal} />}
        {row.origem === 'parceiro'
          && row.pamcard_status === 'nao_tem_cartao'
          && !row.pamcard_providenciado_em && (
          <span className="hidden shrink-0 rounded-[2px] bg-warning-subtle px-1.5 py-0.5 text-meta font-medium text-warning sm:inline">
            Cartão pendente
          </span>
        )}
        <span className="truncate text-body text-muted-foreground">{resumo || '—'}</span>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden text-meta text-muted-foreground md:inline">
          {created ? format(created, 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—'}
        </span>
        {sla && <SlaBadge sla={sla} />}
        <SolicitacaoStatusBadge status={row.status} />
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  )
}

interface BulkActionsBarProps {
  count: number
  isPending: boolean
  onClear: () => void
  onAdvanceEmCadastro: () => void
  onMarkEnviada: () => void
  onMarkFinalizada: () => void
  onCancelarRequest: () => void
  onDeleteRequest: () => void
}

function BulkActionsBar({
  count,
  isPending,
  onClear,
  onAdvanceEmCadastro,
  onMarkEnviada,
  onMarkFinalizada,
  onCancelarRequest,
  onDeleteRequest,
}: BulkActionsBarProps) {
  return (
    <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-popover px-3 py-2 shadow-overlay">
      <span className="text-body font-medium text-foreground">
        {count} {count === 1 ? 'selecionada' : 'selecionadas'}
      </span>
      <span className="mx-1 h-4 w-px bg-border" />
      <Button size="sm" variant="outline" disabled={isPending} onClick={onAdvanceEmCadastro}>
        Marcar em emissão
      </Button>
      <Button size="sm" variant="outline" disabled={isPending} onClick={onMarkEnviada}>
        Marcar enviada
      </Button>
      <Button size="sm" variant="outline" disabled={isPending} onClick={onMarkFinalizada}>
        Finalizar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={onCancelarRequest}
        className="text-destructive hover:text-destructive"
      >
        <X className="h-4 w-4" />
        Cancelar solicitações
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={onDeleteRequest}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
        Excluir
      </Button>
      <span className="ml-auto" />
      <Button size="sm" variant="ghost" disabled={isPending} onClick={onClear}>
        Limpar seleção
      </Button>
    </div>
  )
}

// "Pop" persistente de pendência no card — visível a qualquer um que olhe a
// lista (não é o sino, que cada usuário apaga). Ambos os sinais pulsam (mesmo
// padrão do portal, para não haver assimetria); a cor distingue o estado:
// verde 'parceiro_respondeu' (acionável) e vermelho 'aguardando_parceiro'.
function PendenciaPop({ sinal }: { sinal: PendenciaSinal }) {
  if (sinal === 'parceiro_respondeu') {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-[2px] bg-success-subtle px-1.5 py-0.5 text-meta font-semibold text-success"
        title="O parceiro respondeu a pendência e ainda não foi tratada"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
        <Reply className="h-3 w-3" />
        Respondido
      </span>
    )
  }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-[2px] bg-danger-subtle px-1.5 py-0.5 text-meta font-semibold text-danger"
      title="Pendência aberta nesta solicitação"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
      </span>
      <Undo2 className="h-3 w-3" />
      Aguardando parceiro
    </span>
  )
}

function SlaBadge({ sla }: { sla: SlaInfo }) {
  const cls =
    sla.severity === 'alert'
      ? 'bg-danger-subtle text-danger'
      : 'bg-warning-subtle text-warning'
  const titulo = sla.severity === 'alert' ? 'Atrasada' : 'Atenção'
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 text-meta font-medium tabular-nums', cls)}
      title={`${titulo}, pendente ${sla.label}`}
    >
      <Clock className="h-3 w-3" />
      {sla.label}
    </span>
  )
}

function Field({
  label,
  value,
  extra,
}: {
  label: string
  value: string | null | undefined
  extra?: string | null | undefined
}) {
  return (
    <div>
      <dt className="text-meta text-muted-foreground">{label}</dt>
      <dd className="text-foreground">
        {value ?? '—'}
        {value && extra ? (
          <span className="text-muted-foreground"> · {extra}</span>
        ) : null}
      </dd>
    </div>
  )
}
