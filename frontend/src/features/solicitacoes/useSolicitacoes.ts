import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { traduzirErroBanco } from '@/features/crud/useCrudQueries'
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
  SolicitacaoStatus,
  SolicitacaoTipo,
} from '@/types/database.types'

type Solicitacao = Tables<'solicitacoes'>

export interface SolicitacaoListRow extends Solicitacao {
  motorista: { nome_completo: string } | null
  veiculo: { placa: string } | null
  carreta: { placa: string } | null
  cliente: { razao_social: string } | null
  material: { nome: string } | null
}

const SELECT_WITH_JOINS = `
  *,
  motorista:motorista_id ( nome_completo ),
  veiculo:veiculo_id ( placa ),
  carreta:carreta_id ( placa ),
  cliente:cliente_id ( razao_social ),
  material:material_id ( nome )
`

export type PeriodoFiltro = 'todos' | 'hoje' | '7d' | 'mes'

export interface ListFilters {
  search: string
  statuses: SolicitacaoStatus[]
  periodo: PeriodoFiltro
  materialId: string | null
  tipo: SolicitacaoTipo | 'todos'
  atendenteId: string | null
  page: number
  pageSize: number
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
      const since = periodoToISO(filters.periodo)
      if (since) query = query.gte('created_at', since)

      if (filters.search.trim()) {
        const t = filters.search.trim().replace(/[%_]/g, '\\$&')
        const asNumber = Number(t.replace(/\D/g, ''))
        if (Number.isFinite(asNumber) && asNumber > 0) {
          query = query.or(
            `solicitante_nome.ilike.%${t}%,numero_interno.eq.${asNumber}`,
          )
        } else {
          query = query.ilike('solicitante_nome', `%${t}%`)
        }
      }

      query = query.order('created_at', { ascending: false })

      const from = (filters.page - 1) * filters.pageSize
      const to = from + filters.pageSize - 1
      query = query.range(from, to)

      const { data, error, count } = await query
      if (error) throw error
      return {
        data: (data ?? []) as unknown as SolicitacaoListRow[],
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
      return data as unknown as SolicitacaoListRow
    },
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
      return data as unknown as SolicitacaoListRow
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['solicitacoes'] })
      toast.success('Solicitação criada')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

export function useUpdateSolicitacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: TablesUpdate<'solicitacoes'> }) => {
      const { data, error } = await supabase
        .from('solicitacoes')
        .update(values as never)
        .eq('id', id)
        .select(SELECT_WITH_JOINS)
        .single()
      if (error) throw error
      return data as unknown as SolicitacaoListRow
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['solicitacoes'] })
      qc.invalidateQueries({ queryKey: ['solicitacao', data.id] })
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

export function useTransitStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, extra }: {
      id: string
      status: SolicitacaoStatus
      extra?: Partial<TablesUpdate<'solicitacoes'>>
    }) => {
      const { error } = await supabase
        .from('solicitacoes')
        .update({ status, ...(extra ?? {}) } as never)
        .eq('id', id)
      if (error) throw error
      return { id, status }
    },
    onSuccess: ({ id }) => {
      qc.invalidateQueries({ queryKey: ['solicitacoes'] })
      qc.invalidateQueries({ queryKey: ['solicitacao', id] })
      toast.success('Status atualizado')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}
