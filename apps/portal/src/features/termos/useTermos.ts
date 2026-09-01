import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { traduzirErroBanco } from '@/features/cadastros/useParceiroCrud'
import { TERMOS_VERSAO } from '@sislog/shared/termos'

/**
 * O usuário já aceitou a versão ATUAL do termo?
 *
 * A versão entra na chave da query: subir `TERMOS_VERSAO` invalida o cache
 * sozinho e o modal reaparece, sem ninguém precisar lembrar de limpar nada.
 *
 * `staleTime: Infinity` porque a resposta só muda por ação do próprio usuário
 * nesta aba — e quem a muda é a mutação abaixo, que invalida a chave.
 */
export function useAceiteDeTermos(userId: string | null | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['termos-aceite', userId, TERMOS_VERSAO],
    staleTime: Infinity,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('termos_aceite')
        .select('id')
        .eq('user_id', userId as string)
        .eq('versao', TERMOS_VERSAO)
        .maybeSingle()
      if (error) throw error
      return !!data
    },
  })
}

/** Grava o aceite. Ao contrário do registro de acesso (0059), esta espera
 *  resposta: liberar a tela antes de gravar deixaria o modal voltando a cada
 *  carregamento. */
export function useAceitarTermos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('registrar_aceite_termos', {
        p_versao: TERMOS_VERSAO,
      } as never)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['termos-aceite'] })
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}
