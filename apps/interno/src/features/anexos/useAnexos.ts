import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { traduzirErroBanco } from '@/features/crud/useCrudQueries'
import type { Tables } from '@/types/database.types'

export const ANEXOS_BUCKET = 'solicitacoes-anexos'
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const ACCEPTED_MIME_PREFIXES = ['image/', 'application/pdf']

export type Anexo = Tables<'solicitacao_anexos'>

function isMimeAccepted(mime: string): boolean {
  return ACCEPTED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))
}

function buildStoragePath(solicitacaoId: string, file: File): string {
  const ts = Date.now()
  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 80)
  return `${solicitacaoId}/${ts}_${safeName}`
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
    mutationFn: async ({ solicitacaoId, file }) => {
      if (file.size > MAX_FILE_BYTES) {
        throw new Error(`Arquivo excede o limite de ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)}MB.`)
      }
      if (file.type && !isMimeAccepted(file.type)) {
        throw new Error('Tipo não suportado. Aceita imagens e PDF.')
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
        await supabase.storage.from(ANEXOS_BUCKET).remove([path])
        throw error
      }
      return data as Anexo
    },
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
      const { error: rmErr } = await supabase.storage
        .from(ANEXOS_BUCKET)
        .remove([anexo.storage_path])
      if (rmErr) throw rmErr
      const { error } = await supabase.from('solicitacao_anexos').delete().eq('id', anexo.id)
      if (error) throw error
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
  return data.signedUrl
}
