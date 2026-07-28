import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface OptionParams {
  table: 'subcontratadas' | 'motoristas' | 'veiculos' | 'carretas' | 'clientes' | 'materiais' | 'cargas_retorno'
  selectColumns: string
  orderBy?: string
  equals?: Record<string, string | number | boolean | null>
  /**
   * Só busca quando `true` (padrão). Existe porque estas queries varrem a
   * TABELA INTEIRA (paginando até esgotar) — carregá-las em formulário fechado
   * custa caro à toa. Use `enabled: aberto` / `enabled: editando` em diálogo e
   * card de edição. O cache do react-query segura o resultado por alguns
   * minutos, então reabrir não refaz a busca.
   */
  enabled?: boolean
}

// Tamanho de página da busca de opções. Um teto fixo (ex.: 500) escondia
// silenciosamente registros quando a base crescia além dele — carretas passou
// de 557 ativas e as placas após a 500ª sumiam do seletor de solicitação,
// embora aparecessem no cadastro (paginado/buscado no servidor). Paginamos até
// esgotar para nunca mais cortar. O PAGE_SIZE fica no teto padrão do PostgREST.
const OPTIONS_PAGE_SIZE = 1000

export function useCrudOptions<T = Record<string, unknown>>({ table, selectColumns, orderBy = 'created_at', equals, enabled = true }: OptionParams) {
  return useQuery({
    enabled,
    queryKey: ['crud-options', table, selectColumns, orderBy, equals],
    queryFn: async (): Promise<T[]> => {
      const all: T[] = []
      for (let from = 0; ; from += OPTIONS_PAGE_SIZE) {
        let q = supabase
          .from(table)
          .select(selectColumns)
          .eq('ativo', true)
          .order(orderBy, { ascending: true })
          .range(from, from + OPTIONS_PAGE_SIZE - 1)
        if (equals) {
          for (const [col, val] of Object.entries(equals)) {
            q = q.eq(col, val as never)
          }
        }
        const { data, error } = await q
        if (error) throw error
        const rows = (data ?? []) as unknown as T[]
        all.push(...rows)
        if (rows.length < OPTIONS_PAGE_SIZE) break
      }
      return all
    },
    staleTime: 60_000,
  })
}
