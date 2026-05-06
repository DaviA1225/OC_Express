import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database.types'

type CrudTableName = keyof Pick<
  Database['public']['Tables'],
  'subcontratadas' | 'motoristas' | 'veiculos' | 'carretas' | 'clientes' | 'materiais' | 'cargas_retorno'
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
  equals?: Record<string, string | number | boolean | null>
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
        query = query.eq('ativo' as never, true as never)
      }
      if (params.equals) {
        for (const [col, val] of Object.entries(params.equals)) {
          query = query.eq(col as never, val as never)
        }
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

export function useActiveCount<TName extends CrudTableName>(
  table: TName,
  equals?: Record<string, string | number | boolean | null>,
) {
  return useQuery({
    queryKey: ['crud-count-active', table, equals],
    queryFn: async () => {
      let q = supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('ativo' as never, true as never)
      if (equals) {
        for (const [col, val] of Object.entries(equals)) {
          q = q.eq(col as never, val as never)
        }
      }
      const { count, error } = await q
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
          .eq('id' as never, input.id as never)
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

export function useDeleteRow<TName extends CrudTableName>(table: TName, friendlyName: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from(table).delete().eq('id' as never, id as never)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crud', table] })
      qc.invalidateQueries({ queryKey: ['crud-count-active', table] })
      qc.invalidateQueries({ queryKey: ['crud-options', table] })
      toast.success(`${friendlyName} excluído`)
    },
    onError: (error: unknown) => {
      toast.error(traduzirErroBanco(error))
    },
  })
}

interface ToggleContext {
  previousLists: [unknown, unknown][]
  previousCount: [unknown, unknown][]
}

export function useToggleActive<TName extends CrudTableName>(table: TName, friendlyName: string) {
  const qc = useQueryClient()
  return useMutation<void, unknown, { id: string; ativo: boolean }, ToggleContext>({
    mutationFn: async ({ id, ativo }) => {
      const { error } = await supabase
        .from(table)
        .update({ ativo } as never)
        .eq('id' as never, id as never)
      if (error) throw error
    },
    onMutate: async ({ id, ativo }) => {
      await qc.cancelQueries({ queryKey: ['crud', table] })
      await qc.cancelQueries({ queryKey: ['crud-count-active', table] })

      const previousLists = qc.getQueriesData({ queryKey: ['crud', table] })
      const previousCount = qc.getQueriesData({ queryKey: ['crud-count-active', table] })

      qc.setQueriesData<{ data: { id: string; ativo: boolean }[]; count: number } | undefined>(
        { queryKey: ['crud', table] },
        (old) => {
          if (!old?.data) return old
          return { ...old, data: old.data.map((row) => row.id === id ? { ...row, ativo } : row) }
        },
      )
      qc.setQueriesData<number | undefined>(
        { queryKey: ['crud-count-active', table] },
        (old) => (typeof old === 'number' ? old + (ativo ? 1 : -1) : old),
      )

      return { previousLists, previousCount }
    },
    onError: (error, _vars, ctx) => {
      if (ctx) {
        for (const [key, value] of ctx.previousLists) {
          qc.setQueryData(key as readonly unknown[], value)
        }
        for (const [key, value] of ctx.previousCount) {
          qc.setQueryData(key as readonly unknown[], value)
        }
      }
      toast.error(traduzirErroBanco(error))
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.ativo ? `${friendlyName} reativado` : `${friendlyName} desativado`)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['crud', table] })
      qc.invalidateQueries({ queryKey: ['crud-count-active', table] })
      qc.invalidateQueries({ queryKey: ['crud-options', table] })
    },
  })
}

export function useBulkToggleActive<TName extends CrudTableName>(table: TName, friendlyName: string) {
  const qc = useQueryClient()
  return useMutation<void, unknown, { ids: string[]; ativo: boolean }, ToggleContext>({
    mutationFn: async ({ ids, ativo }) => {
      if (ids.length === 0) return
      const { error } = await supabase
        .from(table)
        .update({ ativo } as never)
        .in('id' as never, ids as never)
      if (error) throw error
    },
    onMutate: async ({ ids, ativo }) => {
      await qc.cancelQueries({ queryKey: ['crud', table] })
      await qc.cancelQueries({ queryKey: ['crud-count-active', table] })

      const previousLists = qc.getQueriesData({ queryKey: ['crud', table] })
      const previousCount = qc.getQueriesData({ queryKey: ['crud-count-active', table] })

      const idSet = new Set(ids)
      let activeDelta = 0
      qc.setQueriesData<{ data: { id: string; ativo: boolean }[]; count: number } | undefined>(
        { queryKey: ['crud', table] },
        (old) => {
          if (!old?.data) return old
          return {
            ...old,
            data: old.data.map((row) => {
              if (!idSet.has(row.id)) return row
              if (row.ativo !== ativo) activeDelta += ativo ? 1 : -1
              return { ...row, ativo }
            }),
          }
        },
      )
      qc.setQueriesData<number | undefined>(
        { queryKey: ['crud-count-active', table] },
        (old) => (typeof old === 'number' ? Math.max(0, old + activeDelta) : old),
      )

      return { previousLists, previousCount }
    },
    onError: (error, _vars, ctx) => {
      if (ctx) {
        for (const [key, value] of ctx.previousLists) qc.setQueryData(key as readonly unknown[], value)
        for (const [key, value] of ctx.previousCount) qc.setQueryData(key as readonly unknown[], value)
      }
      toast.error(traduzirErroBanco(error))
    },
    onSuccess: (_data, vars) => {
      const n = vars.ids.length
      toast.success(
        vars.ativo
          ? `${n} ${n === 1 ? `${friendlyName.toLowerCase()} reativado` : `${friendlyName.toLowerCase()}s reativados`}`
          : `${n} ${n === 1 ? `${friendlyName.toLowerCase()} desativado` : `${friendlyName.toLowerCase()}s desativados`}`,
      )
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['crud', table] })
      qc.invalidateQueries({ queryKey: ['crud-count-active', table] })
      qc.invalidateQueries({ queryKey: ['crud-options', table] })
    },
  })
}

export function useBulkDeleteRows<TName extends CrudTableName>(table: TName, friendlyName: string) {
  const qc = useQueryClient()
  return useMutation<void, unknown, { ids: string[] }>({
    mutationFn: async ({ ids }) => {
      if (ids.length === 0) return
      const { error } = await supabase.from(table).delete().in('id' as never, ids as never)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      const n = vars.ids.length
      toast.success(
        `${n} ${n === 1 ? `${friendlyName.toLowerCase()} excluído` : `${friendlyName.toLowerCase()}s excluídos`}`,
      )
    },
    onError: (error) => toast.error(traduzirErroBanco(error)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['crud', table] })
      qc.invalidateQueries({ queryKey: ['crud-count-active', table] })
      qc.invalidateQueries({ queryKey: ['crud-options', table] })
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
