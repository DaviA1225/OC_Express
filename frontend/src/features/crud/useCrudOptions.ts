import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface OptionParams {
  table: 'subcontratadas' | 'motoristas' | 'veiculos' | 'carretas' | 'clientes' | 'materiais' | 'cargas_retorno'
  selectColumns: string
  orderBy?: string
  equals?: Record<string, string | number | boolean | null>
}

export function useCrudOptions<T = Record<string, unknown>>({ table, selectColumns, orderBy = 'created_at', equals }: OptionParams) {
  return useQuery({
    queryKey: ['crud-options', table, selectColumns, orderBy, equals],
    queryFn: async (): Promise<T[]> => {
      let q = supabase
        .from(table)
        .select(selectColumns)
        .eq('ativo', true)
        .order(orderBy, { ascending: true })
        .limit(500)
      if (equals) {
        for (const [col, val] of Object.entries(equals)) {
          q = q.eq(col, val as never)
        }
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as T[]
    },
    staleTime: 60_000,
  })
}
