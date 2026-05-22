import { supabase } from '@/lib/supabase'

export const OCS_PDF_BUCKET = 'ocs-pdf'

/** 7 dias em segundos — validade do link do PDF enviado por WhatsApp. */
export const OC_PDF_WHATSAPP_EXPIRES = 60 * 60 * 24 * 7
/** 1 hora — validade do link aberto pelo time interno. */
export const OC_PDF_INTERNO_EXPIRES = 60 * 60

/**
 * Extrai o path do arquivo no bucket a partir do valor guardado em
 * `solicitacoes.pdf_url`. Registros novos guardam só o path (ex.:
 * "OC_0287_20260522.pdf"); registros antigos (bucket público) guardam a URL
 * pública completa (".../object/public/ocs-pdf/OC_0287_20260522.pdf"). Esta
 * função normaliza os dois casos para o path puro.
 */
export function ocPdfStoragePath(stored: string): string {
  const marker = '/ocs-pdf/'
  const i = stored.indexOf(marker)
  const path = i >= 0 ? stored.slice(i + marker.length) : stored
  return decodeURIComponent(path.split('?')[0])
}

/**
 * Gera uma signed URL temporária para o PDF da OC. Requer que o usuário seja
 * interno (policy do bucket privado, migration 0026).
 */
export async function getOcPdfSignedUrl(
  stored: string,
  expiresInSec: number = OC_PDF_INTERNO_EXPIRES,
): Promise<string> {
  const path = ocPdfStoragePath(stored)
  const { data, error } = await supabase.storage
    .from(OCS_PDF_BUCKET)
    .createSignedUrl(path, expiresInSec)
  if (error) throw error
  return data.signedUrl
}
