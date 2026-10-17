import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ilikeFilter } from '@sislog/shared/postgrest'
import { supabase } from '@/lib/supabase'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database.types'

/** Nome do cadastro para as mensagens: o gênero decide a concordância ("cadastrada"/"cadastrado"). */
export interface NomeRegistro {
  singular: string
  plural: string
  genero: 'm' | 'f'
}

const sufixo = (n: NomeRegistro) => (n.genero === 'f' ? 'a' : 'o')
const sufixoPlural = (n: NomeRegistro) => (n.genero === 'f' ? 'as' : 'os')

type CrudTableName = keyof Pick<
  Database['public']['Tables'],
  'subcontratadas' | 'motoristas' | 'veiculos' | 'carretas' | 'clientes' | 'materiais' | 'cargas_retorno' | 'parceiros'
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
        const term = params.search.trim()
        const ors = params.searchColumns.map((c) => ilikeFilter(c, term)).join(',')
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

export function useUpsertRow<TName extends CrudTableName>(table: TName, nome: NomeRegistro) {
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
      toast.success(`${nome.singular} ${vars.id ? 'atualizad' : 'cadastrad'}${sufixo(nome)}.`)
    },
    onError: (error: unknown) => {
      toast.error(traduzirErroBanco(error))
    },
  })
}

export function useDeleteRow<TName extends CrudTableName>(table: TName, nome: NomeRegistro) {
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
      toast.success(`${nome.singular} excluíd${sufixo(nome)}.`)
    },
    onError: (error: unknown) => {
      toast.error(traduzirErroBanco(error, { exclusao: true }))
    },
  })
}

interface ToggleContext {
  previousLists: [unknown, unknown][]
  previousCount: [unknown, unknown][]
}

export function useToggleActive<TName extends CrudTableName>(table: TName, nome: NomeRegistro) {
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
      toast.success(`${nome.singular} ${vars.ativo ? 'reativad' : 'desativad'}${sufixo(nome)}.`)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['crud', table] })
      qc.invalidateQueries({ queryKey: ['crud-count-active', table] })
      qc.invalidateQueries({ queryKey: ['crud-options', table] })
    },
  })
}

export function useBulkToggleActive<TName extends CrudTableName>(table: TName, nome: NomeRegistro) {
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
      const palavra = vars.ativo ? 'reativad' : 'desativad'
      toast.success(
        n === 1
          ? `1 ${nome.singular.toLowerCase()} ${palavra}${sufixo(nome)}.`
          : `${n} ${nome.plural.toLowerCase()} ${palavra}${sufixoPlural(nome)}.`,
      )
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['crud', table] })
      qc.invalidateQueries({ queryKey: ['crud-count-active', table] })
      qc.invalidateQueries({ queryKey: ['crud-options', table] })
    },
  })
}

export function useBulkDeleteRows<TName extends CrudTableName>(table: TName, nome: NomeRegistro) {
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
        n === 1
          ? `1 ${nome.singular.toLowerCase()} excluíd${sufixo(nome)}.`
          : `${n} ${nome.plural.toLowerCase()} excluíd${sufixoPlural(nome)}.`,
      )
    },
    onError: (error) => toast.error(traduzirErroBanco(error, { exclusao: true })),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['crud', table] })
      qc.invalidateQueries({ queryKey: ['crud-count-active', table] })
      qc.invalidateQueries({ queryKey: ['crud-options', table] })
    },
  })
}

const MSG_FALHA = 'Não foi possível concluir a operação. Tente novamente.'

// SQLSTATEs que as funções do banco usam para regra de negócio (RAISE ... USING ERRCODE):
// a mensagem já foi escrita para o usuário.
const CODIGOS_REGRA = new Set(['P0001', '22023', '22004', '23514'])

export function traduzirErroBanco(error: unknown, opts?: { exclusao?: boolean }): string {
  const e = error as { code?: string; message?: string; details?: string } | undefined
  if (!e) return MSG_FALHA
  const code = e.code || undefined
  const message = e.message?.trim() || undefined
  if (code === '23505') {
    if (message?.includes('cpf')) return 'Esse CPF já está cadastrado.'
    if (message?.includes('cnpj')) return 'Esse CNPJ já está cadastrado.'
    if (message?.includes('placa')) return 'Essa placa já está cadastrada.'
    if (message?.includes('nome')) return 'Esse nome já está cadastrado.'
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
  // Sem code: erro JS/StorageError/Edge Function ("Sessão expirada" etc.) — a mensagem é nossa.
  if (!code) return message ?? MSG_FALHA
  // SQLSTATE técnico (08*, 42P*, XX*, 57*, 53*…) ou desconhecido: não expor o texto cru.
  return `${MSG_FALHA} Código: ${code}.`
}
