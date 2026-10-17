/**
 * Mídia recebida: guarda no bucket privado, transcreve áudio e sobe PDF/imagem
 * para a Files API da Anthropic.
 *
 * Por que a Files API e não base64 no histórico: o histórico da conversa vai
 * inteiro em cada chamada ao modelo. Um PDF de 2 MB em base64 seria reenviado a
 * cada turno; por id ele entra uma vez e o cache de prompt cuida do resto.
 */

import Anthropic, { toFile as toFileAnthropic } from '@anthropic-ai/sdk'
import OpenAI, { toFile as toFileOpenAI } from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { config } from './config'

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey })
const openai = new OpenAI({ apiKey: config.openai.apiKey })

/** Arquivos na Anthropic expiram sozinhos: o que fica guardado de verdade é o
 *  bucket do SisLog. 7 dias cobrem com folga uma sessão de conversa. */
const EXPIRA_ANTHROPIC_S = 7 * 24 * 3600

const EXTENSAO: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** MIME sem parâmetros: a Meta manda "audio/ogg; codecs=opus". */
export function mimeBase(mime: string): string {
  return mime.split(';')[0]!.trim().toLowerCase()
}

export async function guardarNoBucket(
  db: SupabaseClient,
  conversaId: string,
  wamid: string,
  bytes: Buffer,
  mime: string,
): Promise<string> {
  const ext = EXTENSAO[mimeBase(mime)] ?? 'bin'
  const path = `${conversaId}/${wamid.replace(/[^A-Za-z0-9_-]/g, '_')}.${ext}`
  const { error } = await db.storage
    .from('agente-midia')
    .upload(path, bytes, { contentType: mimeBase(mime), upsert: true })
  if (error) throw new Error(`[midia] upload no bucket: ${error.message}`)
  return path
}

/**
 * Áudio → texto. O Claude não recebe áudio, então a transcrição entra no
 * histórico como texto. O `prompt` dá ao transcritor o vocabulário da
 * operação: sem ele, "Tupacery" vira "tu pá serei" e placa vira número solto.
 */
export async function transcrever(bytes: Buffer, mime: string): Promise<string> {
  const ext = EXTENSAO[mimeBase(mime)] ?? 'ogg'
  const r = await openai.audio.transcriptions.create({
    file: await toFileOpenAI(bytes, `audio.${ext}`, { type: mimeBase(mime) }),
    model: config.openai.transcribeModel,
    language: 'pt',
    prompt:
      'Transportadora de minério. Termos comuns: ordem de carregamento, OC, placa, cavalo, carreta, ' +
      'bitrem, rodotrem, caçamba, graneleiro, minério, sinter, hematita, lump, Tupacery, Urucum, ' +
      'Corumbá, CPF, motorista, subcontratada, Pamcard.',
  })
  return r.text.trim()
}

/** PDF ou imagem → Files API. Devolve o file_id para o bloco de conteúdo. */
export async function subirParaAnthropic(bytes: Buffer, mime: string, nome: string | null): Promise<string> {
  const ext = EXTENSAO[mimeBase(mime)] ?? 'bin'
  const arquivo = await anthropic.files.upload({
    file: await toFileAnthropic(bytes, nome ?? `arquivo.${ext}`, { type: mimeBase(mime) }),
    expires_in_seconds: EXPIRA_ANTHROPIC_S,
  })
  return arquivo.id
}

export function ehPdf(mime: string): boolean {
  return mimeBase(mime) === 'application/pdf'
}

export function ehImagemSuportada(mime: string): boolean {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeBase(mime))
}
