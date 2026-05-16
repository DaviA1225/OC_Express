import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface CargaRetornoRow {
  id: string
  cliente_id: string
  local_carregamento: string
  ativo: boolean
  cliente: { razao_social: string; cidade: string | null; uf: string | null } | null
}

export function useCargasRetorno(opts: { onlyActive?: boolean } = {}) {
  const onlyActive = opts.onlyActive ?? true
  return useQuery({
    queryKey: ['cargas-retorno-options', { onlyActive }],
    queryFn: async () => {
      let q = supabase
        .from('cargas_retorno')
        .select('id, cliente_id, local_carregamento, ativo, cliente:cliente_id ( razao_social, cidade, uf )')
        .order('local_carregamento', { ascending: true })
      if (onlyActive) q = q.eq('ativo' as never, true as never)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as CargaRetornoRow[]
    },
  })
}
