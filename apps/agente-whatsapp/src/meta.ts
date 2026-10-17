/**
 * WhatsApp Cloud API (Meta): leitura do webhook, download de mídia e envio.
 *
 * Só fala HTTP com a Graph API. Nada de regra de negócio aqui.
 */

import { config } from './config'

const GRAPH = `https://graph.facebook.com/${config.meta.graphVersion}`

export type TipoEntrada = 'texto' | 'audio' | 'documento' | 'imagem' | 'outro'

export interface MensagemEntrada {
  wamid: string
  /** Telefone do contato, só dígitos com DDI (ex.: 5567999991234). */
  telefone: string
  nome: string | null
  tipo: TipoEntrada
  texto: string | null
  midia: { id: string; mime: string; nome: string | null } | null
}

// Formato do webhook: entry[].changes[].value.{contacts[], messages[]}.
// Tipado só no que usamos; o resto é ignorado de propósito.
interface WebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>
        messages?: Array<WebhookMessage>
      }
    }>
  }>
}

interface WebhookMessage {
  id: string
  from: string
  type: string
  text?: { body?: string }
  audio?: { id: string; mime_type: string }
  voice?: { id: string; mime_type: string }
  document?: { id: string; mime_type: string; filename?: string; caption?: string }
  image?: { id: string; mime_type: string; caption?: string }
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }
  button?: { text?: string }
}

/** Extrai as mensagens de um webhook. Eventos de status (entregue, lida) não
 *  trazem `messages` e caem fora sozinhos. */
export function lerWebhook(body: unknown): MensagemEntrada[] {
  const payload = body as WebhookPayload
  const saida: MensagemEntrada[] = []
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value?.messages) continue
      const nomes = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]))
      for (const m of value.messages) {
        const telefone = (m.from ?? '').replace(/\D/g, '')
        if (!m.id || !telefone) continue
        saida.push({ wamid: m.id, telefone, nome: nomes.get(m.from) ?? null, ...conteudo(m) })
      }
    }
  }
  return saida
}

function conteudo(m: WebhookMessage): Pick<MensagemEntrada, 'tipo' | 'texto' | 'midia'> {
  switch (m.type) {
    case 'text':
      return { tipo: 'texto', texto: m.text?.body ?? '', midia: null }
    case 'audio':
    case 'voice': {
      const a = m.audio ?? m.voice
      return a ? { tipo: 'audio', texto: null, midia: { id: a.id, mime: a.mime_type, nome: null } } : vazio(m.type)
    }
    case 'document':
      return m.document
        ? {
            tipo: 'documento',
            texto: m.document.caption ?? null,
            midia: { id: m.document.id, mime: m.document.mime_type, nome: m.document.filename ?? null },
          }
        : vazio(m.type)
    case 'image':
      return m.image
        ? { tipo: 'imagem', texto: m.image.caption ?? null, midia: { id: m.image.id, mime: m.image.mime_type, nome: null } }
        : vazio(m.type)
    case 'interactive':
      return {
        tipo: 'texto',
        texto: m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '',
        midia: null,
      }
    case 'button':
      return { tipo: 'texto', texto: m.button?.text ?? '', midia: null }
    default:
      return vazio(m.type)
  }
}

function vazio(tipoOriginal: string): Pick<MensagemEntrada, 'tipo' | 'texto' | 'midia'> {
  return { tipo: 'outro', texto: `[mensagem do tipo "${tipoOriginal}" não suportada]`, midia: null }
}

async function graph(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${GRAPH}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.meta.waToken}`, ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const corpo = await res.text().catch(() => '')
    throw new Error(`[meta] ${init?.method ?? 'GET'} ${path} → ${res.status} ${corpo.slice(0, 300)}`)
  }
  return res
}

/** Baixa a mídia: primeiro a URL temporária pelo id, depois os bytes (a URL
 *  também exige o token). */
export async function baixarMidia(mediaId: string): Promise<{ bytes: Buffer; mime: string }> {
  const meta = (await (await graph(mediaId)).json()) as { url: string; mime_type: string }
  const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${config.meta.waToken}` } })
  if (!res.ok) throw new Error(`[meta] download de mídia → ${res.status}`)
  return { bytes: Buffer.from(await res.arrayBuffer()), mime: meta.mime_type }
}

/** Envia texto livre. Só funciona dentro da janela de 24 h desde a última
 *  mensagem do contato; fora dela a Meta recusa e é preciso modelo aprovado. */
export async function enviarTexto(telefone: string, texto: string): Promise<string> {
  const res = await graph(`${config.meta.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefone,
      type: 'text',
      text: { body: texto, preview_url: false },
    }),
  })
  const json = (await res.json()) as { messages?: Array<{ id: string }> }
  return json.messages?.[0]?.id ?? ''
}

/** Marca como lida (os dois tiques azuis). Falha aqui não importa. */
export async function marcarLida(wamid: string): Promise<void> {
  await graph(`${config.meta.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: wamid }),
  }).catch(() => undefined)
}
