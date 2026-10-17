/**
 * Orquestração de uma conversa: espera a rajada de mensagens acabar, pega o
 * cadeado da conversa, prepara a mídia, roda o agente e responde.
 *
 * Roda depois que o webhook já respondeu 200 à Meta (via `waitUntil`), então o
 * tempo aqui não conta contra os 5 s da Meta.
 *
 * Garantias:
 *   - Uma conversa é processada por uma execução por vez (cadeado no banco).
 *     Mensagens que chegam durante o processamento entram na volta seguinte.
 *   - Cada mensagem recebida é entregue ao agente uma vez só (`processada`).
 *   - O histórico só cresce; uma volta interrompida deixa o histórico
 *     consistente para a próxima (ver `fecharFerramentasPendentes`).
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@sislog/shared/types'
import { config } from './config'
import { getAgentClient } from './supabase'
import { baixarMidia, enviarTexto } from './meta'
import { ehImagemSuportada, ehPdf, guardarNoBucket, mimeBase, subirParaAnthropic, transcrever } from './midia'
import { rodarCiclo, type Mensagem } from './agente/loop'
import type { ContextoFerramenta } from './agente/ferramentas'

type Db = SupabaseClient
type MensagemRow = Database['public']['Tables']['agente_mensagens']['Row']
type ConversaRow = Database['public']['Tables']['agente_conversas']['Row']

/** Tempo do cadeado. Renovado a cada volta; se a execução morrer, expira. */
const CADEADO_S = 240

const AVISO_FALHA =
  'Tive um problema para concluir seu atendimento agora. Já chamei um atendente da equipe, ' +
  'que continua com você por aqui.'

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function processarConversa(conversaId: string): Promise<void> {
  const db = await getAgentClient()

  await esperarRajadaAcabar(db, conversaId)

  const { data: pegou } = await db.rpc('agente_reivindicar_conversa', { p_conversa_id: conversaId, p_segundos: CADEADO_S })
  if (!pegou) return // outra execução já está nesta conversa e vai ver as mensagens novas

  try {
    // Volta enquanto houver mensagem nova: quem escreveu durante o
    // processamento é atendido na sequência, pela mesma execução.
    for (let rodada = 0; rodada < 5; rodada++) {
      const atendeu = await umaRodada(db, conversaId)
      if (!atendeu) break
      await db.rpc('agente_reivindicar_conversa', { p_conversa_id: conversaId, p_segundos: CADEADO_S })
    }
  } finally {
    await db.from('agente_conversas').update({ processando_ate: null }).eq('id', conversaId)
  }
}

/** Espera até a última mensagem pendente ter `debounceMs` de idade. */
async function esperarRajadaAcabar(db: Db, conversaId: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const { data } = await db
      .from('agente_mensagens')
      .select('created_at')
      .eq('conversa_id', conversaId)
      .eq('direcao', 'entrada')
      .eq('processada', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return
    const falta = config.agente.debounceMs - (Date.now() - new Date(data.created_at).getTime())
    if (falta <= 0) return
    await dormir(Math.min(falta, config.agente.debounceMs))
  }
}

/** Processa as mensagens pendentes. Devolve false se não havia nada. */
async function umaRodada(db: Db, conversaId: string): Promise<boolean> {
  const { data: modoRow } = await db.from('agente_config').select('modo').eq('id', 1).single()
  const modo = modoRow?.modo ?? 'desligado'

  const { data: conversaAtual, error: eConv } = await db.from('agente_conversas').select('*').eq('id', conversaId).single()
  if (eConv || !conversaAtual) throw new Error(`[processar] conversa ${conversaId}: ${eConv?.message}`)

  const { data: pendentes } = await db
    .from('agente_mensagens')
    .select('*')
    .eq('conversa_id', conversaId)
    .eq('direcao', 'entrada')
    .eq('processada', false)
    .order('created_at')
  if (!pendentes?.length) return false

  // Agente desligado: as mensagens ficam guardadas (a equipe vê na tela de
  // Conversas) e saem da fila. Sem isso, ao religar, o agente responderia a
  // um acúmulo de mensagens velhas.
  if (modo === 'desligado') {
    await db.from('agente_mensagens').update({ processada: true }).in('id', pendentes.map((m: { id: string }) => m.id))
    return false
  }
  // Conversa com humano: as mensagens ficam na fila. Quando a equipe devolver
  // a conversa ao agente, ele recebe tudo junto com o que o atendente disse.
  if (conversaAtual.estado === 'humano') return false

  const conversa = await talvezNovaSessao(db, conversaAtual)

  for (const m of pendentes) await prepararMidia(db, m)
  const { data: prontas } = await db.from('agente_mensagens').select('*').in('id', pendentes.map((m) => m.id)).order('created_at')

  const historico = await carregarHistorico(db, conversa)
  const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [
    ...fecharFerramentasPendentes(historico),
    { type: 'text', text: await cabecalho(db, conversa, historico.length === 0) },
    ...(prontas ?? []).flatMap(blocosDaMensagem),
  ]
  const entrada: Mensagem = { role: 'user', content: conteudo }

  let seq = historico.length
  const gravar = async (m: Mensagem) => {
    const { error } = await db.from('agente_historico').insert({
      conversa_id: conversa.id,
      sessao: conversa.sessao,
      seq: seq++,
      role: m.role,
      content: m.content as unknown as Json,
    })
    if (error) throw new Error(`[processar] gravar histórico: ${error.message}`)
  }

  // Grava o turno e marca as mensagens como entregues juntos: daqui em diante
  // elas fazem parte da conversa do agente, aconteça o que acontecer.
  await gravar(entrada)
  await db.from('agente_mensagens').update({ processada: true }).in('id', pendentes.map((m) => m.id))

  const ctx: ContextoFerramenta = {
    db,
    conversaId: conversa.id,
    telefone: conversa.telefone,
    nomeContato: conversa.nome_contato,
    modo: modo === 'sombra' ? 'sombra' : 'autonomo',
    ultimoWamid: pendentes[pendentes.length - 1]?.wamid ?? null,
    transferido: false,
  }

  let resposta: string | null
  let anomalia: string | null
  try {
    ;({ resposta, anomalia } = await rodarCiclo([...historico, entrada], ctx, gravar))
  } catch (e) {
    resposta = null
    anomalia = `exceção: ${e instanceof Error ? e.message : String(e)}`
  }

  if (anomalia) {
    console.error(`[agente] conversa ${conversa.id}: ${anomalia}`)
    if (!ctx.transferido) {
      await db.from('agente_conversas').update({ estado: 'humano' }).eq('id', conversa.id)
      await db.from('agente_acoes').insert({
        conversa_id: conversa.id,
        ferramenta: 'transferir_para_humano',
        entrada: { motivo: `Falha automática do agente: ${anomalia}` },
        status: 'executada',
      })
    }
    if (!resposta) resposta = AVISO_FALHA
  }

  if (resposta) await responder(db, conversa, resposta, ctx.modo)

  await db.from('agente_conversas').update({ ultima_atividade_em: new Date().toISOString() }).eq('id', conversa.id)
  return true
}

/** Conversa parada há horas começa sessão nova: histórico curto, cache barato,
 *  e o modelo não arrasta o contexto da viagem de ontem. */
async function talvezNovaSessao(db: Db, c: ConversaRow): Promise<ConversaRow> {
  const parada = Date.now() - new Date(c.ultima_atividade_em).getTime()
  if (parada < config.agente.horasNovaSessao * 3_600_000) return c
  const { count } = await db
    .from('agente_historico')
    .select('id', { count: 'exact', head: true })
    .eq('conversa_id', c.id)
    .eq('sessao', c.sessao)
  if (!count) return c
  const { data } = await db.from('agente_conversas').update({ sessao: c.sessao + 1 }).eq('id', c.id).select('*').single()
  return data ?? c
}

async function carregarHistorico(db: Db, c: ConversaRow): Promise<Mensagem[]> {
  const { data, error } = await db
    .from('agente_historico')
    .select('role, content')
    .eq('conversa_id', c.id)
    .eq('sessao', c.sessao)
    .order('seq')
  if (error) throw new Error(`[processar] carregar histórico: ${error.message}`)
  return (data ?? []).map((r) => ({ role: r.role, content: r.content as unknown as Mensagem['content'] }))
}

/**
 * Se a última volta morreu depois de o modelo pedir ferramentas e antes das
 * respostas, a API exige um tool_result para cada tool_use. Fecha com erro,
 * sem apagar nada do histórico.
 */
function fecharFerramentasPendentes(historico: Mensagem[]): Anthropic.Beta.BetaToolResultBlockParam[] {
  const ultima = historico[historico.length - 1]
  if (!ultima || ultima.role !== 'assistant' || typeof ultima.content === 'string') return []
  return ultima.content
    .filter((b): b is Anthropic.Beta.BetaToolUseBlockParam => b.type === 'tool_use')
    .map((b) => ({
      type: 'tool_result' as const,
      tool_use_id: b.id,
      content: 'Interrompido antes de executar. Confira com as ferramentas de busca se a ação aconteceu antes de repetir.',
      is_error: true,
    }))
}

async function cabecalho(db: Db, c: ConversaRow, inicioSessao: boolean): Promise<string> {
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' })
  // O que a equipe respondeu direto (tela de Conversas) desde a última volta
  // do agente, para ele não repetir nem contradizer.
  const { data: ultimaVolta } = await db
    .from('agente_historico')
    .select('created_at')
    .eq('conversa_id', c.id)
    .eq('sessao', c.sessao)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle()
  const desde = ultimaVolta?.created_at ?? new Date(Date.now() - 24 * 3_600_000).toISOString()
  const { data: humanas } = await db
    .from('agente_mensagens')
    .select('texto, created_at')
    .eq('conversa_id', c.id)
    .eq('autor', 'humano')
    .eq('sessao', c.sessao)
    .gte('created_at', desde)
    .order('created_at')
  const linhas = [
    '[Contexto do sistema]',
    `Agora: ${agora} (horário de Brasília).`,
    `Contato: ${c.nome_contato ?? 'nome não informado'} — WhatsApp ${c.telefone}.`,
  ]
  if (inicioSessao) linhas.push('Início de conversa (ou retomada depois de horas).')
  if (humanas?.length) {
    linhas.push('Mensagens enviadas por atendentes da equipe nesta conversa:')
    for (const h of humanas) linhas.push(`- ${h.texto ?? ''}`)
  }
  linhas.push('[Fim do contexto. Abaixo, as mensagens novas do contato.]')
  return linhas.join('\n')
}

function blocosDaMensagem(m: MensagemRow): Anthropic.Beta.BetaContentBlockParam[] {
  const legenda = m.texto ? `Legenda: ${m.texto}` : null
  switch (m.tipo) {
    case 'texto':
      return [{ type: 'text', text: `Mensagem: ${m.texto ?? ''}` }]
    case 'audio':
      return [{ type: 'text', text: m.transcricao ? `Áudio (transcrição automática, pode ter erros): ${m.transcricao}` : `Áudio que não pôde ser transcrito (${m.erro ?? 'erro'}). Peça para o contato escrever.` }]
    case 'documento':
      if (m.anthropic_file_id && m.midia_mime && ehPdf(m.midia_mime)) {
        return [
          { type: 'document', source: { type: 'file', file_id: m.anthropic_file_id }, title: m.midia_nome ?? 'documento.pdf' },
          { type: 'text', text: `PDF enviado pelo contato${legenda ? ` — ${legenda}` : ''}.` },
        ]
      }
      return [{ type: 'text', text: `Arquivo "${m.midia_nome ?? 'sem nome'}" (${m.midia_mime ?? 'tipo desconhecido'}) que você não consegue abrir. ${legenda ?? ''}`.trim() }]
    case 'imagem':
      if (m.anthropic_file_id) {
        return [
          { type: 'image', source: { type: 'file', file_id: m.anthropic_file_id } },
          { type: 'text', text: `Imagem enviada pelo contato${legenda ? ` — ${legenda}` : ''}.` },
        ]
      }
      return [{ type: 'text', text: `Imagem que não pôde ser aberta. ${legenda ?? ''}`.trim() }]
    default:
      return [{ type: 'text', text: m.texto ?? '[mensagem não suportada]' }]
  }
}

/** Baixa da Meta, guarda no bucket e deixa pronta para o modelo. Idempotente:
 *  o que já foi feito numa tentativa anterior não se refaz. */
async function prepararMidia(db: Db, m: MensagemRow): Promise<void> {
  if (!m.meta_media_id || (m.midia_path && (m.transcricao || m.anthropic_file_id))) return
  try {
    const { bytes, mime } = await baixarMidia(m.meta_media_id)
    const path = m.midia_path ?? (await guardarNoBucket(db, m.conversa_id, m.wamid ?? m.id, bytes, mime))
    const patch: Database['public']['Tables']['agente_mensagens']['Update'] = { midia_path: path, midia_mime: mimeBase(mime) }
    if (m.tipo === 'audio') patch.transcricao = await transcrever(bytes, mime)
    else if ((m.tipo === 'documento' && ehPdf(mime)) || (m.tipo === 'imagem' && ehImagemSuportada(mime))) {
      patch.anthropic_file_id = await subirParaAnthropic(bytes, mime, m.midia_nome)
    }
    await db.from('agente_mensagens').update(patch).eq('id', m.id)
  } catch (e) {
    await db.from('agente_mensagens').update({ erro: e instanceof Error ? e.message.slice(0, 500) : String(e) }).eq('id', m.id)
  }
}

async function responder(db: Db, c: ConversaRow, texto: string, modo: 'sombra' | 'autonomo'): Promise<void> {
  const base = { conversa_id: c.id, sessao: c.sessao, direcao: 'saida' as const, autor: 'agente' as const, tipo: 'texto' as const, texto }
  if (modo === 'sombra') {
    await db.from('agente_mensagens').insert({ ...base, envio: 'sombra' })
    return
  }
  try {
    const wamid = await enviarTexto(c.telefone, texto)
    await db.from('agente_mensagens').insert({ ...base, wamid: wamid || null, envio: 'enviada' })
  } catch (e) {
    await db.from('agente_mensagens').insert({ ...base, envio: 'falhou', erro: e instanceof Error ? e.message.slice(0, 500) : String(e) })
  }
}
