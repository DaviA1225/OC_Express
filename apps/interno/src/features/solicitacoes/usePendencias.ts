import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database.types'

export type Pendencia = Tables<'solicitacao_pendencias'>

/** Histórico de pendências de uma solicitação (mais recente primeiro). O time
 *  interno tem RLS ALL, então lê a tabela direto. */
export function usePendencias(solicitacaoId: string | undefined) {
  return useQuery({
    queryKey: ['pendencias', solicitacaoId],
    enabled: !!solicitacaoId,
    queryFn: async (): Promise<Pendencia[]> => {
      const { data, error } = await supabase
        .from('solicitacao_pendencias')
        .select('*')
        .eq('solicitacao_id', solicitacaoId as string)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Pendencia[]
    },
  })
}

/** Devolve a solicitação ao parceiro criando uma pendência aberta. Os campos
 *  parceiro_id/criada_por são preenchidos por trigger (migration 0035). */
export function useDevolverParceiro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ solicitacaoId, motivo }: { solicitacaoId: string; motivo: string }) => {
      const { error } = await supabase
        .from('solicitacao_pendencias')
        .insert({ solicitacao_id: solicitacaoId, motivo } as never)
      if (error) throw error
    },
    onSuccess: (_data, { solicitacaoId }) => {
      qc.invalidateQueries({ queryKey: ['pendencias', solicitacaoId] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('Solicitação devolvida ao parceiro. Ele será avisado no portal.')
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Erro ao devolver ao parceiro'
      toast.error(msg)
    },
  })
}
