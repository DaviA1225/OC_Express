/**
 * Ações da tela "Conversas" do sistema interno que precisam do servidor.
 *
 * O navegador do atendente não tem (nem deve ter) o token da UAZAPI, então
 * responder pelo WhatsApp passa por aqui. O interno chama `/api/agente`, que o
 * `vercel.json` dele reescreve para esta função: mesmo domínio, sem CORS.
 *
 * Autenticação: o JWT do próprio atendente (Authorization: Bearer). Cada ação
 * roda com um cliente Supabase NO NOME DELE — a RLS vale e a auditoria registra
 * quem respondeu ou aprovou, não o agente.
 *
 * Ações:
 *   enviar   { conversa_id, texto }  responde pelo WhatsApp
 *   devolver { conversa_id }         devolve ao agente, que retoma as pendentes
 *   aprovar  { acao_id }             executa um rascunho do modo sombra
 *
 * Assumir, rejeitar rascunho e trocar o modo não precisam de servidor: o
 * interno faz direto pela RLS.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { waitUntil } from '@vercel/functions'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Json } from '@sislog/shared/types'
import { config } from '../src/config'
import { enviarTexto } from '../src/uazapi'
import { processarConversa } from '../src/processar'
import { executarDireto } from '../src/agente/ferramentas'

/** Regra nossa, herdada da Meta: só responder até 24 h depois da última
 *  mensagem do contato. Num número não oficial, puxar conversa fria é o que
 *  mais leva a banimento. */
const JANELA_MS = 24 * 3_600_000

const Corpo = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('enviar'), conversa_id: z.string().uuid(), texto: z.string().trim().min(1).max(4000) }),
  z.object({ acao: z.literal('devolver'), conversa_id: z.string().uuid() }),
  z.object({ acao: z.literal('aprovar'), acao_id: z.string().uuid() }),
])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ erro: 'Sem sessão' })

  const db = createClient(config.supabase.url, config.supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: u, error: eU } = await db.auth.getUser(token)
  if (eU || !u.user) return res.status(401).json({ erro: 'Sessão inválida' })
  const { data: perfil } = await db.from('perfis_usuarios').select('ativo').eq('user_id', u.user.id).maybeSingle()
  if (!perfil?.ativo) return res.status(403).json({ erro: 'Só a equipe interna usa esta tela' })

  const parsed = Corpo.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ erro: 'Pedido inválido' })
  const corpo = parsed.data

  try {
    switch (corpo.acao) {
      case 'enviar':
        return res.status(200).json(await enviar(db, u.user.id, corpo.conversa_id, corpo.texto))
      case 'devolver':
        return res.status(200).json(await devolver(db, corpo.conversa_id))
      case 'aprovar':
        return res.status(200).json(await aprovar(db, u.user.id, corpo.acao_id))
    }
  } catch (e) {
    if (e instanceof ErroPainel) return res.status(e.status).json({ erro: e.message })
    console.error('[painel]', e)
    return res.status(500).json({ erro: 'Falha inesperada' })
  }
}

class ErroPainel extends Error {
  readonly status: number
  constructor(status: number, mensagem: string) {
    super(mensagem)
    this.status = status
  }
}

async function enviar(db: SupabaseClient, userId: string, conversaId: string, texto: string) {
  const [{ data: c }, { data: cfg }] = await Promise.all([
    db.from('agente_conversas').select('id, telefone, sessao, estado, ultima_entrada_em').eq('id', conversaId).maybeSingle(),
    db.from('agente_config').select('modo').eq('id', 1).single(),
  ])
  if (!c) throw new ErroPainel(404, 'Conversa não encontrada')
  // Com o agente ativo, duas vozes respondendo ao mesmo tempo confundem o
  // contato. No modo sombra o agente não fala, então a equipe pode responder.
  if (c.estado !== 'humano' && cfg?.modo !== 'sombra') {
    throw new ErroPainel(409, 'Assuma a conversa antes de responder')
  }
  if (!c.ultima_entrada_em || Date.now() - new Date(c.ultima_entrada_em).getTime() > JANELA_MS) {
    throw new ErroPainel(409, 'Passaram 24 h desde a última mensagem do contato: para proteger o número, só respondemos depois que ele escrever de novo')
  }

  const base = { conversa_id: c.id, sessao: c.sessao, direcao: 'saida', autor: 'humano', tipo: 'texto', texto, enviada_por: userId }
  try {
    const wamid = await enviarTexto(c.telefone, texto)
    await db.from('agente_mensagens').insert({ ...base, wamid: wamid || null, envio: 'enviada' })
    await db.from('agente_conversas').update({ ultima_atividade_em: new Date().toISOString() }).eq('id', c.id)
    return { ok: true }
  } catch (e) {
    await db.from('agente_mensagens').insert({ ...base, envio: 'falhou', erro: e instanceof Error ? e.message.slice(0, 500) : String(e) })
    throw new ErroPainel(502, 'O WhatsApp recusou o envio. A mensagem ficou registrada como falha.')
  }
}

async function devolver(db: SupabaseClient, conversaId: string) {
  const { data, error } = await db
    .from('agente_conversas')
    .update({ estado: 'agente', assumida_por: null, assumida_em: null, updated_at: new Date().toISOString() })
    .eq('id', conversaId)
    .select('id')
    .maybeSingle()
  if (error) throw new ErroPainel(500, error.message)
  if (!data) throw new ErroPainel(404, 'Conversa não encontrada')
  // O agente retoma o que ficou na fila enquanto a conversa estava com a equipe.
  waitUntil(processarConversa(conversaId).catch((e) => console.error('[painel] devolver', e)))
  return { ok: true }
}

async function aprovar(db: SupabaseClient, userId: string, acaoId: string) {
  // Reivindica o rascunho antes de executar: dois cliques (ou dois atendentes)
  // não executam a mesma ação duas vezes.
  const agora = new Date().toISOString()
  const { data: acao } = await db
    .from('agente_acoes')
    .update({ status: 'aprovada', decidido_por: userId, decidido_em: agora })
    .eq('id', acaoId)
    .eq('status', 'rascunho')
    .select('id, conversa_id, ferramenta, entrada')
    .maybeSingle()
  if (!acao) throw new ErroPainel(409, 'Este rascunho já foi decidido')

  const { data: c } = await db.from('agente_conversas').select('telefone, nome_contato').eq('id', acao.conversa_id).single()
  const resultado = await executarDireto(acao.ferramenta, acao.entrada, {
    db,
    conversaId: acao.conversa_id,
    telefone: c?.telefone ?? '',
    nomeContato: c?.nome_contato ?? null,
    usuarioId: userId,
    modo: 'autonomo',
    // Idempotência da solicitação: o mesmo rascunho nunca vira duas.
    ultimoWamid: `rascunho:${acao.id}`,
    transferido: false,
  })
  const falhou = 'erro' in resultado
  await db
    .from('agente_acoes')
    .update({ status: falhou ? 'erro' : 'aprovada', resultado: resultado as Json })
    .eq('id', acao.id)
  return { ok: !falhou, resultado }
}
