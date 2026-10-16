import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ilikeFilter } from '@sislog/shared/postgrest'
import { supabase } from '@/lib/supabase'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@sislog/shared/types'

/** Tabelas de cadastro do parceiro. A RLS já restringe cada operação às linhas
 *  do parceiro logado (`parceiro_id = get_current_parceiro_id()`); o `parceiro_id`
 *  precisa ser informado apenas no INSERT (a policy WITH CHECK exige). */
export type ParceiroCrudTable = keyof Pick<
  Database['public']['Tables'],
  | 'parceiro_motoristas'
  | 'parceiro_veiculos'
  | 'parceiro_carretas'
  | 'parceiro_subcontratadas'
  | 'parceiro_pamcards'
>

/** Gênero gramatical de cada cadastro, para os toasts ("Carreta cadastrada."). */
const SUFIXO: Record<ParceiroCrudTable, 'o' | 'a'> = {
  parceiro_motoristas: 'o',
  parceiro_veiculos: 'o',
  parceiro_carretas: 'a',
  parceiro_subcontratadas: 'a',
  parceiro_pamcards: 'o',
}

interface ListParams {
  search: string
  showInactive: boolean
  page: number
  pageSize: number
  searchColumns: string[]
  orderBy?: string
  ascending?: boolean
}

export function useParceiroCrudList<TName extends ParceiroCrudTable>(
  table: TName,
  params: ListParams,
) {
  return useQuery({
    queryKey: ['parceiro-crud', table, params],
    queryFn: async () => {
      let query = supabase.from(table).select('*', { count: 'exact' })

      if (!params.showInactive) {
        query = query.eq('ativo' as never, true as never)
      }
      if (params.search.trim()) {
        const term = params.search.trim()
        const ors = params.searchColumns.map((c) => ilikeFilter(c, term)).join(',')
        query = query.or(ors)
      }

      query = query.order(params.orderBy ?? 'created_at', { ascending: params.ascending ?? true })

      const from = (params.page - 1) * params.pageSize
      query = query.range(from, from + params.pageSize - 1)

      const { data, error, count } = await query
      if (error) throw error
      return { data: (data ?? []) as unknown as Tables<TName>[], count: count ?? 0 }
    },
  })
}

export function useParceiroActiveCount<TName extends ParceiroCrudTable>(table: TName) {
  return useQuery({
    queryKey: ['parceiro-crud-count', table],
    queryFn: async () => {
      const { count, error } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('ativo' as never, true as never)
      if (error) throw error
      return count ?? 0
    },
  })
}

/**
 * Cria/atualiza um registro de cadastro do parceiro. No INSERT injeta o
 * `parceiro_id` do parceiro logado — exigido pela policy de RLS.
 */
export function useUpsertParceiroRow<TName extends ParceiroCrudTable>(
  table: TName,
  friendlyName: string,
  parceiroId: string | null,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      values: Omit<TablesInsert<TName>, 'parceiro_id'> | TablesUpdate<TName>
    }) => {
      if (input.id) {
        const { data, error } = await supabase
          .from(table)
          .update(input.values as never)
          .eq('id' as never, input.id as never)
          .select()
          .single()
        if (error) throw error
        return data
      }
      if (!parceiroId) throw new Error('Parceiro não identificado. Recarregue a página.')
      const { data, error } = await supabase
        .from(table)
        .insert({ ...input.values, parceiro_id: parceiroId } as never)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['parceiro-crud', table] })
      qc.invalidateQueries({ queryKey: ['parceiro-crud-count', table] })
      qc.invalidateQueries({ queryKey: ['parceiro-options', table] })
      toast.success(`${friendlyName} ${vars.id ? 'atualizad' : 'cadastrad'}${SUFIXO[table]}.`)
    },
    onError: (error: unknown) => toast.error(traduzirErroBanco(error)),
  })
}

export function useToggleParceiroActive<TName extends ParceiroCrudTable>(
  table: TName,
  friendlyName: string,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from(table)
        .update({ ativo } as never)
        .eq('id' as never, id as never)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['parceiro-crud', table] })
      qc.invalidateQueries({ queryKey: ['parceiro-crud-count', table] })
      qc.invalidateQueries({ queryKey: ['parceiro-options', table] })
      toast.success(`${friendlyName} ${vars.ativo ? 'reativad' : 'desativad'}${SUFIXO[table]}.`)
    },
    onError: (error: unknown) => toast.error(traduzirErroBanco(error)),
  })
}

export function useDeleteParceiroRow<TName extends ParceiroCrudTable>(
  table: TName,
  friendlyName: string,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from(table).delete().eq('id' as never, id as never)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parceiro-crud', table] })
      qc.invalidateQueries({ queryKey: ['parceiro-crud-count', table] })
      qc.invalidateQueries({ queryKey: ['parceiro-options', table] })
      toast.success(`${friendlyName} excluíd${SUFIXO[table]}.`)
    },
    onError: (error: unknown) => toast.error(traduzirErroBanco(error, { exclusao: true })),
  })
}

const MSG_FALHA = 'Não foi possível concluir a operação. Tente novamente.'

// SQLSTATEs que as funções do banco usam para regra de negócio (RAISE ... USING
// ERRCODE): a mensagem já foi escrita para o usuário. Mesma lógica do interno
// (apps/interno/src/features/crud/useCrudQueries.ts).
const CODIGOS_REGRA = new Set(['P0001', '22023', '22004', '23514'])

export function traduzirErroBanco(error: unknown, opts?: { exclusao?: boolean }): string {
  const e = error as { code?: string; message?: string } | undefined
  if (!e) return MSG_FALHA
  const code = e.code || undefined
  const message = e.message?.trim() || undefined
  // Rate limit diário do portal (trigger da migration 0022).
  if (code === 'PT429') {
    return 'Limite de 50 solicitações por dia atingido. Tente novamente amanhã.'
  }
  // Bloqueio de novas solicitações por parceiro (trigger da migration 0033).
  if (code === 'PT423') {
    return 'Novas solicitações estão temporariamente indisponíveis. Fale com a equipe da LHG.'
  }
  if (code === '23505') {
    if (message?.includes('cpf')) return 'Esse CPF já está cadastrado.'
    if (message?.includes('cnpj')) return 'Esse CNPJ já está cadastrado.'
    if (message?.includes('documento')) return 'Esse CPF/CNPJ já está cadastrado.'
    if (message?.includes('numero')) return 'Esse número de Pamcard já está cadastrado.'
    if (message?.includes('placa')) return 'Essa placa já está cadastrada.'
    return 'Já existe um registro com esses dados.'
  }
  if (code === '23503') {
    return opts?.exclusao
      ? 'Registro vinculado a solicitações. Desative em vez de excluir.'
      : 'Registro em uso por outros cadastros.'
  }
  if (message?.toLowerCase().includes('failed to fetch')) {
    return 'Não foi possível conectar ao servidor. Tente novamente.'
  }
  if (code === '42501') {
    // Mensagem nativa do Postgres (RLS/privilégio) não serve ao usuário; a custom das RPCs serve.
    if (!message || /row-level security|permission denied|violates/i.test(message)) {
      return 'Sem permissão para esta ação.'
    }
    return message
  }
  if (code && (CODIGOS_REGRA.has(code) || /^PT\d{3}$/.test(code))) return message ?? MSG_FALHA
  // Sem code: erro JS/StorageError/Edge Function — a mensagem é nossa.
  if (!code) return message ?? MSG_FALHA
  // SQLSTATE técnico (08*, 42P*, XX*, 57*, 53*…) ou desconhecido: não expor o texto cru.
  return `${MSG_FALHA} Código: ${code}.`
}
