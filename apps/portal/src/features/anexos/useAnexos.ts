import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { registrarAcesso } from '@/lib/acesso'
import { traduzirErroBanco } from '@/features/cadastros/useParceiroCrud'
import type { Tables } from '@sislog/shared/types'

export const ANEXOS_BUCKET = 'solicitacoes-anexos'
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const ACCEPTED_MIME_PREFIXES = ['image/', 'application/pdf']

export type Anexo = Tables<'solicitacao_anexos'>

export function isMimeAccepted(mime: string): boolean {
  return ACCEPTED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))
}

function buildStoragePath(solicitacaoId: string, file: File): string {
  // Convencao: o primeiro segmento e o solicitacao_id. A RLS do bucket usa
  // esse prefixo para autorizar o parceiro a ler/escrever apenas anexos das
  // proprias solicitacoes (ver migration 0020).
  const ts = Date.now()
  const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(0, 80)
  return `${solicitacaoId}/${ts}_${safeName}`
}

/** Sobe um arquivo para o storage e grava o metadado em `solicitacao_anexos`.
 *  Versao "muda" — sem toast — para uso em fluxos em lote (Nova solicitacao).
 *  Lanca em caso de erro. */
export async function uploadAnexoFile(solicitacaoId: string, file: File): Promise<Anexo> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`"${file.name}" excede o limite de ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)}MB.`)
  }
  if (file.type && !isMimeAccepted(file.type)) {
    throw new Error(`"${file.name}": tipo nao suportado. Aceita imagens e PDF.`)
  }

  const path = buildStoragePath(solicitacaoId, file)
  const { error: upErr } = await supabase.storage
    .from(ANEXOS_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (upErr) throw upErr

  const { data: userData } = await supabase.auth.getUser()
  const uploaded_by = userData.user?.id ?? null

  const { data, error } = await supabase
    .from('solicitacao_anexos')
    .insert({
      solicitacao_id: solicitacaoId,
      filename: file.name,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by,
    } as never)
    .select('*')
    .single()
  if (error) {
    // Limpa o objeto orfao no storage se a insercao do metadado falhar.
    await supabase.storage.from(ANEXOS_BUCKET).remove([path])
    throw error
  }
  return data as Anexo
}

export function useAnexos(solicitacaoId: string | null | undefined) {
  return useQuery({
    enabled: !!solicitacaoId,
    queryKey: ['anexos', solicitacaoId],
    queryFn: async (): Promise<Anexo[]> => {
      const { data, error } = await supabase
        .from('solicitacao_anexos')
        .select('*')
        .eq('solicitacao_id', solicitacaoId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Anexo[]
    },
  })
}

export function useUploadAnexo() {
  const qc = useQueryClient()
  return useMutation<Anexo, unknown, { solicitacaoId: string; file: File }>({
    mutationFn: ({ solicitacaoId, file }) => uploadAnexoFile(solicitacaoId, file),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['anexos', vars.solicitacaoId] })
      toast.success('Anexo adicionado')
    },
    onError: (e: unknown) => {
      const message = e instanceof Error ? e.message : traduzirErroBanco(e)
      toast.error(message)
    },
  })
}

export function useDeleteAnexo() {
  const qc = useQueryClient()
  return useMutation<{ id: string; solicitacaoId: string }, unknown, { anexo: Anexo }>({
    mutationFn: async ({ anexo }) => {
      // Linha primeiro, arquivo depois — mesma ordem do app interno.
      //
      // O portal fazia o inverso (arquivo, depois linha). Nessa ordem, uma
      // falha no DELETE do banco — RLS, rede — deixava o arquivo já apagado e
      // a linha apontando para o vazio: um anexo que aparece na lista e não
      // abre. É exatamente o defeito que o app interno já tinha corrigido, e
      // o portal seguia com a versão antiga.
      //
      // Nesta ordem o pior caso é um arquivo órfão no bucket, que não quebra
      // nada para o usuário — e que desde a migration 0060 deixa de ser
      // silencioso: a trigger abre uma pendência em storage_remocao_pendente e
      // a baixa abaixo só fecha o que foi de fato removido.
      const { error } = await supabase.from('solicitacao_anexos').delete().eq('id', anexo.id)
      if (error) throw error

      const { error: rmErr } = await supabase.storage
        .from(ANEXOS_BUCKET)
        .remove([anexo.storage_path])

      // Baixa na fila aberta pela trigger: fecha se removeu, guarda o motivo
      // se falhou. Passar `rmErr?.message` em vez de null é o que faz a
      // pendência continuar aberta e aparecer na varredura de órfãos.
      const baixa = { p_path: anexo.storage_path, p_erro: rmErr?.message ?? null } as never
      void supabase.rpc('marcar_storage_removido', baixa).then(({ error: baixaErr }) => {
        if (baixaErr) console.warn('[anexos] baixa da fila de remocao falhou', baixaErr.message)
      })

      if (rmErr) {
        // A linha já foi embora: para o usuário o anexo sumiu, que era a
        // intenção. Não vira erro — o registro fica na fila da 0060.
        console.warn('[anexos] linha removida, arquivo permaneceu no bucket', anexo.storage_path, rmErr)
      }

      return { id: anexo.id, solicitacaoId: anexo.solicitacao_id }
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['anexos', res.solicitacaoId] })
      toast.success('Anexo removido')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

export async function getAnexoSignedUrl(storagePath: string, expiresInSec = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from(ANEXOS_BUCKET)
    .createSignedUrl(storagePath, expiresInSec)
  if (error) throw error

  // Registro de acesso (LGPD art. 37). No portal a `registrar_acesso` grava
  // origem='portal', derivada no servidor — dá para separar o que a equipe
  // interna abriu do que o parceiro abriu.
  registrarAcesso('abrir_anexo', storagePath, { expira_em_seg: expiresInSec })

  return data.signedUrl
}
