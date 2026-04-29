import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database.types'

type CrudTableName = keyof Pick<
  Database['public']['Tables'],
  'subcontratadas' | 'motoristas' | 'veiculos' | 'carretas' | 'clientes' | 'materiais'
>

interface ListParams {
  search: string
  showInactive: boolean
  page: number
  pageSize: number
  searchColumns: string[]
  orderBy?: string
  ascending?: boolean
  selectColumns?: string
}

export function useCrudList<TName extends CrudTableName>(
  table: TName,
  params: ListParams,
) {
  return useQuery({
    queryKey: ['crud', table, params],
    queryFn: async () => {
      const select = params.selectColumns ?? '*'
      let query = supabase.from(table).select(select, { count: 'exact' })

      if (!params.showInactive) {
        query = query.eq('ativo', true)
      }
      if (params.search.trim()) {
        const term = params.search.trim().replace(/[%_]/g, '\\$&')
        const ors = params.searchColumns.map((c) => `${c}.ilike.%${term}%`).join(',')
        query = query.or(ors)
      }

      const order = params.orderBy ?? 'created_at'
      query = query.order(order, { ascending: params.ascending ?? true })

      const from = (params.page - 1) * params.pageSize
      const to = from + params.pageSize - 1
      query = query.range(from, to)

      const { data, error, count } = await query
      if (error) throw error
      return { data: (data ?? []) as unknown as Tables<TName>[], count: count ?? 0 }
    },
  })
}

export function useActiveCount<TName extends CrudTableName>(table: TName) {
  return useQuery({
    queryKey: ['crud-count-active', table],
    queryFn: async () => {
      const { count, error } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('ativo', true)
      if (error) throw error
      return count ?? 0
    },
  })
}

export function useUpsertRow<TName extends CrudTableName>(table: TName, friendlyName: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id?: string; values: TablesInsert<TName> | TablesUpdate<TName> }) => {
      if (input.id) {
        const { data, error } = await supabase
          .from(table)
          .update(input.values as never)
          .eq('id', input.id)
          .select()
          .single()
        if (error) throw error
        return data
      }
      const { data, error } = await supabase
        .from(table)
        .insert(input.values as never)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['crud', table] })
      qc.invalidateQueries({ queryKey: ['crud-count-active', table] })
      qc.invalidateQueries({ queryKey: ['crud-options', table] })
      toast.success(vars.id ? `${friendlyName} atualizado` : `${friendlyName} criado`)
    },
    onError: (error: unknown) => {
      toast.error(traduzirErroBanco(error))
    },
  })
}

export function useToggleActive<TName extends CrudTableName>(table: TName, friendlyName: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from(table)
        .update({ ativo } as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['crud', table] })
      qc.invalidateQueries({ queryKey: ['crud-count-active', table] })
      qc.invalidateQueries({ queryKey: ['crud-options', table] })
      toast.success(vars.ativo ? `${friendlyName} reativado` : `${friendlyName} desativado`)
    },
    onError: (error: unknown) => {
      toast.error(traduzirErroBanco(error))
    },
  })
}

export function traduzirErroBanco(error: unknown): string {
  const e = error as { code?: string; message?: string; details?: string } | undefined
  if (!e) return 'Algo deu errado. Tente novamente em instantes.'
  if (e.code === '23505') {
    if (e.message?.includes('cpf')) return 'Esse CPF já está cadastrado.'
    if (e.message?.includes('cnpj')) return 'Esse CNPJ já está cadastrado.'
    if (e.message?.includes('placa')) return 'Essa placa já está cadastrada.'
    if (e.message?.includes('nome')) return 'Esse nome já está cadastrado.'
    return 'Já existe um registro com esses dados.'
  }
  if (e.code === '23503') return 'Esse registro está em uso e não pode ser removido.'
  if (e.message?.toLowerCase().includes('failed to fetch')) {
    return 'Não foi possível conectar ao servidor. Tente novamente.'
  }
  return e.message ?? 'Algo deu errado. Tente novamente em instantes.'
}
