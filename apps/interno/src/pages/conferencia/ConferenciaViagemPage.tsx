import * as React from 'react'
import { Search as SearchIcon, Inbox, Download, Loader2, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight, ClipboardCheck, Eraser } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { useDebounce } from '@/hooks/useDebounce'
import {
  useSolicitacoesList,
  fetchSolicitacoesParaExport,
  type ListFilters,
  type SolicitacaoListRow,
} from '@/features/solicitacoes/useSolicitacoes'
import { buildCsv, downloadCsv, type CsvColumn } from '@/lib/csv'
import { formatNumeroOC } from '@/lib/utils'

// Placeholder usado nas células vazias (mesma convenção do resto do sistema).
const VAZIO = '—'

// A composição é conferida peça a peça: cavalo, 1ª carreta, dolly e última
// carreta. Cada posição tem coluna própria — quando a viagem não tem aquela
// peça (carreta simples, sem dolly), a célula fica com o traço.
function composicaoDaViagem(row: SolicitacaoListRow) {
  return {
    cavalo: row.veiculo?.placa ?? null,
    primeiraCarreta: row.primeira_carreta?.placa ?? null,
    dolly: row.dolly?.placa ?? null,
    ultimaCarreta: row.carreta?.placa ?? null,
  }
}

// Placa na tipografia padrão do sistema (Wanted Sans), só com números
// tabulares para as colunas alinharem entre si.
function Placa({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground/60">{VAZIO}</span>
  return <span className="font-medium tabular-nums tracking-[0.3px] text-foreground">{value}</span>
}

// Converte o yyyy-mm-dd do <input type="date"> em limites de dia no fuso local
// (mesma convenção do periodoToISO). Fim de dia é inclusivo.
function inicioDoDiaISO(d: string): string | null {
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return null
  return new Date(y, m - 1, day, 0, 0, 0, 0).toISOString()
}
function fimDoDiaISO(d: string): string | null {
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return null
  return new Date(y, m - 1, day, 23, 59, 59, 999).toISOString()
}

const PAGE_SIZE = 50

// Persiste os filtros da Conferência entre navegações (sair para outra página e
// voltar), como a lista de Solicitações faz. Por aba (sessionStorage).
const STORAGE_KEY = 'conferencia:filtros'

interface FiltrosPersistidos {
  search?: string
  dataDe?: string
  dataAte?: string
  page?: number
}

function carregarFiltros(): FiltrosPersistidos {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as FiltrosPersistidos) : {}
  } catch {
    return {}
  }
}

export function ConferenciaViagemPage() {
  // Lê o storage uma única vez (montagem) para semear o estado inicial.
  // `useState(fn)` e não `useRef(carregarFiltros())`: no useRef o argumento é
  // avaliado a CADA render (o valor é descartado depois da montagem), o que
  // fazia getItem+JSON.parse em toda renderização da página — e ler `.current`
  // durante o render viola a regra react-hooks/refs. O initializer preguiçoso
  // do useState roda só na montagem.
  const [inicial] = React.useState(carregarFiltros)
  const [search, setSearch] = React.useState(inicial.search ?? '')
  const [dataDe, setDataDe] = React.useState(inicial.dataDe ?? '')
  const [dataAte, setDataAte] = React.useState(inicial.dataAte ?? '')
  const [page, setPage] = React.useState(inicial.page ?? 1)
  const debouncedSearch = useDebounce(search, 300)

  const dataInicio = dataDe ? inicioDoDiaISO(dataDe) : null
  const dataFim = dataAte ? fimDoDiaISO(dataAte) : null

  // Volta para a 1ª página quando um filtro muda — mas NÃO na montagem, para não
  // sobrescrever a página restaurada do storage.
  const primeiraRenderizacao = React.useRef(true)
  React.useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false
      return
    }
    setPage(1)
  }, [debouncedSearch, dataInicio, dataFim])

  // Salva os filtros atuais a cada mudança.
  React.useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ search, dataDe, dataAte, page }))
    } catch {
      /* storage indisponível (ex.: modo privado) — ignora */
    }
  }, [search, dataDe, dataAte, page])

  const temFiltro = search.trim() !== '' || !!dataDe || !!dataAte
  const limparFiltros = () => { setSearch(''); setDataDe(''); setDataAte('') }

  const filtrosBase = {
    search: debouncedSearch,
    statuses: ['finalizada'] as ListFilters['statuses'],
    periodo: 'todos' as const,
    materialId: null,
    tipo: 'todos' as const,
    origem: 'todos' as const,
    pamcard: 'todos' as const,
    atendenteId: null,
    apenasAtrasadas: false,
    dataInicio,
    dataFim,
  }

  const list = useSolicitacoesList({ ...filtrosBase, page, pageSize: PAGE_SIZE })
  const total = list.data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rows = list.data?.data ?? []

  const [exporting, setExporting] = React.useState(false)
  const exportCsv = async () => {
    setExporting(true)
    try {
      const data = await fetchSolicitacoesParaExport(filtrosBase)
      if (data.length === 0) {
        toast.info('Nenhuma viagem finalizada para exportar.')
        return
      }
      const cols: CsvColumn<SolicitacaoListRow>[] = [
        { header: 'Número', accessor: (r) => formatNumeroOC(r.numero_interno) },
        { header: 'Data da solicitação', accessor: (r) => (r.created_at ? format(new Date(r.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '') },
        { header: 'Subcontratada', accessor: (r) => r.subcontratada?.razao_social },
        { header: 'Motorista', accessor: (r) => r.motorista?.nome_completo },
        { header: 'CPF', accessor: (r) => r.motorista?.cpf },
        { header: 'Cavalo', accessor: (r) => composicaoDaViagem(r).cavalo ?? '-' },
        { header: '1ª carreta', accessor: (r) => composicaoDaViagem(r).primeiraCarreta ?? '-' },
        { header: 'Dolly', accessor: (r) => composicaoDaViagem(r).dolly ?? '-' },
        { header: 'Última carreta', accessor: (r) => composicaoDaViagem(r).ultimaCarreta ?? '-' },
        { header: 'Cliente de destino', accessor: (r) => r.cliente?.razao_social },
        { header: 'Solicitante', accessor: (r) => r.solicitante_nome },
      ]
      const csv = buildCsv(data, cols)
      const ts = new Date()
      const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}_${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}`
      downloadCsv(`conferencia_viagem_${stamp}.csv`, csv)
      toast.success(`${data.length} ${data.length === 1 ? 'viagem exportada' : 'viagens exportadas'}`)
    } catch (err) {
      toast.error('Falha ao exportar. Tente novamente.')
      console.error('export conferencia error', err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Conferência de Viagem</h1>
          <p className="text-[12px] text-muted-foreground">
            {total} {total === 1 ? 'viagem finalizada' : 'viagens finalizadas'}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={exportCsv}
          disabled={exporting || list.isLoading}
          title="Exportar a conferência filtrada em CSV"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span className="hidden sm:inline">Exportar CSV</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="relative min-w-[220px] flex-1">
          <label className="mb-1 block text-[10px] uppercase tracking-[0.5px] text-muted-foreground">Buscar</label>
          <SearchIcon className="pointer-events-none absolute left-3 top-[30px] h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Número, motorista, CPF, placa ou cliente"
            className="pl-9"
          />
        </div>
        <div>
          <label htmlFor="conf-data-de" className="mb-1 block text-[10px] uppercase tracking-[0.5px] text-muted-foreground">De</label>
          <Input
            id="conf-data-de"
            type="date"
            value={dataDe}
            max={dataAte || undefined}
            onChange={(e) => setDataDe(e.target.value)}
            className="w-[160px]"
          />
        </div>
        <div>
          <label htmlFor="conf-data-ate" className="mb-1 block text-[10px] uppercase tracking-[0.5px] text-muted-foreground">Até</label>
          <Input
            id="conf-data-ate"
            type="date"
            value={dataAte}
            min={dataDe || undefined}
            onChange={(e) => setDataAte(e.target.value)}
            className="w-[160px]"
          />
        </div>
        {temFiltro && (
          <Button variant="ghost" size="sm" onClick={limparFiltros}>
            <Eraser className="h-3.5 w-3.5" />
            Limpar
          </Button>
        )}
      </div>

      {list.isLoading && (
        <div className="space-y-2 rounded-lg border bg-card p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      )}

      {!list.isLoading && list.isError && (
        <div className="rounded-lg border bg-card py-2">
          <EmptyState
            icon={AlertTriangle}
            title="Não foi possível carregar"
            description="Houve um erro ao buscar as viagens finalizadas. Verifique a conexão e tente novamente."
            action={
              <Button variant="outline" onClick={() => { void list.refetch() }}>
                <RefreshCw className="h-4 w-4" /> Tentar de novo
              </Button>
            }
          />
        </div>
      )}

      {!list.isLoading && !list.isError && rows.length === 0 && (
        <div className="rounded-lg border bg-card py-2">
          <EmptyState
            icon={temFiltro ? Inbox : ClipboardCheck}
            title={temFiltro ? 'Nada encontrado com esses filtros' : 'Nenhuma viagem finalizada ainda'}
            description={temFiltro ? 'Ajuste a busca ou o intervalo de datas.' : 'Assim que uma solicitação for finalizada, ela aparece aqui para conferência.'}
          />
        </div>
      )}

      {!list.isLoading && !list.isError && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          {/* Filete vertical entre todas as colunas (menos a última) — cada campo
              da conferência fica isolado na sua própria célula. */}
          <table className="w-full border-collapse text-[13px] [&_td]:border-r [&_td]:border-border [&_td:last-child]:border-r-0 [&_th]:border-r [&_th]:border-border [&_th:last-child]:border-r-0">
            <thead className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground">
              <tr className="border-b border-border bg-muted/60 text-left">
                <th className="px-3 py-2 font-medium">Número</th>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Subcontratada</th>
                <th className="px-3 py-2 font-medium">Motorista</th>
                <th className="px-3 py-2 font-medium">CPF</th>
                <th className="px-3 py-2 font-medium">Cavalo</th>
                <th className="px-3 py-2 font-medium">1ª carreta</th>
                <th className="px-3 py-2 font-medium">Dolly</th>
                <th className="px-3 py-2 font-medium">Última carreta</th>
                <th className="px-3 py-2 font-medium">Cliente de destino</th>
                <th className="px-3 py-2 font-medium">Solicitante</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const comp = composicaoDaViagem(row)
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border transition-colors last:border-b-0 even:bg-muted/20 hover:bg-accent/60"
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-primary-strong">{formatNumeroOC(row.numero_interno)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                      {row.created_at ? format(new Date(row.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : VAZIO}
                    </td>
                    <td
                      className="max-w-[260px] truncate px-3 py-2 text-foreground"
                      title={row.subcontratada?.razao_social ?? undefined}
                    >
                      {row.subcontratada?.razao_social ?? <span className="text-muted-foreground/60">{VAZIO}</span>}
                    </td>
                    <td className="px-3 py-2 text-foreground">{row.motorista?.nome_completo ?? VAZIO}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">{row.motorista?.cpf ?? VAZIO}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Placa value={comp.cavalo} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Placa value={comp.primeiraCarreta} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Placa value={comp.dolly} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Placa value={comp.ultimaCarreta} />
                    </td>
                    <td className="px-3 py-2 text-foreground">{row.cliente?.razao_social ?? VAZIO}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.solicitante_nome ?? VAZIO}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
          <span>Página {page} de {totalPages} · {total} viagens</span>
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

export default ConferenciaViagemPage
