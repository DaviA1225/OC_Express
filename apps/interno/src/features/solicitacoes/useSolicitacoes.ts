import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { traduzirErroBanco } from '@/features/crud/useCrudQueries'
import { SLA_ALERT_HOURS, SLA_PENDING_STATUSES } from '@/features/solicitacoes/status'
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
  SolicitacaoStatus,
  SolicitacaoTipo,
  SolicitacaoOrigem,
} from '@/types/database.types'

type Solicitacao = Tables<'solicitacoes'>

export interface SolicitacaoListRow extends Solicitacao {
  motorista: { nome_completo: string; cpf: string | null; telefone: string | null } | null
  veiculo: { placa: string; subcontratada_id: string | null } | null
  carreta: { placa: string } | null
  subcontratada: { razao_social: string } | null
  cliente: { razao_social: string; cidade: string | null; uf: string | null } | null
  material: { nome: string; origem_padrao: string | null; observacoes_padrao: string | null; requer_instrucao: boolean } | null
  parceiro: { razao_social: string; contato_principal_telefone: string | null; contato_principal_email: string | null } | null
  // Joins das bases do parceiro (preenchidos quando origem = 'parceiro').
  // O `normalizeParceiroJoins` copia esses dados para os campos internos
  // acima, para que cards/WhatsApp leiam de um lugar só.
  parceiro_motorista: { nome_completo: string; cpf: string; telefone: string | null } | null
  parceiro_veiculo: { placa: string } | null
  parceiro_carreta: { placa: string } | null
  parceiro_subcontratada: { razao_social: string } | null
  parceiro_usuario: { nome_completo: string; email: string } | null
}

const SELECT_WITH_JOINS = `
  *,
  motorista:motorista_id ( nome_completo, cpf, telefone ),
  veiculo:veiculo_id ( placa, subcontratada_id ),
  carreta:carreta_id ( placa ),
  subcontratada:subcontratada_id ( razao_social ),
  cliente:cliente_id ( razao_social, cidade, uf ),
  material:material_id ( nome, origem_padrao, observacoes_padrao, requer_instrucao ),
  parceiro:parceiro_id ( razao_social, contato_principal_telefone, contato_principal_email ),
  parceiro_motorista:parceiro_motorista_id ( nome_completo, cpf, telefone ),
  parceiro_veiculo:parceiro_veiculo_id ( placa ),
  parceiro_carreta:parceiro_carreta_id ( placa ),
  parceiro_subcontratada:parceiro_subcontratada_id ( razao_social ),
  parceiro_usuario:parceiro_usuario_id ( nome_completo, email )
`

/**
 * Quando a solicitação vem do Portal de Parceiros, os IDs internos
 * (`motorista_id`, `veiculo_id`, `carreta_id`, `subcontratada_id`) sao NULL —
 * os dados vivem nas tabelas `parceiro_*`. Esta funcao copia os joins do
 * parceiro para os campos internos correspondentes, e usa o `parceiro_usuario`
 * como fallback de solicitante. Se a equipe interna substituir um campo (ex.
 * trocar o motorista por um interno), o valor explicito vence.
 */
function normalizeParceiroJoins(row: SolicitacaoListRow): SolicitacaoListRow {
  if (row.origem !== 'parceiro') return row
  if (!row.motorista && row.parceiro_motorista) {
    row.motorista = {
      nome_completo: row.parceiro_motorista.nome_completo,
      cpf: row.parceiro_motorista.cpf,
      telefone: row.parceiro_motorista.telefone,
    }
  }
  if (!row.veiculo && row.parceiro_veiculo) {
    row.veiculo = { placa: row.parceiro_veiculo.placa, subcontratada_id: null }
  }
  if (!row.carreta && row.parceiro_carreta) {
    row.carreta = { placa: row.parceiro_carreta.placa }
  }
  if (!row.subcontratada && row.parceiro_subcontratada) {
    row.subcontratada = { razao_social: row.parceiro_subcontratada.razao_social }
  }
  if (!row.solicitante_nome && row.parceiro_usuario) {
    row.solicitante_nome = row.parceiro_usuario.nome_completo
  }
  if (!row.solicitante_telefone && row.parceiro?.contato_principal_telefone) {
    row.solicitante_telefone = row.parceiro.contato_principal_telefone
  }
  return row
}

export type PeriodoFiltro = 'todos' | 'hoje' | '7d' | 'mes'

/** Filtro de Pamcard: todos, só com cartão, ou pendentes de providência. */
export type PamcardFiltro = 'todos' | 'com_cartao' | 'pendente'

export interface ListFilters {
  search: string
  statuses: SolicitacaoStatus[]
  periodo: PeriodoFiltro
  materialId: string | null
  tipo: SolicitacaoTipo | 'todos'
  origem: SolicitacaoOrigem | 'todos'
  pamcard: PamcardFiltro
  atendenteId: string | null
  apenasAtrasadas?: boolean
  page: number
  pageSize: number
}

/** Coleta IDs auxiliares para a busca de solicitações em colunas relacionadas.
 *  A busca textual pelo placeholder cobre solicitante e número (na própria
 *  tabela), e também motorista (nome) e veículo/carreta (placa), que vivem em
 *  tabelas separadas. PostgREST não permite ilike em embed pela cláusula `or`
 *  da tabela principal, então pré-buscamos os IDs e usamos `in.(...)` no `or`.
 *  Limite por base evita estouro de URL — termos muito genéricos podem perder
 *  matches, mas são raros em ambiente real (~5 parceiros, dezenas de
 *  motoristas/veículos internos). */
const SEARCH_AUX_LIMIT = 200

interface SearchAuxIds {
  motoristaIds: string[]
  parceiroMotoristaIds: string[]
  veiculoIds: string[]
  parceiroVeiculoIds: string[]
  carretaIds: string[]
  parceiroCarretaIds: string[]
}

async function fetchSearchAuxIds(term: string): Promise<SearchAuxIds> {
  const like = `%${term.replace(/[%_]/g, '\\$&')}%`
  const [mot, parcMot, veic, parcVeic, carr, parcCarr] = await Promise.all([
    supabase.from('motoristas').select('id').ilike('nome_completo', like).limit(SEARCH_AUX_LIMIT),
    supabase.from('parceiro_motoristas').select('id').ilike('nome_completo', like).limit(SEARCH_AUX_LIMIT),
    supabase.from('veiculos').select('id').ilike('placa', like).limit(SEARCH_AUX_LIMIT),
    supabase.from('parceiro_veiculos').select('id').ilike('placa', like).limit(SEARCH_AUX_LIMIT),
    supabase.from('carretas').select('id').ilike('placa', like).limit(SEARCH_AUX_LIMIT),
    supabase.from('parceiro_carretas').select('id').ilike('placa', like).limit(SEARCH_AUX_LIMIT),
  ])
  const ids = (r: { data: { id: string }[] | null }) => (r.data ?? []).map((row) => row.id)
  return {
    motoristaIds: ids(mot),
    parceiroMotoristaIds: ids(parcMot),
    veiculoIds: ids(veic),
    parceiroVeiculoIds: ids(parcVeic),
    carretaIds: ids(carr),
    parceiroCarretaIds: ids(parcCarr),
  }
}

function buildSearchOrClause(termRaw: string, aux: SearchAuxIds): string {
  const t = termRaw.replace(/[%_]/g, '\\$&')
  const parts: string[] = [`solicitante_nome.ilike.%${t}%`]
  const asNumber = Number(t.replace(/\D/g, ''))
  if (Number.isFinite(asNumber) && asNumber > 0) {
    parts.push(`numero_interno.eq.${asNumber}`)
  }
  const inList = (col: string, list: string[]) => {
    if (list.length > 0) parts.push(`${col}.in.(${list.join(',')})`)
  }
  inList('motorista_id', aux.motoristaIds)
  inList('parceiro_motorista_id', aux.parceiroMotoristaIds)
  inList('veiculo_id', aux.veiculoIds)
  inList('parceiro_veiculo_id', aux.parceiroVeiculoIds)
  inList('carreta_id', aux.carretaIds)
  inList('parceiro_carreta_id', aux.parceiroCarretaIds)
  return parts.join(',')
}

/** Aplica os filtros de origem e Pamcard a uma query de solicitações.
 *  Pamcard só faz sentido para solicitações do portal — no fluxo interno o
 *  cartão é gerenciado fora da solicitação. Por isso:
 *    - se origem='todos' e pamcard != 'todos', restringimos a origem='parceiro';
 *    - se origem='interno'/'email', as opções Pamcard são ignoradas (não
 *      fariam sentido e produziriam combinação contraditória).
 */
function applyOrigemPamcardFilters<T>(
  query: T,
  filters: Pick<ListFilters, 'origem' | 'pamcard'>,
): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any
  if (filters.origem !== 'todos') q = q.eq('origem', filters.origem)
  const pamcardAplica =
    filters.pamcard !== 'todos' &&
    (filters.origem === 'todos' || filters.origem === 'parceiro')
  if (pamcardAplica) {
    if (filters.origem === 'todos') q = q.eq('origem', 'parceiro')
    if (filters.pamcard === 'com_cartao') q = q.eq('pamcard_status', 'tem_cartao')
    if (filters.pamcard === 'pendente') {
      q = q.eq('pamcard_status', 'nao_tem_cartao').is('pamcard_providenciado_em', null)
    }
  }
  return q as T
}

function slaThresholdISO(): string {
  return new Date(Date.now() - SLA_ALERT_HOURS * 3_600_000).toISOString()
}

function periodoToISO(periodo: PeriodoFiltro): string | null {
  const now = new Date()
  if (periodo === 'hoje') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return start.toISOString()
  }
  if (periodo === '7d') {
    const d = new Date(now)
    d.setDate(d.getDate() - 7)
    return d.toISOString()
  }
  if (periodo === 'mes') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return start.toISOString()
  }
  return null
}

/**
 * Carrega TODAS as solicitações que casam com os filtros (ignora paginação).
 * Usado na exportação para CSV. Limite de 10k para evitar abusos.
 */
export async function fetchSolicitacoesParaExport(
  filters: Omit<ListFilters, 'page' | 'pageSize'>,
): Promise<SolicitacaoListRow[]> {
  let query = supabase.from('solicitacoes').select(SELECT_WITH_JOINS)
  if (filters.statuses.length > 0) query = query.in('status', filters.statuses)
  if (filters.materialId) query = query.eq('material_id', filters.materialId)
  if (filters.atendenteId) query = query.eq('atendente_id', filters.atendenteId)
  if (filters.tipo !== 'todos') query = query.eq('tipo', filters.tipo)
  query = applyOrigemPamcardFilters(query, filters)
  if (filters.apenasAtrasadas) {
    query = query
      .in('status', SLA_PENDING_STATUSES)
      .lt('created_at', slaThresholdISO())
  }
  const since = periodoToISO(filters.periodo)
  if (since) query = query.gte('created_at', since)

  if (filters.search.trim()) {
    const t = filters.search.trim()
    const aux = await fetchSearchAuxIds(t)
    query = query.or(buildSearchOrClause(t, aux))
  }

  query = query.order('created_at', { ascending: false }).range(0, 9999)
  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as unknown as SolicitacaoListRow[]).map(normalizeParceiroJoins)
}

export function useSolicitacoesList(filters: ListFilters) {
  return useQuery({
    queryKey: ['solicitacoes', filters],
    queryFn: async () => {
      let query = supabase
        .from('solicitacoes')
        .select(SELECT_WITH_JOINS, { count: 'exact' })

      if (filters.statuses.length > 0) {
        query = query.in('status', filters.statuses)
      }
      if (filters.materialId) {
        query = query.eq('material_id', filters.materialId)
      }
      if (filters.atendenteId) {
        query = query.eq('atendente_id', filters.atendenteId)
      }
      if (filters.tipo !== 'todos') {
        query = query.eq('tipo', filters.tipo)
      }
      query = applyOrigemPamcardFilters(query, filters)
      if (filters.apenasAtrasadas) {
        query = query
          .in('status', SLA_PENDING_STATUSES)
          .lt('created_at', slaThresholdISO())
      }
      const since = periodoToISO(filters.periodo)
      if (since) query = query.gte('created_at', since)

      if (filters.search.trim()) {
        const t = filters.search.trim()
        const aux = await fetchSearchAuxIds(t)
        query = query.or(buildSearchOrClause(t, aux))
      }

      query = query.order('created_at', { ascending: false })

      const from = (filters.page - 1) * filters.pageSize
      const to = from + filters.pageSize - 1
      query = query.range(from, to)

      const { data, error, count } = await query
      if (error) throw error
      return {
        data: ((data ?? []) as unknown as SolicitacaoListRow[]).map(normalizeParceiroJoins),
        count: count ?? 0,
      }
    },
  })
}

export function useSolicitacao(id: string | null | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ['solicitacao', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('solicitacoes')
        .select(SELECT_WITH_JOINS)
        .eq('id', id!)
        .single()
      if (error) throw error
      return normalizeParceiroJoins(data as unknown as SolicitacaoListRow)
    },
  })
}

/**
 * Conta solicitações com cartão Pamcard ainda pendente de providência.
 * Recarrega a cada 30s para alimentar o indicador da sidebar.
 */
export function usePamcardPendenteCount() {
  return useQuery({
    queryKey: ['pamcard-pendente-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .eq('origem', 'parceiro')
        .eq('pamcard_status', 'nao_tem_cartao')
        .is('pamcard_providenciado_em', null)
      if (error) throw error
      return count ?? 0
    },
    refetchInterval: 30_000,
  })
}

export function useCreateSolicitacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: TablesInsert<'solicitacoes'>) => {
      const { data: userData } = await supabase.auth.getUser()
      const atendente_id = userData.user?.id ?? null
      const { data, error } = await supabase
        .from('solicitacoes')
        .insert({ ...input, atendente_id, status: 'recebida' } as never)
        .select(SELECT_WITH_JOINS)
        .single()
      if (error) throw error
      return normalizeParceiroJoins(data as unknown as SolicitacaoListRow)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['solicitacoes'] })
      toast.success('Solicitação criada')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

export interface DuplicateCheckCriteria {
  motoristaId: string
  veiculoId: string
  clienteId: string
}

export interface PossibleDuplicate {
  id: string
  numero_interno: number
  status: SolicitacaoStatus
  created_at: string
}

const DUPLICATE_WINDOW_HOURS = 12

export async function findPossibleDuplicate(
  c: DuplicateCheckCriteria,
): Promise<PossibleDuplicate | null> {
  const since = new Date(Date.now() - DUPLICATE_WINDOW_HOURS * 3_600_000).toISOString()
  const { data, error } = await supabase
    .from('solicitacoes')
    .select('id, numero_interno, status, created_at')
    .eq('motorista_id', c.motoristaId)
    .eq('veiculo_id', c.veiculoId)
    .eq('cliente_id', c.clienteId)
    .not('status', 'in', '("cancelada","finalizada")')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as PossibleDuplicate | null
}

export function useDuplicateSolicitacao() {
  const qc = useQueryClient()
  return useMutation<SolicitacaoListRow, unknown, { sourceId: string }>({
    mutationFn: async ({ sourceId }) => {
      const { data: rawSource, error: fetchErr } = await supabase
        .from('solicitacoes')
        .select('*')
        .eq('id', sourceId)
        .single()
      if (fetchErr) throw fetchErr
      const source = rawSource as unknown as Solicitacao

      const { data: userData } = await supabase.auth.getUser()
      const atendente_id = userData.user?.id ?? null

      const payload: TablesInsert<'solicitacoes'> = {
        tipo: source.tipo,
        status: 'recebida',
        solicitante_nome: source.solicitante_nome,
        solicitante_telefone: source.solicitante_telefone,
        motorista_id: source.motorista_id,
        veiculo_id: source.veiculo_id,
        carreta_id: source.carreta_id,
        subcontratada_id: source.subcontratada_id,
        cliente_id: source.cliente_id,
        material_id: source.material_id,
        material_subtipo: source.material_subtipo,
        local_carregamento: source.local_carregamento,
        pamcard_status: source.pamcard_status,
        pamcard_numero: source.pamcard_numero,
        observacoes: source.observacoes,
        atendente_id,
      }

      const { data, error } = await supabase
        .from('solicitacoes')
        .insert(payload as never)
        .select(SELECT_WITH_JOINS)
        .single()
      if (error) throw error
      return normalizeParceiroJoins(data as unknown as SolicitacaoListRow)
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['solicitacoes'] })
      qc.invalidateQueries({ queryKey: ['dashboard-counts'] })
      qc.invalidateQueries({ queryKey: ['dashboard-status-breakdown'] })
      qc.invalidateQueries({ queryKey: ['dashboard-oldest-pending'] })
      toast.success(`Solicitação duplicada como #${String(created.numero_interno).padStart(4, '0')}`)
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

interface SolicitacaoOptimisticContext {
  previousDetail: [unknown, unknown] | null
  previousLists: [unknown, unknown][]
}

async function snapshotAndPatchSolicitacao(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
  patch: Partial<SolicitacaoListRow>,
): Promise<SolicitacaoOptimisticContext> {
  await qc.cancelQueries({ queryKey: ['solicitacao', id] })
  await qc.cancelQueries({ queryKey: ['solicitacoes'] })

  const detailKey = ['solicitacao', id] as const
  const previousDetailValue = qc.getQueryData(detailKey)
  const previousDetail: [unknown, unknown] | null =
    previousDetailValue !== undefined ? [detailKey, previousDetailValue] : null

  qc.setQueryData<SolicitacaoListRow | undefined>(detailKey, (old) =>
    old ? ({ ...old, ...patch } as SolicitacaoListRow) : old,
  )

  const previousLists = qc.getQueriesData({ queryKey: ['solicitacoes'] })
  qc.setQueriesData<{ data: SolicitacaoListRow[]; count: number } | undefined>(
    { queryKey: ['solicitacoes'] },
    (old) => {
      if (!old?.data) return old
      return {
        ...old,
        data: old.data.map((row) => (row.id === id ? ({ ...row, ...patch } as SolicitacaoListRow) : row)),
      }
    },
  )

  return { previousDetail, previousLists }
}

function rollbackSolicitacao(
  qc: ReturnType<typeof useQueryClient>,
  ctx: SolicitacaoOptimisticContext | undefined,
) {
  if (!ctx) return
  if (ctx.previousDetail) {
    qc.setQueryData(ctx.previousDetail[0] as readonly unknown[], ctx.previousDetail[1])
  }
  for (const [key, value] of ctx.previousLists) {
    qc.setQueryData(key as readonly unknown[], value)
  }
}

export function useUpdateSolicitacao() {
  const qc = useQueryClient()
  return useMutation<
    SolicitacaoListRow,
    unknown,
    { id: string; values: TablesUpdate<'solicitacoes'> },
    SolicitacaoOptimisticContext
  >({
    mutationFn: async ({ id, values }) => {
      const { data, error } = await supabase
        .from('solicitacoes')
        .update(values as never)
        .eq('id', id)
        .select(SELECT_WITH_JOINS)
        .single()
      if (error) throw error
      return normalizeParceiroJoins(data as unknown as SolicitacaoListRow)
    },
    onMutate: ({ id, values }) =>
      snapshotAndPatchSolicitacao(qc, id, values as Partial<SolicitacaoListRow>),
    onError: (e, _vars, ctx) => {
      rollbackSolicitacao(qc, ctx)
      toast.error(traduzirErroBanco(e))
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ['solicitacoes'] })
      qc.invalidateQueries({ queryKey: ['solicitacao', vars.id] })
    },
  })
}

export function useTransitStatus() {
  const qc = useQueryClient()
  return useMutation<
    { id: string; status: SolicitacaoStatus },
    unknown,
    { id: string; status: SolicitacaoStatus; extra?: Partial<TablesUpdate<'solicitacoes'>> },
    SolicitacaoOptimisticContext
  >({
    mutationFn: async ({ id, status, extra }) => {
      const { error } = await supabase
        .from('solicitacoes')
        .update({ status, ...(extra ?? {}) } as never)
        .eq('id', id)
      if (error) throw error
      return { id, status }
    },
    onMutate: ({ id, status, extra }) =>
      snapshotAndPatchSolicitacao(qc, id, { status, ...(extra ?? {}) } as Partial<SolicitacaoListRow>),
    onError: (e, _vars, ctx) => {
      rollbackSolicitacao(qc, ctx)
      toast.error(traduzirErroBanco(e))
    },
    onSuccess: () => {
      toast.success('Status atualizado')
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ['solicitacoes'] })
      qc.invalidateQueries({ queryKey: ['solicitacao', vars.id] })
    },
  })
}

interface BulkContext {
  previousLists: [unknown, unknown][]
}

export function useBulkTransitStatus() {
  const qc = useQueryClient()
  return useMutation<
    { ids: string[]; status: SolicitacaoStatus },
    unknown,
    { ids: string[]; status: SolicitacaoStatus; extra?: Partial<TablesUpdate<'solicitacoes'>> },
    BulkContext
  >({
    mutationFn: async ({ ids, status, extra }) => {
      const { error } = await supabase
        .from('solicitacoes')
        .update({ status, ...(extra ?? {}) } as never)
        .in('id', ids)
      if (error) throw error
      return { ids, status }
    },
    onMutate: async ({ ids, status, extra }) => {
      await qc.cancelQueries({ queryKey: ['solicitacoes'] })
      const previousLists = qc.getQueriesData({ queryKey: ['solicitacoes'] })
      const idSet = new Set(ids)
      const patch = { status, ...(extra ?? {}) } as Partial<SolicitacaoListRow>
      qc.setQueriesData<{ data: SolicitacaoListRow[]; count: number } | undefined>(
        { queryKey: ['solicitacoes'] },
        (old) => {
          if (!old?.data) return old
          return {
            ...old,
            data: old.data.map((row) =>
              idSet.has(row.id) ? ({ ...row, ...patch } as SolicitacaoListRow) : row,
            ),
          }
        },
      )
      for (const id of ids) {
        const detailKey = ['solicitacao', id] as const
        qc.setQueryData<SolicitacaoListRow | undefined>(detailKey, (old) =>
          old ? ({ ...old, ...patch } as SolicitacaoListRow) : old,
        )
      }
      return { previousLists }
    },
    onError: (e, _vars, ctx) => {
      if (ctx) {
        for (const [key, value] of ctx.previousLists) {
          qc.setQueryData(key as readonly unknown[], value)
        }
      }
      toast.error(traduzirErroBanco(e))
    },
    onSuccess: ({ ids }) => {
      toast.success(`${ids.length} ${ids.length === 1 ? 'solicitação atualizada' : 'solicitações atualizadas'}`)
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ['solicitacoes'] })
      for (const id of vars.ids) {
        qc.invalidateQueries({ queryKey: ['solicitacao', id] })
      }
      qc.invalidateQueries({ queryKey: ['dashboard-counts'] })
      qc.invalidateQueries({ queryKey: ['dashboard-status-breakdown'] })
      qc.invalidateQueries({ queryKey: ['dashboard-oldest-pending'] })
    },
  })
}

export function useBulkDeleteSolicitacoes() {
  const qc = useQueryClient()
  return useMutation<
    { ids: string[] },
    unknown,
    { ids: string[] },
    BulkContext
  >({
    mutationFn: async ({ ids }) => {
      const { error } = await supabase
        .from('solicitacoes')
        .delete()
        .in('id', ids)
      if (error) throw error
      return { ids }
    },
    onMutate: async ({ ids }) => {
      await qc.cancelQueries({ queryKey: ['solicitacoes'] })
      const previousLists = qc.getQueriesData({ queryKey: ['solicitacoes'] })
      const idSet = new Set(ids)
      qc.setQueriesData<{ data: SolicitacaoListRow[]; count: number } | undefined>(
        { queryKey: ['solicitacoes'] },
        (old) => {
          if (!old?.data) return old
          const filtered = old.data.filter((row) => !idSet.has(row.id))
          return {
            ...old,
            data: filtered,
            count: Math.max(0, old.count - (old.data.length - filtered.length)),
          }
        },
      )
      for (const id of ids) {
        qc.removeQueries({ queryKey: ['solicitacao', id] })
      }
      return { previousLists }
    },
    onError: (e, _vars, ctx) => {
      if (ctx) {
        for (const [key, value] of ctx.previousLists) {
          qc.setQueryData(key as readonly unknown[], value)
        }
      }
      toast.error(traduzirErroBanco(e))
    },
    onSuccess: ({ ids }) => {
      toast.success(`${ids.length} ${ids.length === 1 ? 'solicitação excluída' : 'solicitações excluídas'}`)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['solicitacoes'] })
      qc.invalidateQueries({ queryKey: ['dashboard-counts'] })
      qc.invalidateQueries({ queryKey: ['dashboard-status-breakdown'] })
      qc.invalidateQueries({ queryKey: ['dashboard-oldest-pending'] })
    },
  })
}
