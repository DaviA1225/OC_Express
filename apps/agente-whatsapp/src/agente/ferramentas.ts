/**
 * Ferramentas do agente: tudo o que ele pode fazer no SisLog.
 *
 * O agente não tem acesso livre ao banco. Ele age como um atendente de perfil
 * `assistente`, pelo próprio login, e cada ação passa por aqui com entrada
 * validada. A RLS do banco continua sendo a última palavra: o que o perfil não
 * pode (cadastrar cliente, material), o Postgres recusa.
 *
 * Duas famílias:
 *   - LEITURA: sempre executa (buscar, listar, consultar).
 *   - ESCRITA: no modo autônomo executa e registra em `agente_acoes`; no modo
 *     sombra NÃO toca no sistema: grava um rascunho para a equipe aprovar.
 *
 * Os resultados voltam ao modelo como JSON curto. CPF sai mascarado: o agente
 * nunca precisa repetir um CPF inteiro no WhatsApp.
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Json } from '@sislog/shared/types'
import { isValidCpf, isValidDocumento, isValidPlaca, tipoPessoa } from '@sislog/shared/validators'
import { formatCpf, formatDocumento, formatPlaca, formatTelefone, maskCpf } from '@sislog/shared/formatters'

export type ModoAgente = 'sombra' | 'autonomo'

export interface ContextoFerramenta {
  db: SupabaseClient
  conversaId: string
  /** Telefone do contato (só dígitos, com DDI). */
  telefone: string
  nomeContato: string | null
  modo: ModoAgente
  /** Quem fica como atendente da solicitação: o agente, ou o humano que
   *  aprovou o rascunho. */
  usuarioId: string | null
  /** wamid da última mensagem recebida: chave de idempotência da solicitação. */
  ultimoWamid: string | null
  /** O agente pediu transferência para humano neste turno. */
  transferido: boolean
}

type Resultado = Record<string, unknown>

interface Ferramenta<S extends z.ZodType> {
  definicao: Anthropic.Beta.BetaTool
  schema: S
  escrita: boolean
  executar: (entrada: z.infer<S>, ctx: ContextoFerramenta) => Promise<Resultado>
}

function ferramenta<S extends z.ZodType>(f: Ferramenta<S>): Ferramenta<S> {
  return f
}

const LOCAIS_CARREGAMENTO = ['TUPACERY', 'URUCUM'] as const
const SUBTIPOS_MINERIO = ['SINTER', 'HEMATITA', 'LUMP'] as const
const JANELA_DUPLICADA_H = 12

const STATUS_LABEL: Record<string, string> = {
  recebida: 'Recebida',
  em_cadastro: 'Em emissão',
  instrucao_emitida: 'Instrução emitida',
  oc_gerada: 'OC gerada',
  oc_enviada: 'OC enviada',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
}

const so = (s: string) => s.replace(/\D/g, '')
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
/** Termo seguro para `ilike`: sem curingas nem vírgula/parênteses do `or()`. */
const termoBusca = (s: string) => semAcento(s).replace(/[%_,()*]/g, ' ').trim()

/** Número do WhatsApp (sempre com DDI) é brasileiro? 55 + DDD + 8 ou 9 dígitos. */
const ehBrasileiroWa = (d: string) => d.startsWith('55') && (d.length === 12 || d.length === 13)

/** Telefone do WhatsApp no formato do cadastro. Estrangeiro (MS faz fronteira
 *  com Paraguai e Bolívia) fica com o DDI, sem cortar dígito. */
function telefoneCadastro(telefoneWa: string): string {
  const d = so(telefoneWa)
  return ehBrasileiroWa(d) ? formatTelefone(d.slice(2)) : `+${d}`
}

/** Chave para comparar telefones. Brasileiro vira DDD + 8 últimos dígitos (o
 *  WhatsApp de contas antigas vem sem o 9 da frente, o cadastro vem com);
 *  estrangeiro só casa com todos os dígitos iguais. */
function chaveTelefone(valor: string | null | undefined, origem: 'whatsapp' | 'cadastro'): string | null {
  const d = so(valor ?? '')
  const comDdi = origem === 'whatsapp' || (valor ?? '').trim().startsWith('+')
  const local = ehBrasileiroWa(d) ? d.slice(2) : !comDdi && (d.length === 10 || d.length === 11) ? d : null
  if (local) return local.slice(0, 2) + local.slice(-8)
  return comDdi && d.length >= 8 ? `+${d}` : null
}

function mesmoTelefone(cadastro: string | null | undefined, telefoneWa: string): boolean {
  const x = chaveTelefone(telefoneWa, 'whatsapp')
  return x !== null && x === chaveTelefone(cadastro, 'cadastro')
}

function erro(mensagem: string, extra?: Resultado): Resultado {
  return { erro: mensagem, ...extra }
}

/** Erros do Postgres que o modelo consegue entender e contornar. */
function erroBanco(e: { code?: string; message?: string }): Resultado {
  if (e.code === '23505') return erro('Já existe um cadastro com esse dado (duplicado).')
  if (e.code === '42501') return erro('Sem permissão: o perfil do agente não pode fazer isso. Transfira para um atendente.')
  if (e.code === '23514') return erro(`Dado recusado pela regra do banco: ${e.message ?? ''}`)
  return erro(`Falha no banco: ${e.message ?? 'erro desconhecido'}`)
}

// ─────────────────────────────────────────────────────────────── LEITURA

const buscarMotorista = ferramenta({
  escrita: false,
  schema: z.object({ termo: z.string().min(2) }),
  definicao: {
    name: 'buscar_motorista',
    description:
      'Procura motoristas cadastrados por CPF (com ou sem pontuação), nome ou telefone. Use antes de ' +
      'cadastrar, para não duplicar. Devolve no máximo 8, com CPF mascarado.',
    input_schema: {
      type: 'object',
      properties: { termo: { type: 'string', description: 'CPF, parte do nome ou telefone.' } },
      required: ['termo'],
      additionalProperties: false,
    },
  },
  async executar({ termo }, { db }) {
    const digitos = so(termo)
    let q = db.from('motoristas').select('id, nome_completo, cpf, telefone').eq('ativo', true).limit(8)
    if (digitos.length === 11 && isValidCpf(digitos)) {
      // O cadastro guarda o CPF formatado (MotoristasPage usa formatCpf).
      q = q.or(`cpf.eq.${formatCpf(digitos)},cpf.eq.${digitos}`)
    } else if (digitos.length >= 8) {
      q = q.ilike('telefone', `%${digitos.slice(-8, -4)}%${digitos.slice(-4)}%`)
    } else {
      q = q.ilike('nome_completo_unaccent', `%${termoBusca(termo)}%`)
    }
    const { data, error } = await q
    if (error) return erroBanco(error)
    return {
      encontrados: (data ?? []).map((m) => ({
        id: m.id,
        nome: m.nome_completo,
        cpf: maskCpf(m.cpf),
        telefone: m.telefone,
      })),
    }
  },
})

const buscarPlaca = ferramenta({
  escrita: false,
  schema: z.object({ placa: z.string().min(7) }),
  definicao: {
    name: 'buscar_placa',
    description:
      'Procura uma placa nos cadastros de cavalo (veículo trator) e de carreta ao mesmo tempo. ' +
      'Informa de que tipo é e a subcontratada dona. Use para cada placa que o contato mandar.',
    input_schema: {
      type: 'object',
      properties: { placa: { type: 'string', description: 'Placa antiga (ABC1234) ou Mercosul (ABC1D23).' } },
      required: ['placa'],
      additionalProperties: false,
    },
  },
  async executar({ placa }, { db }) {
    const p = formatPlaca(placa)
    if (!isValidPlaca(p)) return erro(`"${placa}" não é uma placa válida.`)
    const [veic, carr] = await Promise.all([
      db.from('veiculos').select('id, placa, tipo, subcontratada_id').eq('placa', p).eq('ativo', true).maybeSingle(),
      db.from('carretas').select('id, placa, tipo, capacidade_ton, subcontratada_id').eq('placa', p).eq('ativo', true).maybeSingle(),
    ])
    if (veic.error) return erroBanco(veic.error)
    if (carr.error) return erroBanco(carr.error)
    const subIds = [veic.data?.subcontratada_id, carr.data?.subcontratada_id].filter((x): x is string => !!x)
    const subs = subIds.length
      ? (await db.from('subcontratadas').select('id, razao_social').in('id', subIds)).data ?? []
      : []
    const nomeSub = (id: string | null | undefined) => subs.find((s) => s.id === id)?.razao_social ?? null
    return {
      placa: p,
      cavalo: veic.data
        ? { id: veic.data.id, tipo: veic.data.tipo, subcontratada_id: veic.data.subcontratada_id, subcontratada: nomeSub(veic.data.subcontratada_id) }
        : null,
      carreta: carr.data
        ? { id: carr.data.id, tipo: carr.data.tipo, capacidade_ton: carr.data.capacidade_ton, subcontratada_id: carr.data.subcontratada_id, subcontratada: nomeSub(carr.data.subcontratada_id) }
        : null,
    }
  },
})

const buscarSubcontratada = ferramenta({
  escrita: false,
  schema: z.object({ termo: z.string().min(2) }),
  definicao: {
    name: 'buscar_subcontratada',
    description: 'Procura a transportadora subcontratada (PJ) ou autônomo (PF) por nome, CPF ou CNPJ.',
    input_schema: {
      type: 'object',
      properties: { termo: { type: 'string' } },
      required: ['termo'],
      additionalProperties: false,
    },
  },
  async executar({ termo }, { db }) {
    const d = so(termo)
    let q = db.from('subcontratadas').select('id, razao_social, documento, tipo_pessoa').eq('ativo', true).limit(8)
    q = d.length === 11 || d.length === 14
      ? q.or(`documento.eq.${formatDocumento(d)},documento.eq.${d}`)
      : q.ilike('razao_social_unaccent', `%${termoBusca(termo)}%`)
    const { data, error } = await q
    if (error) return erroBanco(error)
    return { encontradas: data ?? [] }
  },
})

const listarDestinos = ferramenta({
  escrita: false,
  schema: z.object({}),
  definicao: {
    name: 'listar_destinos',
    description:
      'Lista os clientes de minério (destinos de descarga) ativos, com cidade, se estão liberados e que ' +
      'tipo de carreta aceitam. Use para resolver o destino de uma solicitação de carregamento.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  async executar(_e, { db }) {
    const { data, error } = await db
      .from('clientes')
      .select('id, razao_social, cidade, uf, liberado, aceita_cacamba, aceita_graneleiro, requer_agendamento')
      .eq('cliente_minerio', true)
      .eq('ativo', true)
      .order('razao_social')
    if (error) return erroBanco(error)
    return { destinos: data ?? [] }
  },
})

const listarCargasRetorno = ferramenta({
  escrita: false,
  schema: z.object({}),
  definicao: {
    name: 'listar_cargas_retorno',
    description: 'Lista as cargas de retorno cadastradas (cliente de origem + local). Use para solicitação de retorno.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  async executar(_e, { db }) {
    const { data, error } = await db
      .from('cargas_retorno')
      .select('id, local_carregamento, observacoes, cliente:cliente_id(razao_social, cidade, uf)')
      .eq('ativo', true)
    if (error) return erroBanco(error)
    return { cargas_retorno: data ?? [] }
  },
})

const listarMateriais = ferramenta({
  escrita: false,
  schema: z.object({}),
  definicao: {
    name: 'listar_materiais',
    description: 'Lista os materiais cadastrados (MINÉRIO, PEDRA, MILHO...). Retorno exige escolher um.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  async executar(_e, { db }) {
    const { data, error } = await db.from('materiais').select('id, nome, requer_instrucao').eq('ativo', true).order('nome')
    if (error) return erroBanco(error)
    return { materiais: data ?? [] }
  },
})

const consultarSolicitacoes = ferramenta({
  escrita: false,
  schema: z.object({
    numero: z.number().int().positive().optional(),
    placa: z.string().optional(),
    deste_contato: z.boolean().optional(),
  }),
  definicao: {
    name: 'consultar_solicitacoes',
    description:
      'Consulta solicitações recentes (últimos 15 dias) e o status de cada uma. Filtre pelo número da ' +
      'OC, por uma placa de cavalo, ou pelas solicitações abertas por este contato. Use para responder ' +
      '"cadê minha OC?". Só voltam com detalhes as solicitações deste contato (ele pediu, ou é o ' +
      'motorista); as de outras pessoas voltam só contadas em de_outros_contatos.',
    input_schema: {
      type: 'object',
      properties: {
        numero: { type: 'integer', description: 'Número da OC, ex.: 1234 para #1234.' },
        placa: { type: 'string', description: 'Placa do cavalo.' },
        deste_contato: { type: 'boolean', description: 'true = só as deste contato. Sem número nem placa, é o padrão.' },
      },
      additionalProperties: false,
    },
  },
  async executar(e, { db, telefone }) {
    const desde = new Date(Date.now() - 15 * 86_400_000).toISOString()
    let q = db
      .from('solicitacoes')
      .select('id, numero_interno, tipo, status, created_at, enviada_em, solicitante_telefone, motorista:motorista_id(nome_completo, telefone), veiculo:veiculo_id(placa), cliente:cliente_id(razao_social)')
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      // Folga antes de separar as do contato: cortar em 10 antes esconderia as dele.
      .limit(50)
    if (e.numero) q = q.eq('numero_interno', e.numero)
    if (e.placa) {
      const { data: v } = await db.from('veiculos').select('id').eq('placa', formatPlaca(e.placa)).maybeSingle()
      if (!v) return { solicitacoes: [], aviso: 'Placa de cavalo não cadastrada.' }
      q = q.eq('veiculo_id', v.id)
    }
    // Sem número nem placa, a pergunta só pode ser sobre o próprio contato. O
    // banco filtra pelo final do número (pedidas por ele ou com ele de
    // motorista); a comparação exata vem depois, em `mesmoTelefone`.
    if (e.deste_contato || (!e.numero && !e.placa)) {
      const d = so(telefone)
      const [ini, fim] = [d.slice(-8, -4), d.slice(-4)]
      const { data: mots } = await db.from('motoristas').select('id').ilike('telefone', `%${ini}%${fim}%`).limit(50)
      const ids = (mots ?? []).map((m: { id: string }) => m.id)
      q = q.or([`solicitante_telefone.ilike.*${ini}*${fim}*`, ...(ids.length ? [`motorista_id.in.(${ids.join(',')})`] : [])].join(','))
    }
    const { data, error } = await q
    if (error) return erroBanco(error)
    // A regra "não passar dado de OC de outra pessoa" fica no código, não só no
    // prompt: o que não é deste contato nem chega ao modelo para ser vazado.
    // Sem `Relationships` nos tipos, o embed vem tipado como lista; em runtime
    // é um objeto (motorista_id aponta para uma linha).
    const linhas = (data ?? []).map(({ motorista, ...s }) => ({
      ...s,
      motorista: motorista as unknown as { nome_completo: string; telefone: string | null } | null,
    }))
    const doContato = linhas.filter(
      (s) => mesmoTelefone(s.solicitante_telefone, telefone) || mesmoTelefone(s.motorista?.telefone, telefone),
    )
    const deOutros = linhas.length - doContato.length
    return {
      solicitacoes: doContato.slice(0, 10).map(({ solicitante_telefone: _s, motorista, ...s }) => ({
        ...s,
        motorista: motorista ? { nome_completo: motorista.nome_completo } : null,
        numero: `#${String(s.numero_interno).padStart(4, '0')}`,
        status: STATUS_LABEL[s.status] ?? s.status,
      })),
      ...(deOutros > 0
        ? {
            de_outros_contatos: deOutros,
            aviso: 'Há solicitações que não são deste contato. Não informe status nem dados delas: oriente a procurar quem pediu (a transportadora) ou transfira para um atendente.',
          }
        : {}),
    }
  },
})

// ─────────────────────────────────────────────────────────────── ESCRITA

const cadastrarMotorista = ferramenta({
  escrita: true,
  schema: z.object({
    nome_completo: z.string().min(5),
    cpf: z.string(),
    telefone: z.string().optional(),
  }),
  definicao: {
    name: 'cadastrar_motorista',
    description:
      'Cadastra um motorista novo. Só depois de buscar_motorista não encontrar o CPF. Nome completo e CPF ' +
      'válido são obrigatórios; confira com o contato se vierem de foto ou áudio.',
    input_schema: {
      type: 'object',
      properties: {
        nome_completo: { type: 'string' },
        cpf: { type: 'string' },
        telefone: { type: 'string', description: 'Com DDD. Opcional.' },
      },
      required: ['nome_completo', 'cpf'],
      additionalProperties: false,
    },
  },
  async executar(e, { db }) {
    if (!isValidCpf(e.cpf)) return erro('CPF inválido (dígito verificador não confere). Peça para o contato conferir.')
    const { data, error } = await db
      .from('motoristas')
      .insert({ nome_completo: e.nome_completo.trim(), cpf: formatCpf(e.cpf), telefone: e.telefone ? formatTelefone(e.telefone) : null } as never)
      .select('id, nome_completo')
      .single()
    if (error) return erroBanco(error)
    return { cadastrado: data }
  },
})

const cadastrarSubcontratada = ferramenta({
  escrita: true,
  schema: z.object({ razao_social: z.string().min(3), documento: z.string() }),
  definicao: {
    name: 'cadastrar_subcontratada',
    description: 'Cadastra transportadora subcontratada (CNPJ) ou autônomo (CPF). Busque antes para não duplicar.',
    input_schema: {
      type: 'object',
      properties: { razao_social: { type: 'string' }, documento: { type: 'string', description: 'CPF ou CNPJ.' } },
      required: ['razao_social', 'documento'],
      additionalProperties: false,
    },
  },
  async executar(e, { db }) {
    if (!isValidDocumento(e.documento)) return erro('CPF/CNPJ inválido.')
    const { data, error } = await db
      .from('subcontratadas')
      .insert({ razao_social: e.razao_social.trim(), documento: formatDocumento(e.documento), tipo_pessoa: tipoPessoa(e.documento) } as never)
      .select('id, razao_social')
      .single()
    if (error) return erroBanco(error)
    return { cadastrada: data }
  },
})

const cadastrarVeiculo = ferramenta({
  escrita: true,
  schema: z.object({ placa: z.string(), tipo: z.string().optional(), subcontratada_id: z.string().uuid() }),
  definicao: {
    name: 'cadastrar_cavalo',
    description: 'Cadastra um cavalo (veículo trator) novo, ligado à subcontratada dona.',
    input_schema: {
      type: 'object',
      properties: {
        placa: { type: 'string' },
        tipo: { type: 'string', description: 'Ex.: Cavalo Trucado 3 Eixos. Opcional.' },
        subcontratada_id: { type: 'string' },
      },
      required: ['placa', 'subcontratada_id'],
      additionalProperties: false,
    },
  },
  async executar(e, { db }) {
    const placa = formatPlaca(e.placa)
    if (!isValidPlaca(placa)) return erro('Placa inválida.')
    const { data, error } = await db
      .from('veiculos')
      .insert({ placa, tipo: e.tipo ?? null, subcontratada_id: e.subcontratada_id } as never)
      .select('id, placa')
      .single()
    if (error) return erroBanco(error)
    return { cadastrado: data }
  },
})

const TIPOS_CARRETA = [
  'Caçamba 3 Eixos', 'Caçamba 4 Eixos', 'Bi-Trem Caçamba', 'Rodo-Trem Caçamba',
  'Graneleiro LS 3 Eixos', 'Graneleiro LS 4 Eixos', 'Bi-Trem Graneleiro', 'Rodo-Trem Graneleiro',
] as const

const cadastrarCarreta = ferramenta({
  escrita: true,
  schema: z.object({
    placa: z.string(),
    tipo: z.enum(TIPOS_CARRETA).optional(),
    capacidade_ton: z.number().positive().optional(),
    subcontratada_id: z.string().uuid(),
  }),
  definicao: {
    name: 'cadastrar_carreta',
    description: 'Cadastra uma carreta (semirreboque) nova, ligada à subcontratada dona.',
    input_schema: {
      type: 'object',
      properties: {
        placa: { type: 'string' },
        tipo: { type: 'string', enum: [...TIPOS_CARRETA] },
        capacidade_ton: { type: 'number' },
        subcontratada_id: { type: 'string' },
      },
      required: ['placa', 'subcontratada_id'],
      additionalProperties: false,
    },
  },
  async executar(e, { db }) {
    const placa = formatPlaca(e.placa)
    if (!isValidPlaca(placa)) return erro('Placa inválida.')
    const { data, error } = await db
      .from('carretas')
      .insert({ placa, tipo: e.tipo ?? null, capacidade_ton: e.capacidade_ton ?? null, subcontratada_id: e.subcontratada_id } as never)
      .select('id, placa')
      .single()
    if (error) return erroBanco(error)
    return { cadastrada: data }
  },
})

const criarSolicitacao = ferramenta({
  escrita: true,
  schema: z.object({
    tipo: z.enum(['carregamento', 'retorno']),
    solicitante_nome: z.string().min(2),
    motorista_id: z.string().uuid(),
    veiculo_id: z.string().uuid(),
    carreta_id: z.string().uuid(),
    primeira_carreta_id: z.string().uuid().optional(),
    dolly_id: z.string().uuid().optional(),
    subcontratada_id: z.string().uuid().optional(),
    cliente_id: z.string().uuid().optional(),
    material_subtipo: z.enum(SUBTIPOS_MINERIO).optional(),
    local_carregamento: z.enum(LOCAIS_CARREGAMENTO).optional(),
    carga_retorno_id: z.string().uuid().optional(),
    material_id: z.string().uuid().optional(),
    observacoes: z.string().max(1000).optional(),
    confirmar_duplicada: z.boolean().optional(),
  }),
  definicao: {
    name: 'criar_solicitacao',
    description:
      'Cria a solicitação de Ordem de Carregamento no SisLog, com status "Recebida", para a equipe emitir. ' +
      'Carregamento (minério): exige cliente_id (destino), material_subtipo e local_carregamento. ' +
      'Retorno: exige carga_retorno_id e material_id. Os dois exigem motorista, cavalo e a ÚLTIMA carreta ' +
      '(carreta_id); em bitrem/rodotrem, a primeira vai em primeira_carreta_id. A subcontratada vem do ' +
      'cavalo se não for informada. Se já existir solicitação aberta igual nas últimas 12 h, a ferramenta ' +
      'avisa em vez de criar; só repita com confirmar_duplicada=true se o contato confirmar que é outra viagem.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['carregamento', 'retorno'] },
        solicitante_nome: { type: 'string', description: 'Quem está pedindo (nome do contato).' },
        motorista_id: { type: 'string' },
        veiculo_id: { type: 'string', description: 'Id do cavalo.' },
        carreta_id: { type: 'string', description: 'Id da última carreta.' },
        primeira_carreta_id: { type: 'string' },
        dolly_id: { type: 'string' },
        subcontratada_id: { type: 'string' },
        cliente_id: { type: 'string', description: 'Destino (carregamento).' },
        material_subtipo: { type: 'string', enum: [...SUBTIPOS_MINERIO] },
        local_carregamento: { type: 'string', enum: [...LOCAIS_CARREGAMENTO] },
        carga_retorno_id: { type: 'string', description: 'Carga de retorno (retorno).' },
        material_id: { type: 'string', description: 'Material (retorno).' },
        observacoes: { type: 'string', description: 'Algo que a equipe precisa saber. Sem dado pessoal desnecessário.' },
        confirmar_duplicada: { type: 'boolean' },
      },
      required: ['tipo', 'solicitante_nome', 'motorista_id', 'veiculo_id', 'carreta_id'],
      additionalProperties: false,
    },
  },
  async executar(e, { db, telefone, ultimoWamid, usuarioId }) {
    // Regras do formulário do interno (NovaSolicitacaoDialog), replicadas.
    if (e.tipo === 'carregamento') {
      if (!e.cliente_id) return erro('Falta o destino (cliente_id).')
      if (!e.material_subtipo) return erro('Falta o tipo de minério: SINTER, HEMATITA ou LUMP.')
      if (!e.local_carregamento) return erro('Falta o local de carregamento: TUPACERY ou URUCUM.')
    } else {
      if (!e.carga_retorno_id) return erro('Falta a carga de retorno (carga_retorno_id).')
      if (!e.material_id) return erro('Falta o material do retorno (material_id).')
    }

    const { data: veic, error: eV } = await db.from('veiculos').select('subcontratada_id').eq('id', e.veiculo_id).single()
    if (eV) return erroBanco(eV)
    const subcontratadaId = e.subcontratada_id ?? veic.subcontratada_id
    if (!subcontratadaId) return erro('O cavalo não tem subcontratada no cadastro; informe subcontratada_id.')

    let clienteId = e.cliente_id ?? null
    let local: string | null = e.local_carregamento ?? null
    let materialId = e.material_id ?? null
    if (e.tipo === 'retorno') {
      const { data: carga, error: eC } = await db.from('cargas_retorno').select('cliente_id, local_carregamento').eq('id', e.carga_retorno_id!).single()
      if (eC) return erroBanco(eC)
      clienteId = carga.cliente_id
      local = carga.local_carregamento
    } else {
      const { data: cli, error: eCl } = await db.from('clientes').select('liberado, razao_social').eq('id', clienteId!).single()
      if (eCl) return erroBanco(eCl)
      if (!cli.liberado) return erro(`O destino ${cli.razao_social} está bloqueado para recebimento. Transfira para um atendente.`)
      const { data: mats } = await db.from('materiais').select('id, nome').eq('ativo', true)
      materialId = (mats ?? []).find((m) => /MIN[ÉE]RIO/i.test(m.nome))?.id ?? null
      if (!materialId) return erro('Material MINÉRIO não encontrado no cadastro. Transfira para um atendente.')
    }

    if (!e.confirmar_duplicada) {
      const desde = new Date(Date.now() - JANELA_DUPLICADA_H * 3_600_000).toISOString()
      const { data: dup } = await db
        .from('solicitacoes')
        .select('numero_interno, status, created_at')
        .eq('motorista_id', e.motorista_id)
        .eq('veiculo_id', e.veiculo_id)
        .eq('cliente_id', clienteId!)
        .not('status', 'in', '("cancelada","finalizada")')
        .gte('created_at', desde)
        .limit(1)
        .maybeSingle()
      if (dup) {
        return erro('Já existe solicitação aberta para este motorista, cavalo e destino.', {
          duplicada: { numero: `#${String(dup.numero_interno).padStart(4, '0')}`, status: STATUS_LABEL[dup.status] ?? dup.status },
        })
      }
    }

    const { data, error } = await db
      .from('solicitacoes')
      .insert({
        tipo: e.tipo,
        status: 'recebida',
        origem: 'whatsapp',
        external_msg_id: e.confirmar_duplicada || !ultimoWamid ? null : ultimoWamid,
        atendente_id: usuarioId,
        solicitante_nome: e.solicitante_nome,
        solicitante_telefone: telefoneCadastro(telefone),
        motorista_id: e.motorista_id,
        veiculo_id: e.veiculo_id,
        carreta_id: e.carreta_id,
        primeira_carreta_id: e.primeira_carreta_id ?? null,
        dolly_id: e.dolly_id ?? null,
        subcontratada_id: subcontratadaId,
        cliente_id: clienteId,
        material_id: materialId,
        material_subtipo: e.tipo === 'carregamento' ? e.material_subtipo : null,
        local_carregamento: local,
        pamcard_status: 'nao_tem_cartao',
        pamcard_numero: null,
        observacoes: e.observacoes ?? null,
      } as never)
      .select('id, numero_interno')
      .single()
    if (error) {
      // Mesmo wamid já virou solicitação: a Meta reentregou ou o agente repetiu.
      if (error.code === '23505' && ultimoWamid) {
        const { data: existente } = await db.from('solicitacoes').select('id, numero_interno').eq('external_msg_id', ultimoWamid).maybeSingle()
        if (existente) return { ja_existia: true, id: existente.id, numero: `#${String(existente.numero_interno).padStart(4, '0')}` }
      }
      return erroBanco(error)
    }
    return { criada: true, id: data.id, numero: `#${String(data.numero_interno).padStart(4, '0')}` }
  },
})

const transferirParaHumano = ferramenta({
  escrita: false,
  schema: z.object({ motivo: z.string().min(3) }),
  definicao: {
    name: 'transferir_para_humano',
    description:
      'Passa a conversa para um atendente da equipe. Use quando: o contato pedir uma pessoa; faltar ' +
      'permissão (cliente ou material novo); houver reclamação, cobrança ou assunto fora de OC; ou você ' +
      'não tiver certeza depois de perguntar. Depois de transferir, avise o contato e pare.',
    input_schema: {
      type: 'object',
      properties: { motivo: { type: 'string', description: 'Resumo para o atendente: o que falta e por quê.' } },
      required: ['motivo'],
      additionalProperties: false,
    },
  },
  async executar({ motivo }, ctx) {
    const agora = new Date().toISOString()
    const { error } = await ctx.db.from('agente_conversas').update({ estado: 'humano', updated_at: agora }).eq('id', ctx.conversaId)
    if (error) return erroBanco(error)
    await ctx.db.from('agente_acoes').insert({ conversa_id: ctx.conversaId, ferramenta: 'transferir_para_humano', entrada: { motivo }, status: 'executada' })
    ctx.transferido = true
    return { transferido: true }
  },
})

// ─────────────────────────────────────────────────────────────── REGISTRO

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TODAS: Ferramenta<any>[] = [
  buscarMotorista, buscarPlaca, buscarSubcontratada, listarDestinos, listarCargasRetorno, listarMateriais,
  consultarSolicitacoes, cadastrarMotorista, cadastrarSubcontratada, cadastrarVeiculo, cadastrarCarreta,
  criarSolicitacao, transferirParaHumano,
]

const POR_NOME = new Map(TODAS.map((f) => [f.definicao.name, f]))

/** Definições na ordem fixa: a lista de ferramentas faz parte do prefixo do
 *  cache de prompt, e qualquer mudança de ordem invalida o cache. */
export const DEFINICOES: Anthropic.Beta.BetaTool[] = TODAS.map((f) => f.definicao)

/**
 * Executa uma ferramenta de ESCRITA sem passar pelo modo sombra nem gravar em
 * `agente_acoes` — quem chama registra. Usado ao aprovar um rascunho na tela de
 * Conversas: a mesma validação e as mesmas regras que o agente usaria.
 */
export async function executarDireto(nome: string, entrada: unknown, ctx: ContextoFerramenta): Promise<Resultado> {
  const f = POR_NOME.get(nome)
  if (!f || !f.escrita) return erro(`Ferramenta de escrita desconhecida: ${nome}`)
  const parsed = f.schema.safeParse(entrada)
  if (!parsed.success) return erro('Entrada do rascunho inválida.')
  try {
    return await f.executar(parsed.data, ctx)
  } catch (e) {
    return erro(`Falha inesperada: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Executa uma chamada de ferramenta. Nunca lança: erro vira resultado para o
 *  modelo ler e corrigir (is_error). */
export async function executarFerramenta(
  nome: string,
  entrada: unknown,
  ctx: ContextoFerramenta,
): Promise<{ conteudo: string; erro: boolean }> {
  const f = POR_NOME.get(nome)
  if (!f) return { conteudo: JSON.stringify(erro(`Ferramenta desconhecida: ${nome}`)), erro: true }

  const parsed = f.schema.safeParse(entrada)
  if (!parsed.success) {
    const problemas = parsed.error.issues.map((i: { path: PropertyKey[]; message: string }) => `${i.path.map(String).join('.') || 'entrada'}: ${i.message}`).join('; ')
    return { conteudo: JSON.stringify(erro(`Entrada inválida: ${problemas}`)), erro: true }
  }

  // Modo sombra: escrita vira rascunho. O modelo é avisado de forma neutra
  // para seguir a conversa como se a ação estivesse encaminhada.
  if (f.escrita && ctx.modo === 'sombra') {
    await ctx.db.from('agente_acoes').insert({
      conversa_id: ctx.conversaId,
      ferramenta: nome,
      entrada: parsed.data as Json,
      status: 'rascunho',
    })
    return {
      conteudo: JSON.stringify({ registrado_para_conferencia: true, aviso: 'A equipe confere e conclui esta ação.' }),
      erro: false,
    }
  }

  let resultado: Resultado
  try {
    resultado = await f.executar(parsed.data, ctx)
  } catch (e) {
    resultado = erro(`Falha inesperada: ${e instanceof Error ? e.message : String(e)}`)
  }
  const falhou = 'erro' in resultado

  if (f.escrita) {
    await ctx.db.from('agente_acoes').insert({
      conversa_id: ctx.conversaId,
      ferramenta: nome,
      entrada: parsed.data as Json,
      resultado: resultado as Json,
      status: falhou ? 'erro' : 'executada',
    })
  }
  return { conteudo: JSON.stringify(resultado), erro: falhou }
}
