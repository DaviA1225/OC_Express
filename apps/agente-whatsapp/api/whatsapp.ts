/**
 * Webhook do Meta Cloud API (WhatsApp).
 *
 * - GET  /api/whatsapp  → handshake de verificação (Meta envia `hub.challenge`)
 * - POST /api/whatsapp  → entrega de mensagens (com assinatura HMAC no header)
 *
 * O POST está propositalmente em "stub": apenas valida a assinatura e responde
 * 200 (Meta exige resposta < 5s ou retenta). O processamento real
 * (parse → Claude tool use → INSERT idempotente em `solicitacoes`) entra em
 * iterações seguintes.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from '../src/config'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleVerify(req, res)
  if (req.method === 'POST') return handleInbound(req, res)
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).send('Method Not Allowed')
}

// ── GET: handshake de verificação ───────────────────────────────────────────
// Meta chama com ?hub.mode=subscribe&hub.verify_token=<TOKEN>&hub.challenge=<X>.
// Se o token bate com o nosso, devolvemos o challenge cru (text/plain).
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
// 1. Lê o corpo RAW (precisamos do bytes exatos pra validar HMAC).
// 2. Compara X-Hub-Signature-256 com sha256(APP_SECRET, body) — rejeita se bate
//    não bate.
// 3. ACK 200 imediatamente — Meta retenta se demorar > 5s.
// 4. (próxima iteração) extrai mensagens, dispara processamento async.
async function handleInbound(req: VercelRequest, res: VercelResponse) {
  const raw = await readRawBody(req)

  if (!verifySignature(raw, req.headers['x-hub-signature-256'])) {
    return res.status(401).send('Invalid signature')
  }

  // TODO(próxima iteração): parse do payload + dispatch para o pipeline
  // (Claude → resolver IDs → INSERT idempotente com external_msg_id).
  return res.status(200).json({ ok: true })
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
