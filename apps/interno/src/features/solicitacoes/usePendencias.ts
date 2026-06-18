import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database.types'

export type Pendencia = Tables<'solicitacao_pendencias'>

/** Sinal de pendência por solicitação, para o "pop" no card da lista. */
export type PendenciaSinal = 'aguardando_parceiro' | 'parceiro_respondeu'

/** Pendências que ainda exigem atenção, para marcar os cards da lista:
 *  - 'aguardando_parceiro': aberta (devolvida, esperando o parceiro);
 *  - 'parceiro_respondeu': resolvida e ainda NÃO vista pela equipe.
 *  Retorna um mapa solicitacao_id -> sinal. Faz polling (60s) e é invalidada
 *  pelo realtime de solicitacao_pendencias. */
export function usePendenciasSinais() {
  return useQuery({
    queryKey: ['pendencias', 'sinais'],
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<Map<string, PendenciaSinal>> => {
      const { data, error } = await supabase
        .from('solicitacao_pendencias')
        .select('solicitacao_id, status, vista_equipe_em, created_at')
        .or('status.eq.aberta,and(status.eq.resolvida,vista_equipe_em.is.null)')
        .order('created_at', { ascending: false })
      if (error) throw error
      const map = new Map<string, PendenciaSinal>()
      for (const r of (data ?? []) as Pick<Pendencia, 'solicitacao_id' | 'status' | 'vista_equipe_em'>[]) {
        // 'parceiro_respondeu' (acionável) tem prioridade sobre 'aguardando'.
        const sinal: PendenciaSinal = r.status === 'resolvida' ? 'parceiro_respondeu' : 'aguardando_parceiro'
        const atual = map.get(r.solicitacao_id)
        if (atual !== 'parceiro_respondeu') map.set(r.solicitacao_id, sinal)
      }
      return map
    },
  })
}

/** Marca a resposta do parceiro como vista pela equipe — o pop some para todos
 *  (estado compartilhado, ao contrário do dismiss por usuário do sino). */
export function useMarcarPendenciaVista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (pendenciaId: string) => {
      const { error } = await supabase
        .from('solicitacao_pendencias')
        .update({ vista_equipe_em: new Date().toISOString() } as never)
        .eq('id', pendenciaId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pendencias'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Erro ao marcar como visto'
      toast.error(msg)
    },
  })
}

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
