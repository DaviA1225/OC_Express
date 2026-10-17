/**
 * Webhook do Meta Cloud API (WhatsApp).
 *
 * - GET  /api/whatsapp  → handshake de verificação (Meta envia `hub.challenge`)
 * - POST /api/whatsapp  → entrega de mensagens (com assinatura HMAC no header)
 *
 * O POST faz só o mínimo dentro dos 5 s que a Meta espera: valida a
 * assinatura, grava cada mensagem (idempotente pelo `wamid`) e responde 200.
 * O atendimento em si roda depois da resposta, em `waitUntil`.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { waitUntil } from '@vercel/functions'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from '../src/config'
import { lerWebhook, marcarLida, type MensagemEntrada } from '../src/meta'
import { getAgentClient } from '../src/supabase'
import { processarConversa } from '../src/processar'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleVerify(req, res)
  if (req.method === 'POST') return handleInbound(req, res)
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).send('Method Not Allowed')
}

// ── GET: handshake de verificação ───────────────────────────────────────────
function handleVerify(req: VercelRequest, res: VercelResponse) {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === config.meta.verifyToken && typeof challenge === 'string') {
    res.setHeader('Content-Type', 'text/plain')
    return res.status(200).send(challenge)
  }

  return res.status(403).send('Forbidden')
}

// ── POST: entrega de eventos ────────────────────────────────────────────────
async function handleInbound(req: VercelRequest, res: VercelResponse) {
  const raw = await readRawBody(req)

  if (!verifySignature(raw, req.headers['x-hub-signature-256'])) {
    return res.status(401).send('Invalid signature')
  }

  let mensagens: MensagemEntrada[]
  try {
    mensagens = lerWebhook(JSON.parse(raw.toString('utf8')))
  } catch {
    return res.status(200).json({ ok: true, ignorado: 'payload ilegível' })
  }
  if (mensagens.length === 0) return res.status(200).json({ ok: true })

  // Se gravar falhar, devolvemos 500 para a Meta reentregar: perder mensagem é
  // pior que recebê-la duas vezes (o `wamid` único segura a duplicata).
  let conversas: Set<string>
  try {
    conversas = await gravarEntradas(mensagens)
  } catch (e) {
    console.error('[webhook] falha ao gravar', e)
    return res.status(500).json({ ok: false })
  }

  for (const id of conversas) waitUntil(processarConversa(id).catch((e) => console.error('[agente]', id, e)))
  for (const m of mensagens) waitUntil(marcarLida(m.wamid))

  return res.status(200).json({ ok: true })
}

async function gravarEntradas(mensagens: MensagemEntrada[]): Promise<Set<string>> {
  const db = await getAgentClient()
  const conversas = new Set<string>()
  for (const m of mensagens) {
    const agora = new Date().toISOString()
    const { data: conversa, error: eC } = await db
      .from('agente_conversas')
      .upsert(
        // Sem nome no payload, não apaga o nome que já temos.
        { telefone: m.telefone, ...(m.nome ? { nome_contato: m.nome } : {}), ultima_entrada_em: agora, ultima_atividade_em: agora },
        { onConflict: 'telefone' },
      )
      .select('id, sessao')
      .single()
    if (eC || !conversa) throw new Error(`conversa ${m.telefone}: ${eC?.message}`)

    const { error: eM } = await db.from('agente_mensagens').insert({
      conversa_id: conversa.id,
      sessao: conversa.sessao,
      direcao: 'entrada',
      autor: 'contato',
      wamid: m.wamid,
      tipo: m.tipo,
      texto: m.texto,
      meta_media_id: m.midia?.id ?? null,
      midia_mime: m.midia?.mime ?? null,
      midia_nome: m.midia?.nome ?? null,
    })
    // 23505 = a Meta reentregou uma mensagem que já temos. Tudo certo.
    if (eM && eM.code !== '23505') throw new Error(`mensagem ${m.wamid}: ${eM.message}`)
    conversas.add(conversa.id)
  }
  return conversas
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function verifySignature(raw: Buffer, header: string | string[] | undefined): boolean {
  if (typeof header !== 'string' || !header.startsWith('sha256=')) return false
  const expected = createHmac('sha256', config.meta.appSecret).update(raw).digest('hex')
  const received = header.slice('sha256='.length)
  if (expected.length !== received.length) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
}
