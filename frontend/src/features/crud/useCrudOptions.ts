import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface OptionParams {
  table: 'subcontratadas' | 'motoristas' | 'veiculos' | 'carretas' | 'clientes' | 'materiais'
  selectColumns: string
  orderBy?: string
}

export function useCrudOptions<T = Record<string, unknown>>({ table, selectColumns, orderBy = 'created_at' }: OptionParams) {
  return useQuery({
    queryKey: ['crud-options', table, selectColumns, orderBy],
    queryFn: async (): Promise<T[]> => {
      const { data, error } = await supabase
        .from(table)
        .select(selectColumns)
        .eq('ativo', true)
        .order(orderBy, { ascending: true })
        .limit(500)
      if (error) throw error
      return (data ?? []) as unknown as T[]
    },
    staleTime: 60_000,
  })
}
