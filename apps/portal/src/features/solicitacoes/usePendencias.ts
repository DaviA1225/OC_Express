import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { traduzirErroBanco } from '@/features/cadastros/useParceiroCrud'
import type { Tables } from '@sislog/shared/types'

export type Pendencia = Tables<'solicitacao_pendencias'>

/** Todas as pendências abertas do parceiro logado (RLS já filtra por
 *  parceiro_id). Alimenta o sino do header e os badges da lista. Faz polling
 *  a cada 60s para refletir devoluções feitas pela equipe sem refresh. */
export function usePendenciasAbertas() {
  return useQuery({
    queryKey: ['pendencias-abertas'],
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    queryFn: async (): Promise<Pendencia[]> => {
      const { data, error } = await supabase
        .from('solicitacao_pendencias')
        .select('*')
        .eq('status', 'aberta')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Pendencia[]
    },
  })
}

/** Pendência aberta de uma solicitação específica (ou null). */
export function usePendenciaAberta(solicitacaoId: string | undefined) {
  return useQuery({
    queryKey: ['pendencia-aberta', solicitacaoId],
    enabled: !!solicitacaoId,
    queryFn: async (): Promise<Pendencia | null> => {
      const { data, error } = await supabase
        .from('solicitacao_pendencias')
        .select('*')
        .eq('solicitacao_id', solicitacaoId as string)
        .eq('status', 'aberta')
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as Pendencia | null
    },
  })
}

/** Resolve uma pendência respondendo à equipe. A RLS só permite a transição
 *  aberta -> resolvida; resolvida_em/por são carimbados por trigger (0035). */
export function useResolverPendencia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, resposta }: { id: string; resposta: string }) => {
      const { error } = await supabase
        .from('solicitacao_pendencias')
        .update({ status: 'resolvida', resposta_parceiro: resposta } as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pendencias-abertas'] })
      qc.invalidateQueries({ queryKey: ['pendencia-aberta'] })
      toast.success('Pendência resolvida. A equipe da LHG foi avisada.')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}
