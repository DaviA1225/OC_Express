/**
 * Webhook da UAZAPI (WhatsApp).
 *
 * POST /api/whatsapp → um evento por chamada (`EventType` + `message`).
 *
 * A UAZAPI não assina o webhook como a Meta fazia. A prova de origem é o
 * `token` da instância que vem no corpo: só a UAZAPI e nós o conhecemos. Sem
 * essa conferência, quem descobrisse a URL mandaria "mensagens" com o telefone
 * de qualquer motorista.
 *
 * O POST faz só o mínimo: confere o token, grava a mensagem (idempotente pelo
 * `wamid`) e responde 200. O atendimento em si roda depois, em `waitUntil`.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { waitUntil } from '@vercel/functions'
import { createHash, timingSafeEqual } from 'node:crypto'
import { config } from '../src/config'
import { lerWebhook, type MensagemEntrada, type WebhookPayload } from '../src/uazapi'
import { getAgentClient } from '../src/supabase'
import { processarConversa } from '../src/processar'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).send('Method Not Allowed')
  }

  const payload = lerCorpo(req.body)
  if (!payload || !tokenConfere(payload.token)) return res.status(401).send('Unauthorized')

  const leitura = lerWebhook(payload)
  if ('ignorado' in leitura) {
    if (leitura.ignorado.includes('@lid')) console.warn('[webhook] mensagem ignorada: contato sem telefone (@lid)')
    return res.status(200).json({ ok: true, ignorado: leitura.ignorado })
  }

  // Se gravar falhar, devolvemos 500: a falha aparece em /webhook/errors da
  // UAZAPI. Ela não garante reentrega como a Meta; o `wamid` único segura a
  // duplicata se reentregar.
  const m = leitura.mensagem
  const atrasoMin = m.enviadaEm ? (Date.now() - m.enviadaEm.getTime()) / 60_000 : 0
  const atrasada = atrasoMin > config.agente.maxAtrasoMin

  let conversaId: string
  try {
    conversaId = await gravarEntrada(m, atrasada)
  } catch (e) {
    console.error('[webhook] falha ao gravar', e)
    return res.status(500).json({ ok: false })
  }

  // Atrasada: fica guardada (a equipe vê) e entra junto quando o contato
  // escrever de novo, mas não dispara resposta agora.
  if (atrasada) console.warn(`[webhook] mensagem com ${formatarAtraso(atrasoMin)} de atraso: guardada sem resposta`)
  else waitUntil(processarConversa(conversaId).catch((e) => console.error('[agente]', conversaId, e)))
  return res.status(200).json({ ok: true, ...(atrasada ? { atrasada: true } : {}) })
}

async function gravarEntrada(m: MensagemEntrada, atrasada: boolean): Promise<string> {
  const db = await getAgentClient()
  const agora = new Date().toISOString()
  const { data: conversa, error: eC } = await db
    .from('agente_conversas')
    .upsert(
      // Sem nome no payload, não apaga o nome que já temos. Mensagem atrasada
      // marca a hora em que foi escrita: a janela de 24 h conta dali.
      {
        telefone: m.telefone,
        ...(m.nome ? { nome_contato: m.nome } : {}),
        ...(atrasada
          ? { ultima_entrada_em: (m.enviadaEm ?? new Date()).toISOString() }
          : { ultima_entrada_em: agora, ultima_atividade_em: agora }),
      },
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
    // A coluna nasceu com a Meta; guarda o id que o provedor pede para baixar a mídia.
    meta_media_id: m.midia?.id ?? null,
    midia_mime: m.midia?.mime ?? null,
    midia_nome: m.midia?.nome ?? null,
  })
  // 23505 = reentrega de uma mensagem que já temos. Tudo certo.
  if (eM && eM.code !== '23505') throw new Error(`mensagem ${m.wamid}: ${eM.message}`)
  return conversa.id
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatarAtraso(min: number): string {
  if (min < 120) return `${Math.round(min)} min`
  if (min < 48 * 60) return `${Math.round(min / 60)} h`
  return `${Math.round(min / 1440)} dias`
}

function lerCorpo(body: unknown): WebhookPayload | null {
  try {
    if (typeof body === 'string') return JSON.parse(body) as WebhookPayload
    if (Buffer.isBuffer(body)) return JSON.parse(body.toString('utf8')) as WebhookPayload
    return typeof body === 'object' && body !== null ? (body as WebhookPayload) : null
  } catch {
    return null
  }
}

/** Compara pelo hash: mesmo tamanho sempre, e o tempo não denuncia o token. */
function tokenConfere(recebido: unknown): boolean {
  if (typeof recebido !== 'string' || recebido === '') return false
  const a = createHash('sha256').update(recebido).digest()
  const b = createHash('sha256').update(config.uazapi.token).digest()
  return timingSafeEqual(a, b)
}
