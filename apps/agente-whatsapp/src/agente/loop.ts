/**
 * Ciclo do agente: chama o modelo, executa as ferramentas pedidas e repete até
 * ele dar a resposta final ao contato.
 *
 * Ciclo manual (e não o tool runner do SDK) porque cada volta precisa ser
 * gravada no histórico ANTES da próxima: se a função serverless morrer no
 * meio, a conversa retoma de onde parou, sem refazer cadastro nem perder o
 * que o modelo já decidiu.
 *
 * Histórico só cresce (append-only). O conteúdo da resposta volta para a API
 * exatamente como veio — inclusive os blocos de raciocínio —, que é o que
 * mantém o cache de prompt e o raciocínio do modelo válidos entre os turnos.
 */

import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config'
import { PROMPT_SISTEMA } from './prompt'
import { DEFINICOES, executarFerramenta, type ContextoFerramenta } from './ferramentas'

const client = new Anthropic({ apiKey: config.anthropic.apiKey })

export type Mensagem = Anthropic.Beta.BetaMessageParam

export interface ResultadoCiclo {
  /** Texto para o contato, ou null quando não há o que dizer. */
  resposta: string | null
  /** Motivo de parada fora do normal, para log/alerta. */
  anomalia: string | null
}

/**
 * @param historico a sessão inteira, já gravada, terminando no turno novo do
 *   contato (quem chama grava esse turno antes, para marcar as mensagens como
 *   entregues ao agente na mesma hora)
 * @param gravar persiste uma mensagem nova no histórico; chamado na ordem
 */
export async function rodarCiclo(
  historico: Mensagem[],
  ctx: ContextoFerramenta,
  gravar: (m: Mensagem) => Promise<void>,
): Promise<ResultadoCiclo> {
  const mensagens: Mensagem[] = [...historico]

  for (let volta = 0; volta < config.agente.maxVoltas; volta++) {
    const resposta = await client.beta.messages.create({
      model: config.anthropic.model,
      max_tokens: 16000,
      // Raciocínio adaptativo; esforço médio basta para atendimento e é o
      // ponto de equilíbrio entre qualidade e custo/latência no WhatsApp.
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      // Se o classificador de segurança recusar por engano, a API refaz o
      // pedido no modelo recomendado em vez de devolver a recusa.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: PROMPT_SISTEMA, cache_control: { type: 'ephemeral' } }],
      // Cache automático na cauda da conversa: cada turno reaproveita o anterior.
      cache_control: { type: 'ephemeral' },
      tools: DEFINICOES,
      messages: mensagens,
    })

    const doAssistente: Mensagem = { role: 'assistant', content: resposta.content }
    mensagens.push(doAssistente)
    await gravar(doAssistente)

    switch (resposta.stop_reason) {
      case 'end_turn':
      case 'stop_sequence':
        return { resposta: textoFinal(resposta.content), anomalia: null }
      case 'pause_turn':
        continue
      case 'refusal':
        return { resposta: null, anomalia: `recusa (${resposta.stop_details?.category ?? 'sem categoria'})` }
      case 'max_tokens':
        return { resposta: null, anomalia: 'max_tokens' }
      case 'tool_use':
        break
      default:
        return { resposta: textoFinal(resposta.content), anomalia: `stop_reason ${resposta.stop_reason}` }
    }

    const chamadas = resposta.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    // Todas as respostas de ferramenta voltam numa mensagem só: separar ensina
    // o modelo a parar de pedir ferramentas em paralelo.
    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = []
    for (const c of chamadas) {
      const r = await executarFerramenta(c.name, c.input, ctx)
      resultados.push({ type: 'tool_result', tool_use_id: c.id, content: r.conteudo, is_error: r.erro })
    }
    const comResultados: Mensagem = { role: 'user', content: resultados }
    mensagens.push(comResultados)
    await gravar(comResultados)
  }

  return { resposta: null, anomalia: `passou de ${config.agente.maxVoltas} voltas` }
}

function textoFinal(blocos: Anthropic.Beta.BetaContentBlock[]): string | null {
  const texto = blocos
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
  if (!texto || texto.includes('[SEM_RESPOSTA]')) return null
  return texto
}
