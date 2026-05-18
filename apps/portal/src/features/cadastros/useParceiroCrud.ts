import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@sislog/shared/types'

/** Tabelas de cadastro do parceiro. A RLS já restringe cada operação às linhas
 *  do parceiro logado (`parceiro_id = get_current_parceiro_id()`); o `parceiro_id`
 *  precisa ser informado apenas no INSERT (a policy WITH CHECK exige). */
export type ParceiroCrudTable = keyof Pick<
  Database['public']['Tables'],
  'parceiro_motoristas' | 'parceiro_veiculos' | 'parceiro_carretas' | 'parceiro_subcontratadas'
>

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
        const term = params.search.trim().replace(/[%_]/g, '\\$&')
        const ors = params.searchColumns.map((c) => `${c}.ilike.%${term}%`).join(',')
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
      toast.success(vars.id ? `${friendlyName} atualizado` : `${friendlyName} criado`)
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
      toast.success(vars.ativo ? `${friendlyName} reativado` : `${friendlyName} desativado`)
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
      toast.success(`${friendlyName} excluído`)
    },
    onError: (error: unknown) => toast.error(traduzirErroBanco(error)),
  })
}

export function traduzirErroBanco(error: unknown): string {
  const e = error as { code?: string; message?: string } | undefined
  if (!e) return 'Algo deu errado. Tente novamente em instantes.'
  if (e.code === '23505') {
    if (e.message?.includes('cpf')) return 'Esse CPF já está cadastrado.'
    if (e.message?.includes('cnpj')) return 'Esse CNPJ já está cadastrado.'
    if (e.message?.includes('placa')) return 'Essa placa já está cadastrada.'
    return 'Já existe um registro com esses dados.'
  }
  if (e.code === '23503') return 'Esse registro está em uso e não pode ser removido.'
  if (e.message?.toLowerCase().includes('failed to fetch')) {
    return 'Não foi possível conectar ao servidor. Tente novamente.'
  }
  return e.message ?? 'Algo deu errado. Tente novamente em instantes.'
}
