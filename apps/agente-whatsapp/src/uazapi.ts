/**
 * WhatsApp pela UAZAPI: leitura do webhook, download de mídia e envio.
 *
 * A UAZAPI não é a API oficial: ela conecta o número como um aparelho
 * vinculado (WhatsApp Web). Três cuidados que a Meta fazia por nós ficam aqui:
 *   - o webhook entrega também o que o próprio número enviou, mensagens de
 *     grupo e Status: sem filtro, o agente responderia a si mesmo em laço;
 *   - parte dos contatos chega só com `@lid`, sem telefone;
 *   - o webhook não é assinado (a prova de origem fica em `api/whatsapp.ts`).
 *
 * Só fala HTTP com a UAZAPI. Nada de regra de negócio aqui.
 */

import { config } from './config'

export type TipoEntrada = 'texto' | 'audio' | 'documento' | 'imagem' | 'outro'

export interface MensagemEntrada {
  /** ID da mensagem no WhatsApp (`messageid`). Deduplica e serve para baixar a mídia. */
  wamid: string
  /** Telefone do contato, só dígitos com DDI (ex.: 5567999991234). */
  telefone: string
  nome: string | null
  /** Quando o contato enviou (não quando o webhook chegou). */
  enviadaEm: Date | null
  tipo: TipoEntrada
  texto: string | null
  midia: { id: string; mime: string; nome: string | null } | null
}

/** Uma chamada do webhook traz um evento; a maioria não é para o agente. */
export type LeituraWebhook = { mensagem: MensagemEntrada } | { ignorado: string }

// Envelope comum (EventType, token...) + `message` e `chat` na raiz. Tipado só
// no que usamos; o resto é ignorado de propósito.
export interface WebhookPayload {
  EventType?: string
  token?: string
  message?: WebhookMessage
  chat?: { phone?: string; wa_chatid?: string; wa_isGroup?: boolean }
}

interface WebhookMessage {
  messageid?: string
  chatid?: string
  sender?: string
  sender_pn?: string | null
  senderName?: string
  fromMe?: boolean
  wasSentByApi?: boolean
  isGroup?: boolean
  messageType?: string
  mediaType?: string
  text?: string
  reaction?: string
  messageTimestamp?: number
  content?: unknown
}

interface ConteudoMidia {
  mimetype?: string
  fileName?: string
  title?: string
  caption?: string
  fileLength?: number | string
}

/** Reação, edição, apagar: mexem numa mensagem antiga, não pedem resposta. */
const TIPOS_IGNORADOS = new Set(['reactionmessage', 'protocolmessage', 'editedmessage', 'pollupdatemessage'])

/** Teto do download: PDF de documento passa longe disso; vídeo nem é baixado. */
const MAX_MIDIA_BYTES = 20 * 1024 * 1024

export function lerWebhook(payload: WebhookPayload): LeituraWebhook {
  if (payload.EventType !== 'messages') return { ignorado: `evento ${payload.EventType ?? '?'}` }
  const m = payload.message
  if (!m?.messageid) return { ignorado: 'sem mensagem' }
  // O filtro do webhook na UAZAPI já corta isso; repetir aqui segura um
  // webhook mal configurado de virar laço de respostas.
  if (m.fromMe || m.wasSentByApi) return { ignorado: 'enviada pelo próprio número' }
  const chat = m.chatid ?? ''
  if (m.isGroup || payload.chat?.wa_isGroup || /@(g\.us|newsletter|broadcast)$/.test(chat)) {
    return { ignorado: 'grupo, canal ou Status' }
  }
  if (m.reaction || TIPOS_IGNORADOS.has((m.messageType ?? '').toLowerCase())) return { ignorado: 'reação ou edição' }

  const telefone =
    telefoneDoJid(m.sender_pn) ??
    telefoneDoJid(chat) ??
    telefoneDoJid(m.sender) ??
    telefoneDoJid(payload.chat?.wa_chatid) ??
    telefoneSolto(payload.chat?.phone)
  if (!telefone) return { ignorado: 'contato sem telefone (só @lid)' }

  const corpo = conteudo(m)
  if (corpo.tipo === 'texto' && !corpo.texto) return { ignorado: 'sem conteúdo' }
  return {
    mensagem: { wamid: m.messageid, telefone, nome: m.senderName?.trim() || null, enviadaEm: instante(m.messageTimestamp), ...corpo },
  }
}

/** "5567999991234@s.whatsapp.net", com ":12" de aparelho ou ".1" de agente →
 *  dígitos. `@lid` não é telefone. */
function telefoneDoJid(jid: string | null | undefined): string | null {
  if (!jid?.endsWith('@s.whatsapp.net')) return null
  return telefoneSolto(jid.split('@')[0]!.split(/[:.]/)[0])
}

function telefoneSolto(valor: string | null | undefined): string | null {
  const digitos = (valor ?? '').replace(/\D/g, '')
  return /^[0-9]{10,15}$/.test(digitos) ? digitos : null
}

/** A doc diz milissegundos; aceita segundos por garantia. */
function instante(ts: number | undefined): Date | null {
  if (!ts || !Number.isFinite(ts)) return null
  return new Date(ts < 1e12 ? ts * 1000 : ts)
}

function lerConteudo(content: unknown): ConteudoMidia {
  // `content` pode vir como objeto ou como JSON serializado.
  if (typeof content === 'string') {
    try {
      const obj: unknown = JSON.parse(content)
      return typeof obj === 'object' && obj !== null ? (obj as ConteudoMidia) : {}
    } catch {
      return {}
    }
  }
  return typeof content === 'object' && content !== null ? (content as ConteudoMidia) : {}
}

function conteudo(m: WebhookMessage): Pick<MensagemEntrada, 'tipo' | 'texto' | 'midia'> {
  const c = lerConteudo(m.content)
  const legenda = (c.caption ?? m.text ?? '').trim() || null
  const tipoMidia = (m.mediaType ?? '').toLowerCase()
  const tipoMsg = m.messageType ?? ''
  const id = m.messageid!

  // Texto primeiro: texto com prévia de link chega com mediaType "url".
  if (tipoMsg === 'Conversation' || tipoMsg === 'ExtendedTextMessage') {
    return { tipo: 'texto', texto: (m.text ?? '').trim(), midia: null }
  }
  if (Number(c.fileLength ?? 0) > MAX_MIDIA_BYTES) {
    return vazio(`arquivo de ${Math.round(Number(c.fileLength) / 1_048_576)} MB (grande demais para abrir)`, legenda)
  }
  if (tipoMidia === 'audio' || tipoMidia === 'ptt' || tipoMsg === 'AudioMessage') {
    return { tipo: 'audio', texto: null, midia: { id, mime: c.mimetype ?? 'audio/ogg', nome: null } }
  }
  if (tipoMidia === 'document' || tipoMsg.startsWith('DocumentMessage') || tipoMsg === 'DocumentWithCaptionMessage') {
    return {
      tipo: 'documento',
      texto: legenda,
      midia: { id, mime: c.mimetype ?? 'application/octet-stream', nome: c.fileName ?? c.title ?? null },
    }
  }
  if (tipoMidia === 'image' || tipoMsg === 'ImageMessage') {
    return { tipo: 'imagem', texto: legenda, midia: { id, mime: c.mimetype ?? 'image/jpeg', nome: null } }
  }
  // Vídeo, figurinha, localização, contato: o agente avisa que não lê.
  if (
    ['video', 'ptv', 'gif', 'sticker', 'location', 'livelocation', 'vcard', 'contact_array'].includes(tipoMidia) ||
    /^(Video|Sticker|Location|LiveLocation|Contact|ContactsArray)Message$/.test(tipoMsg)
  ) {
    return vazio(tipoMidia || tipoMsg, legenda)
  }
  // Resposta de botão ou de lista e o que mais vier com texto: tudo em `text`.
  return { tipo: 'texto', texto: (m.text ?? '').trim(), midia: null }
}

function vazio(tipoOriginal: string, legenda: string | null): Pick<MensagemEntrada, 'tipo' | 'texto' | 'midia'> {
  const aviso = `[mensagem do tipo "${tipoOriginal}" não suportada]`
  return { tipo: 'outro', texto: legenda ? `${aviso} Legenda: ${legenda}` : aviso, midia: null }
}

async function api(rota: string, corpo: unknown, timeoutMs = 20_000): Promise<Response> {
  const res = await fetch(`${config.uazapi.url}/${rota}`, {
    method: 'POST',
    headers: { token: config.uazapi.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const texto = await res.text().catch(() => '')
    throw new Error(`[uazapi] POST /${rota} → ${res.status} ${texto.slice(0, 300)}`)
  }
  return res
}

/** Baixa a mídia: a UAZAPI devolve uma URL pública (vale 2 dias) e daí vêm os
 *  bytes. Áudio sai em MP3, que toca em qualquer navegador da tela Conversas. */
export async function baixarMidia(messageId: string): Promise<{ bytes: Buffer; mime: string }> {
  const r = (await (await api('message/download', { id: messageId }, 60_000)).json()) as { fileURL?: string; mimetype?: string }
  if (!r.fileURL) throw new Error('[uazapi] download sem fileURL')
  const res = await fetch(r.fileURL, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok || !res.body) throw new Error(`[uazapi] download de mídia → ${res.status}`)
  // Lê em pedaços e para no teto: sem content-length, um arquivo enorme não
  // chega a ocupar a memória toda.
  const partes: Uint8Array[] = []
  let total = 0
  const leitor = res.body.getReader()
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    total += value.length
    if (total > MAX_MIDIA_BYTES) {
      await leitor.cancel()
      throw new Error('[uazapi] arquivo maior que 20 MB')
    }
    partes.push(value)
  }
  return { bytes: Buffer.concat(partes), mime: r.mimetype ?? res.headers.get('content-type') ?? 'application/octet-stream' }
}

/** Envia texto. O "digitando..." antes do envio deixa o ritmo parecido com o
 *  de uma pessoa, que é o que o WhatsApp espera de um número comum. */
export async function enviarTexto(telefone: string, texto: string): Promise<string> {
  const res = await api('send/text', {
    number: telefone,
    text: texto,
    linkPreview: false,
    delay: Math.min(4000, 800 + texto.length * 20),
    readchat: true,
  })
  const json = (await res.json()) as { messageid?: string }
  return json.messageid ?? ''
}

/** Marca como lidas (os dois tiques azuis). Falha ou demora aqui não importa:
 *  timeout curto para não segurar a resposta. */
export async function marcarLidas(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return
  await api('message/markread', { id: messageIds }, 5_000).catch(() => undefined)
}
