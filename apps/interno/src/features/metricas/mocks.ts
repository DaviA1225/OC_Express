// Dados SIMULADOS dos dashboards — só são lidos por `fonte.ts` enquanto
// FONTE === 'simulada'. Nada aqui vai para o banco.
//
// Coerência garantida por construção:
// - o Painel sai de UMA fila simulada (itens com status, status_desde,
//   cliente, local…) agregada com `classificarSla` e a config de SLA atual —
//   então P2 ≤ P1, as etapas somam a fila e a prévia da tela de Metas bate;
// - os Relatórios saem de um gerador por DIA (semente = data) para "todas";
//   os recortes (origem/cliente/local) são frações determinísticas desse dia,
//   então interno + parceiro = todas e a série soma o resumo;
// - mesma entrada → mesma saída (sementes por data/bucket), nada "pula" entre
//   refetches; a fila muda a cada 10 min e os minutos avançam no relógio.
//
// Cenários de borda (só no modo simulado): `?cenario=vazio` (fila e período
// vazios), `?cenario=grande` (volumes de milhares), `?cenario=meta` (meta
// diária de 45 se a config estiver sem meta). Sem parâmetro = operação normal.
//
// Dias e horas no fuso do navegador (a operação está em São Paulo); as RPCs
// reais cortam em America/Sao_Paulo no servidor.

import type { SolicitacaoStatus } from '@/types/database.types'
import { classificarSla, ETAPAS_FILA, ETAPAS_SLA, mapaSla, minutosNaEtapa, SLA_FALLBACK } from './sla'
import type {
  AbertaParada,
  ConfigMetasSla,
  ConfigMetasSlaEntrada,
  DimensaoRanking,
  EtapaSla,
  ExportLinha,
  FaixaIdade,
  FiltrosComuns,
  FiltrosPeriodo,
  Granularidade,
  ItemFilaPrevia,
  LocalLinha,
  MapaCalorCelula,
  OpcaoCliente,
  PainelAtrasada,
  PainelEstadoAtual,
  PainelHoje,
  Percentis,
  Periodo,
  Produtividade,
  ProdutividadeUsuario,
  RankingLinha,
  RelatorioResumo,
  ResumoBloco,
  SerieLinha,
  TempoEtapaLinha,
} from './tipos'

export type Cenario = 'normal' | 'vazio' | 'grande' | 'meta'

// ── Aleatoriedade determinística ────────────────────────────────────────────

function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: gerador [0,1) a partir de uma semente. */
function gerador(semente: string): () => number {
  let a = hash(semente)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function entre(r: () => number, min: number, max: number): number {
  return min + r() * (max - min)
}

/** Reparte `total` por pesos, somando exatamente `total` (maiores restos). */
function repartir(total: number, pesos: number[]): number[] {
  const soma = pesos.reduce((a, b) => a + b, 0)
  if (total <= 0 || soma <= 0) return pesos.map(() => 0)
  const brutos = pesos.map((p) => (total * p) / soma)
  const base = brutos.map(Math.floor)
  let resto = total - base.reduce((a, b) => a + b, 0)
  const ordem = brutos.map((b, i) => ({ i, f: b - Math.floor(b) })).sort((x, y) => y.f - x.f)
  for (const { i } of ordem) {
    if (resto <= 0) break
    base[i]++
    resto--
  }
  return base
}

// ── Catálogos fictícios ─────────────────────────────────────────────────────

interface Entidade {
  id: string
  nome: string
  peso: number
}

function uuid(prefixo: string, i: number): string {
  const h = hash(`${prefixo}-${i}`).toString(16).padStart(8, '0')
  return `${h}-0000-4000-8000-${String(i).padStart(12, '0')}`
}

const CLIENTES: Entidade[] = [
  'Mineração Serra Verde', 'Siderúrgica Horizonte', 'Cimentos Planalto', 'Agro Cerrado Grãos',
  'Fertilizantes Alvorada', 'Metalúrgica Vale do Aço', 'Pelotização Atlântico', 'Calcário Bom Jesus',
  'Ferroligas Minas', 'Logística Rio Doce', 'Granéis do Sul', 'Usina Santa Clara',
  'Carvão Vegetal Norte', 'Escória Industrial MG',
].map((nome, i) => ({ id: uuid('cliente', i), nome, peso: [22, 16, 11, 9, 8, 7, 6, 5, 4, 4, 3, 2, 2, 1][i] }))

const LOCAIS: { nome: string; peso: number }[] = [
  { nome: 'Terminal Itaúna', peso: 24 },
  { nome: 'Pátio Sarzedo', peso: 18 },
  { nome: 'Mina Serra Azul', peso: 14 },
  { nome: 'Porto Seco Betim', peso: 11 },
  { nome: 'Usina Ipatinga', peso: 9 },
  { nome: 'Terminal Juatuba', peso: 7 },
  { nome: 'Pátio Divinópolis', peso: 5 },
  { nome: 'Mina Fazendão', peso: 4 },
]
const PESO_SEM_LOCAL = 8

const MATERIAIS = ['Minério granulado', 'Pellet feed', 'Sinter feed', 'Calcário', 'Escória', 'Carvão vegetal', 'Ferro-gusa']
  .map((nome, i) => ({ id: uuid('material', i), nome, peso: [30, 22, 15, 12, 9, 7, 5][i] }))
const MOTORISTAS = ['Carlos A. Pereira', 'José R. Lima', 'Marcos T. Souza', 'Antônio F. Silva', 'Paulo H. Costa',
  'Ricardo M. Alves', 'Edson L. Rocha', 'Luiz C. Martins', 'Sérgio P. Dias', 'Wagner J. Nunes', 'Fábio R. Gomes', 'Rogério S. Melo']
  .map((nome, i) => ({ id: uuid('motorista', i), nome, peso: 14 - i }))
const VEICULOS = ['QXA-1B23', 'RTB-4C56', 'PVD-7E89', 'OPF-2G34', 'HKL-5M67', 'GTR-8N90', 'QWE-3P12', 'RFT-6Q45', 'SDF-9R78', 'PLM-1S01']
  .map((nome, i) => ({ id: uuid('veiculo', i), nome, peso: 12 - i }))
const SUBCONTRATADAS = ['Transportes Bandeirante', 'Rodoviário Mantiqueira', 'TransMinas Cargas', 'Expresso Paraopeba', 'Cargas Oeste Ltda', 'Rota 381 Logística']
  .map((nome, i) => ({ id: uuid('subcontratada', i), nome, peso: [26, 20, 16, 12, 9, 6][i] }))
const PARCEIROS = ['Parceira Transportes A', 'Parceira Logística B', 'Parceira Cargas C', 'Parceira Rodoviário D']
  .map((nome, i) => ({ id: uuid('parceiro', i), nome, peso: [48, 30, 15, 7][i] }))

const ATENDENTES: { id: string; nome: string; perfil: string; ativo: boolean; peso: number }[] = [
  { nome: 'Ana Ribeiro', perfil: 'analista', peso: 18 },
  { nome: 'Bruno Carvalho', perfil: 'assistente', peso: 16 },
  { nome: 'Camila Ferreira', perfil: 'assistente', peso: 15 },
  { nome: 'Diego Moreira', perfil: 'assistente', peso: 13 },
  { nome: 'Elaine Santos', perfil: 'analista', peso: 12 },
  { nome: 'Fernando Lopes', perfil: 'assistente', peso: 10 },
  { nome: 'Gabriela Teixeira', perfil: 'supervisor', peso: 6 },
  { nome: 'Henrique Batista', perfil: 'assistente', peso: 3 },
].map((a, i) => ({ ...a, id: uuid('atendente', i), ativo: i !== 7 }))

/** Fatia do volume do agente de WhatsApp entre as entradas internas. */
const FRACAO_AGENTE = 0.18
const FRACAO_PARCEIRO = 0.38

// ── Datas ───────────────────────────────────────────────────────────────────

const DIA_MS = 86_400_000

function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Balde no formato do contrato (timestamptz com -03:00): o relógio local do
 * gerador vira o relógio de parede de SP, como o servidor faria.
 */
function isoSP(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${chaveDia(d)}T${p(d.getHours())}:00:00-03:00`
}

function lerDia(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function somarDias(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

function diasDoPeriodo(p: Periodo): Date[] {
  const out: Date[] = []
  const fim = lerDia(p.ate)
  for (let d = lerDia(p.de); d.getTime() <= fim.getTime() && out.length < 400; d = somarDias(d, 1)) out.push(d)
  return out
}

// Curva de chegada/finalização por hora (pico de manhã e à tarde).
const CURVA_HORA = [0, 0, 0, 0, 0, 0.2, 0.6, 1.4, 2.2, 2.6, 2.6, 2.3, 1.6, 2.0, 2.4, 2.4, 2.1, 1.6, 0.9, 0.4, 0.2, 0.1, 0, 0]
const SOMA_CURVA = CURVA_HORA.reduce((a, b) => a + b, 0)

/** Fração do volume do dia já ocorrida em `agora` (1 para dia passado, 0 futuro). */
function fracaoDoDia(dia: Date, agora: Date): number {
  const ini = dia.getTime()
  if (agora.getTime() >= ini + DIA_MS) return 1
  if (agora.getTime() <= ini) return 0
  const h = agora.getHours()
  const parcial = CURVA_HORA.slice(0, h).reduce((a, b) => a + b, 0) + CURVA_HORA[h] * (agora.getMinutes() / 60)
  return parcial / SOMA_CURVA
}

// ── Fatores dos filtros (frações determinísticas do total "todas") ──────────

function fatorOrigem(o: FiltrosComuns['origem']): number {
  return o === 'parceiro' ? FRACAO_PARCEIRO : o === 'interno' ? 1 - FRACAO_PARCEIRO : 1
}

function fatorCliente(id: string | null): number {
  if (!id) return 1
  const soma = CLIENTES.reduce((a, c) => a + c.peso, 0)
  return (CLIENTES.find((c) => c.id === id)?.peso ?? 0) / soma
}

function fatorLocal(local: string | null): number {
  if (!local) return 1
  const soma = LOCAIS.reduce((a, l) => a + l.peso, 0) + PESO_SEM_LOCAL
  if (local === 'Sem local') return PESO_SEM_LOCAL / soma
  return (LOCAIS.find((l) => l.nome === local)?.peso ?? 0) / soma
}

function fatorFiltros(f: FiltrosComuns): number {
  return fatorOrigem(f.origem) * fatorCliente(f.clienteId) * fatorLocal(f.local)
}

function escalaCenario(c: Cenario): number {
  return c === 'vazio' ? 0 : c === 'grande' ? 40 : 1
}

// ── Config de Metas e SLA (estado local do modo simulado) ───────────────────

let config: ConfigMetasSla = {
  etapas: ETAPAS_SLA.map((status, i) => ({
    id: uuid('sla', i),
    status,
    ...SLA_FALLBACK[status],
    atualizado_em: '2026-10-16T08:00:00-03:00',
    atualizado_por: null,
  })),
  metas: {
    id: uuid('metas', 0),
    meta_finalizadas_dia: null,
    meta_lead_time_p90_min: null,
    alerta_validade_h: 24,
    expediente_inicio: '07:00',
    expediente_fim: '18:00',
    atualizado_em: '2026-10-16T08:00:00-03:00',
    atualizado_por: null,
  },
  ultima_alteracao: null,
}

export function mockConfigMetasSla(): ConfigMetasSla {
  return structuredClone(config)
}

export function mockSalvarConfigMetasSla(entrada: ConfigMetasSlaEntrada, autorNome: string | null): ConfigMetasSla {
  const em = new Date().toISOString()
  config = {
    etapas: config.etapas.map((e) => {
      const nova = entrada.etapas.find((x) => x.status === e.status)
      return nova ? { ...e, ...nova, atualizado_em: em } : e
    }),
    metas: { ...config.metas, ...entrada.metas, atualizado_em: em },
    ultima_alteracao: { em, por_nome: autorNome },
  }
  return mockConfigMetasSla()
}

// ── Fila simulada (base do Painel) ──────────────────────────────────────────

interface ItemFila {
  id: string
  numero_interno: number
  status: EtapaSla
  status_desde: number
  created_at: number
  origem: 'interno' | 'parceiro' | 'email' | 'whatsapp'
  cliente: Entidade
  local: string | null
  parceiro: string | null
  validade_fim: string | null
  pamcard_pendente: boolean
  pendencia_aberta: boolean
}

function escolher<T extends { peso: number }>(r: () => number, lista: T[]): T {
  const soma = lista.reduce((a, x) => a + x.peso, 0)
  let alvo = r() * soma
  for (const x of lista) {
    alvo -= x.peso
    if (alvo <= 0) return x
  }
  return lista[lista.length - 1]
}

function gerarFila(agora: Date, cenario: Cenario): ItemFila[] {
  const escala = escalaCenario(cenario)
  if (escala === 0) return []
  const bucket = Math.floor(agora.getTime() / 600_000)
  const ref = bucket * 600_000
  const r = gerador(`fila:${bucket}`)
  const nFila = Math.round(entre(r, 38, 48) * escala)
  const nEnviadas = Math.round(entre(r, 10, 16) * escala)
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const itens: ItemFila[] = []
  const pesosEtapa = [{ s: 'recebida', peso: 30 }, { s: 'em_cadastro', peso: 30 }, { s: 'instrucao_emitida', peso: 20 }, { s: 'oc_gerada', peso: 20 }] as const
  for (let i = 0; i < nFila + nEnviadas; i++) {
    const status: EtapaSla = i < nFila ? escolher(r, [...pesosEtapa]).s : 'oc_enviada'
    const x = r()
    // 60% recentes, 25% entre o aviso e o alerta, 15% fora do SLA.
    const idadeMin = x < 0.6 ? entre(r, 1, 115) : x < 0.85 ? entre(r, 125, 470) : entre(r, 490, 2600)
    const statusDesde = ref - idadeMin * 60_000
    const antes = ETAPAS_SLA.indexOf(status) * entre(r, 10, 90)
    const createdAt = statusDesde - antes * 60_000
    const xo = r()
    const origem: ItemFila['origem'] = xo < FRACAO_PARCEIRO ? 'parceiro' : xo < 0.82 ? 'interno' : xo < 0.92 ? 'email' : 'whatsapp'
    const semLocal = r() < 0.08
    const local = semLocal ? null : escolher(r, LOCAIS).nome
    const comValidade = status === 'oc_gerada' || status === 'oc_enviada'
    itens.push({
      id: uuid('sol', bucket * 10_000 + i),
      numero_interno: 0,
      status,
      status_desde: statusDesde,
      created_at: createdAt,
      origem,
      cliente: escolher(r, CLIENTES),
      local,
      parceiro: origem === 'parceiro' ? escolher(r, PARCEIROS).nome : null,
      validade_fim: comValidade ? chaveDia(somarDias(hoje, Math.floor(entre(r, -1.3, 5)))) : null,
      pamcard_pendente: origem === 'parceiro' && r() < 0.25,
      pendencia_aberta: origem === 'parceiro' && r() < 0.15,
    })
  }
  // Nº interno crescente pela data de criação, como no sistema.
  itens.sort((a, b) => a.created_at - b.created_at)
  const base = 5200 + bucket % 1000
  itens.forEach((it, i) => { it.numero_interno = base + i })
  return itens
}

function filtrarFila(itens: ItemFila[], f: FiltrosComuns): ItemFila[] {
  return itens.filter((it) => {
    if (f.origem === 'parceiro' && it.origem !== 'parceiro') return false
    if (f.origem === 'interno' && it.origem === 'parceiro') return false
    if (f.clienteId && it.cliente.id !== f.clienteId) return false
    if (f.local && (it.local ?? 'Sem local') !== f.local) return false
    return true
  })
}

const FAIXAS: { faixa: FaixaIdade; ate: number }[] = [
  { faixa: 'lt1h', ate: 60 },
  { faixa: '1a4h', ate: 240 },
  { faixa: '4a8h', ate: 480 },
  { faixa: '8a24h', ate: 1440 },
  { faixa: 'gt24h', ate: Infinity },
]

export function mockPainelEstadoAtual(f: FiltrosComuns, agora: Date, cenario: Cenario): PainelEstadoAtual {
  const cfg = mapaSla(config.etapas)
  const itens = filtrarFila(gerarFila(agora, cenario), f)
  const classes = itens.map((it) => classificarSla(it.status, it.status_desde, agora, cfg[it.status]))
  const naFila = itens.filter((it) => (ETAPAS_FILA as string[]).includes(it.status))

  const etapas = ETAPAS_SLA.map((status) => {
    const daEtapa = itens.map((it, i) => ({ it, c: classes[i] })).filter((x) => x.it.status === status)
    const maisAntiga = daEtapa.reduce<number | null>(
      (m, x) => Math.max(m ?? 0, minutosNaEtapa(x.it.status_desde, agora)),
      null,
    )
    return {
      status,
      qtd: daEtapa.length,
      fora_sla: daEtapa.filter((x) => x.c === 'fora').length,
      aviso: daEtapa.filter((x) => x.c === 'aviso').length,
      mais_antiga_min: maisAntiga == null ? null : Math.round(maisAntiga),
    }
  })

  const aging = FAIXAS.map(({ faixa }, i) => ({
    faixa,
    qtd: naFila.filter((it) => {
      const min = minutosNaEtapa(it.created_at, agora)
      return min >= (i === 0 ? 0 : FAIXAS[i - 1].ate) && min < FAIXAS[i].ate
    }).length,
  }))

  const hoje = chaveDia(agora)
  const limiteValidade = chaveDia(new Date(agora.getTime() + config.metas.alerta_validade_h * 3_600_000))
  const comValidade = itens.filter((it) => it.validade_fim)
  const vencidas = comValidade.filter((it) => (it.validade_fim as string) < hoje).length
  const vencendo = comValidade.filter((it) => (it.validade_fim as string) >= hoje && (it.validade_fim as string) <= limiteValidade).length

  const porLocalMapa = new Map<string, { qtd: number; fora_sla: number }>()
  naFila.forEach((it) => {
    const k = it.local ?? 'Sem local'
    const atual = porLocalMapa.get(k) ?? { qtd: 0, fora_sla: 0 }
    atual.qtd++
    if (classificarSla(it.status, it.status_desde, agora, cfg[it.status]) === 'fora') atual.fora_sla++
    porLocalMapa.set(k, atual)
  })
  const locais = [...porLocalMapa.entries()].map(([local, v]) => ({ local, ...v })).sort((a, b) => b.qtd - a.qtd)
  const por_local = locais.slice(0, 6)
  if (locais.length > 6) {
    const resto = locais.slice(6)
    por_local.push({ local: 'Outros', qtd: resto.reduce((a, l) => a + l.qtd, 0), fora_sla: resto.reduce((a, l) => a + l.fora_sla, 0) })
  }

  const atrasadas: PainelAtrasada[] = naFila
    .map((it) => ({ it, min: minutosNaEtapa(it.status_desde, agora) }))
    .filter(({ it }) => classificarSla(it.status, it.status_desde, agora, cfg[it.status]) === 'fora')
    .map(({ it, min }) => ({
      id: it.id,
      numero_interno: it.numero_interno,
      status: it.status as PainelAtrasada['status'],
      cliente: it.cliente.nome,
      local: it.local,
      origem: it.origem,
      min_na_etapa: Math.round(min),
      excesso_min: Math.round(min - cfg[it.status].alerta_min),
    }))
    .sort((a, b) => b.excesso_min - a.excesso_min)
    .slice(0, 12)

  return {
    gerado_em: agora.toISOString(),
    fila: {
      total: naFila.length,
      aguardando_finalizacao: itens.length - naFila.length,
      fora_sla: classes.filter((c) => c === 'fora').length,
      aviso: classes.filter((c) => c === 'aviso').length,
    },
    etapas,
    aging,
    validade: { vencendo, vencidas },
    pamcard_pendente: itens.filter((it) => it.pamcard_pendente).length,
    pendencias_parceiro: itens.filter((it) => it.pendencia_aberta).length,
    por_local,
    atrasadas,
  }
}

export function mockFilaPrevia(agora: Date, cenario: Cenario): ItemFilaPrevia[] {
  return gerarFila(agora, cenario).map((it) => ({ status: it.status, status_desde: new Date(it.status_desde).toISOString() }))
}

// ── Volume por dia (base dos Relatórios e do "hoje") ────────────────────────

interface Dia {
  entradas: number
  finalizadas: number
  canceladas: number
  /** Taxa de conclusão em até 48 h das entradas do dia (sem canceladas). */
  taxa48: number
  leadP50: number
  leadP90: number
  dentroSla: number
}

/** Volume do dia para "todas" (sem recorte), na fração `fracao` do dia. */
function diaBase(d: Date, fracao: number, cenario: Cenario): Dia {
  const r = gerador(`dia:${chaveDia(d)}`)
  const dow = d.getDay()
  const media = dow === 0 ? 5 : dow === 6 ? 14 : 44
  const escala = escalaCenario(cenario)
  const entradasDia = Math.round(entre(r, media * 0.8, media * 1.2) * escala)
  const finalizadasDia = Math.round(entradasDia * entre(r, 0.88, 1.04))
  const canceladasDia = Math.round(entradasDia * entre(r, 0.02, 0.06))
  return {
    entradas: Math.round(entradasDia * fracao),
    finalizadas: Math.round(finalizadasDia * fracao),
    canceladas: Math.round(canceladasDia * fracao),
    taxa48: entre(r, 0.76, 0.93),
    leadP50: entre(r, 160, 230),
    leadP90: entre(r, 480, 720),
    dentroSla: entre(r, 0.7, 0.88),
  }
}

function recortar(v: number, f: FiltrosComuns, chave: string): number {
  // Origem: interno = total − parceiro (soma fecha). Cliente/local: fração.
  let x = v
  if (f.origem !== 'todas') {
    const parceiro = Math.round(v * FRACAO_PARCEIRO)
    x = f.origem === 'parceiro' ? parceiro : v - parceiro
  }
  const fr = fatorCliente(f.clienteId) * fatorLocal(f.local)
  if (fr === 1) return x
  // Arredondamento estocástico por semente, para dias pequenos não zerarem sempre.
  const bruto = x * fr
  return Math.floor(bruto) + (gerador(`rec:${chave}`)() < bruto - Math.floor(bruto) ? 1 : 0)
}

function diaRecortado(d: Date, fracao: number, f: FiltrosComuns, cenario: Cenario): Dia {
  const b = diaBase(d, fracao, cenario)
  const k = `${chaveDia(d)}|${f.clienteId}|${f.local}`
  return {
    ...b,
    entradas: recortar(b.entradas, f, `${k}|e`),
    finalizadas: recortar(b.finalizadas, f, `${k}|f`),
    canceladas: recortar(b.canceladas, f, `${k}|c`),
  }
}

/** Dias do período até hoje, com a fração de hoje; e o par do período anterior. */
function diasComPar(p: Periodo, agora: Date): { dia: Date; fracao: number; par: Date }[] {
  const dias = diasDoPeriodo(p)
  const n = dias.length
  return dias
    .map((dia) => ({ dia, fracao: fracaoDoDia(dia, agora), par: somarDias(dia, -n) }))
    .filter((x) => x.fracao > 0)
}

function blocoResumo(lista: { dia: Date; fracao: number }[], f: FiltrosComuns, agora: Date, cenario: Cenario): ResumoBloco {
  let entradas = 0
  let finalizadas = 0
  let canceladas = 0
  let elegiveis = 0
  let ok48 = 0
  let somaP50 = 0
  let somaP90 = 0
  let somaSla = 0
  const limite48 = agora.getTime() - 2 * DIA_MS
  for (const { dia, fracao } of lista) {
    const d = diaRecortado(dia, fracao, f, cenario)
    entradas += d.entradas
    finalizadas += d.finalizadas
    canceladas += d.canceladas
    if (dia.getTime() + DIA_MS <= limite48) {
      const e = Math.max(0, d.entradas - d.canceladas)
      elegiveis += e
      ok48 += Math.round(e * d.taxa48)
    }
    somaP50 += d.leadP50 * d.finalizadas
    somaP90 += d.leadP90 * d.finalizadas
    somaSla += d.dentroSla * d.finalizadas
  }
  const lead: Percentis = finalizadas > 0
    ? { p50: Math.round(somaP50 / finalizadas), p90: Math.round(somaP90 / finalizadas), n: finalizadas }
    : { p50: null, p90: null, n: 0 }
  return {
    entradas,
    finalizadas,
    canceladas,
    conclusao48_pct: elegiveis > 0 ? ok48 / elegiveis : null,
    conclusao48_n: elegiveis,
    cancelamento_pct: entradas > 0 ? canceladas / entradas : null,
    lead,
    dentro_sla_pct: finalizadas > 0 ? somaSla / finalizadas : null,
  }
}

export function mockRelatorioResumo(p: FiltrosPeriodo, agora: Date, cenario: Cenario): RelatorioResumo {
  const dias = diasComPar(p, agora)
  const atual = blocoResumo(dias, p, agora, cenario)
  const anterior = blocoResumo(dias.map((x) => ({ dia: x.par, fracao: x.fracao })), p, agora, cenario)
  const n = diasDoPeriodo(p).length
  const ini = lerDia(p.de)
  const fimNominal = somarDias(lerDia(p.ate), 1)
  const fim = new Date(Math.min(fimNominal.getTime(), agora.getTime()))
  return {
    atual,
    anterior,
    limites: {
      ini: ini.toISOString(),
      fim: fim.toISOString(),
      ini_ant: somarDias(ini, -n).toISOString(),
      fim_ant: new Date(fim.getTime() - n * DIA_MS).toISOString(),
    },
  }
}

/** Distribui o volume de um dia por hora (soma exata). */
function porHora(total: number, fracao: number, agora: Date, dia: Date): number[] {
  const pesos = CURVA_HORA.map((w, h) => {
    if (fracao >= 1) return w
    const fimHora = dia.getTime() + (h + 1) * 3_600_000
    const iniHora = dia.getTime() + h * 3_600_000
    if (agora.getTime() >= fimHora) return w
    if (agora.getTime() <= iniHora) return 0
    return w * ((agora.getTime() - iniHora) / 3_600_000)
  })
  return repartir(total, pesos)
}

export function mockRelatorioSerie(p: FiltrosPeriodo, gran: Granularidade, agora: Date, cenario: Cenario): SerieLinha[] {
  const todos = diasDoPeriodo(p)
  const n = todos.length
  const linhas: SerieLinha[] = []
  if (gran === 'hora') {
    for (const dia of todos) {
      const fr = fracaoDoDia(dia, agora)
      const par = somarDias(dia, -n)
      const d = diaRecortado(dia, fr, p, cenario)
      const a = diaRecortado(par, fr, p, cenario)
      const agoraPar = new Date(agora.getTime() - n * DIA_MS)
      const he = porHora(d.entradas, fr, agora, dia)
      const hf = porHora(d.finalizadas, fr, agora, dia)
      const hc = porHora(d.canceladas, fr, agora, dia)
      const hea = porHora(a.entradas, fr, agoraPar, par)
      const hfa = porHora(a.finalizadas, fr, agoraPar, par)
      for (let h = 0; h < 24; h++) {
        linhas.push({
          balde: isoSP(new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h)),
          entradas: he[h], finalizadas: hf[h], canceladas: hc[h], entradas_ant: hea[h], finalizadas_ant: hfa[h],
        })
      }
    }
    return linhas
  }
  for (const dia of todos) {
    const fr = fracaoDoDia(dia, agora)
    const d = diaRecortado(dia, fr, p, cenario)
    const a = diaRecortado(somarDias(dia, -n), fr, p, cenario)
    // Semana começa na segunda-feira.
    const chave = gran === 'semana' ? somarDias(dia, -((dia.getDay() + 6) % 7)) : dia
    const balde = isoSP(chave)
    const ult = linhas[linhas.length - 1]
    const alvo = ult && ult.balde === balde ? ult : null
    if (alvo) {
      alvo.entradas += d.entradas
      alvo.finalizadas += d.finalizadas
      alvo.canceladas += d.canceladas
      alvo.entradas_ant += a.entradas
      alvo.finalizadas_ant += a.finalizadas
    } else {
      linhas.push({ balde, entradas: d.entradas, finalizadas: d.finalizadas, canceladas: d.canceladas, entradas_ant: a.entradas, finalizadas_ant: a.finalizadas })
    }
  }
  return linhas
}

const P50_ETAPA: Record<EtapaSla, [number, number, number]> = {
  // p50, p90, fração acima do alerta
  recebida: [40, 150, 0.03],
  em_cadastro: [55, 210, 0.06],
  instrucao_emitida: [35, 130, 0.02],
  oc_gerada: [20, 90, 0.01],
  oc_enviada: [25, 160, 0],
}

export function mockRelatorioTempoEtapas(p: FiltrosPeriodo, agora: Date, cenario: Cenario): TempoEtapaLinha[] {
  const { atual } = mockRelatorioResumo(p, agora, cenario)
  const r = gerador(`etapas:${p.de}:${p.ate}`)
  const cfg = mapaSla(config.etapas)
  return ETAPAS_SLA.map((status) => {
    const [p50, p90, acima] = P50_ETAPA[status]
    const n = Math.round(atual.finalizadas * entre(r, 0.95, 1.02))
    const v = entre(r, 0.85, 1.2)
    return {
      status,
      n,
      p50_min: n > 0 ? Math.round(p50 * v) : null,
      p90_min: n > 0 ? Math.round(p90 * v) : null,
      acima_alerta_pct: n > 0 && cfg[status].ativo ? acima * entre(r, 0.6, 1.5) : null,
    }
  })
}

function catalogo(dim: DimensaoRanking): { id: string; nome: string; peso: number }[] {
  switch (dim) {
    case 'cliente': return CLIENTES
    case 'material': return MATERIAIS
    case 'local': return [...LOCAIS.map((l) => ({ id: l.nome, nome: l.nome, peso: l.peso })), { id: 'Sem local', nome: 'Sem local', peso: PESO_SEM_LOCAL }]
    case 'motorista': return MOTORISTAS
    case 'veiculo': return VEICULOS
    case 'subcontratada': return SUBCONTRATADAS
    case 'parceiro': return PARCEIROS
    case 'origem': return []
  }
}

export function mockRelatorioRanking(
  p: FiltrosPeriodo,
  dim: DimensaoRanking,
  limite: number,
  agora: Date,
  cenario: Cenario,
): RankingLinha[] {
  const r = gerador(`ranking:${dim}:${p.de}:${p.ate}`)
  if (dim === 'origem') {
    const origens: ('interno' | 'parceiro')[] = p.origem === 'todas' ? ['interno', 'parceiro'] : [p.origem]
    return origens.map((o) => {
      const b = mockRelatorioResumo({ ...p, origem: o }, agora, cenario).atual
      return {
        chave: o,
        rotulo: o === 'interno' ? 'Interno' : 'Parceiros',
        entradas: b.entradas,
        finalizadas: b.finalizadas,
        lead_p50_min: b.lead.p50,
        emissao_p50_min: null,
        emissao_p90_min: null,
      }
    })
  }
  if (dim === 'parceiro' && p.origem === 'interno') return []
  const base = mockRelatorioResumo(dim === 'parceiro' ? { ...p, origem: 'parceiro' } : p, agora, cenario).atual
  let lista = catalogo(dim)
  if (dim === 'cliente' && p.clienteId) lista = lista.filter((c) => c.id === p.clienteId)
  if (dim === 'local' && p.local) lista = lista.filter((c) => c.id === p.local)
  const ents = repartir(base.entradas, lista.map((c) => c.peso * entre(r, 0.7, 1.3)))
  const fins = repartir(base.finalizadas, lista.map((_c, i) => ents[i] * entre(r, 0.85, 1.05)))
  return lista
    .map((c, i) => {
      const temDado = fins[i] > 0
      const emissao = dim === 'parceiro' && temDado ? entre(r, 90, 170) : null
      return {
        chave: c.id,
        rotulo: c.nome,
        entradas: ents[i],
        finalizadas: fins[i],
        lead_p50_min: temDado ? Math.round(entre(r, 140, 300)) : null,
        emissao_p50_min: emissao == null ? null : Math.round(emissao),
        emissao_p90_min: emissao == null ? null : Math.round(emissao * entre(r, 2.6, 3.6)),
      }
    })
    .filter((l) => l.entradas > 0 || l.finalizadas > 0)
    .sort((a, b) => b.entradas - a.entradas)
    .slice(0, limite)
}

export function mockRelatorioLocais(p: Periodo, agora: Date, cenario: Cenario): LocalLinha[] {
  return mockRelatorioRanking({ ...p, origem: 'todas', clienteId: null, local: null }, 'local', 50, agora, cenario)
    .map((l) => ({ local: l.chave, qtd: l.entradas }))
}

export function mockOpcoesClientes(): OpcaoCliente[] {
  return [...CLIENTES].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((c) => ({ id: c.id, nome: c.nome }))
}

// ── Produtividade ───────────────────────────────────────────────────────────

export function mockProdutividade(p: Periodo, agora: Date, cenario: Cenario): Produtividade {
  const todas: FiltrosPeriodo = { ...p, origem: 'todas', clienteId: null, local: null }
  const tot = mockRelatorioResumo(todas, agora, cenario).atual
  const parc = mockRelatorioResumo({ ...todas, origem: 'parceiro' }, agora, cenario).atual
  const internas = tot.entradas - parc.entradas
  const doAgente = Math.round(internas * FRACAO_AGENTE)
  const r = gerador(`prod:${p.de}:${p.ate}`)
  const pesos = ATENDENTES.map((a) => a.peso * entre(r, 0.75, 1.25))

  const incluiHoje = lerDia(p.ate).getTime() + DIA_MS > agora.getTime() && lerDia(p.de).getTime() <= agora.getTime()
  const fila = incluiHoje ? gerarFila(agora, cenario) : []
  const abertas = fila.filter((it) => it.status !== 'recebida')
  const dono = (id: string) => ATENDENTES[hash(id) % ATENDENTES.length]

  const criou = repartir(internas - doAgente, pesos)
  const emEmissao = repartir(Math.round(tot.entradas * 0.97) - Math.round(doAgente * 0.4), pesos)
  const gerou = repartir(Math.round(tot.finalizadas * 1.01), pesos)
  const enviou = repartir(Math.round(tot.finalizadas * 1.0), pesos)
  const finalizou = repartir(tot.finalizadas - Math.round(doAgente * 0.1), pesos)

  const usuarios: ProdutividadeUsuario[] = ATENDENTES.map((a, i) => {
    const minhas = abertas.filter((it) => dono(it.id).id === a.id)
    const parada = minhas.reduce<number | null>((m, it) => Math.max(m ?? 0, minutosNaEtapa(it.status_desde, agora)), null)
    return {
      usuario_id: a.id,
      nome: a.nome,
      perfil: a.perfil,
      ativo: a.ativo,
      criou: criou[i],
      em_emissao: emEmissao[i],
      gerou_oc: gerou[i],
      enviou_oc: enviou[i],
      finalizou: finalizou[i],
      conclusao_p50_min: finalizou[i] > 0 ? Math.round(entre(r, 110, 280)) : null,
      em_aberto: minhas.length,
      parada_mais_longa_min: parada == null ? null : Math.round(parada),
    }
  }).sort((a, b) => b.finalizou - a.finalizou)

  const agente: ProdutividadeUsuario | null = cenario === 'vazio' ? null : {
    usuario_id: uuid('agente', 0),
    nome: 'Agente WhatsApp',
    perfil: 'assistente',
    ativo: true,
    criou: doAgente,
    em_emissao: Math.round(doAgente * 0.4),
    gerou_oc: 0,
    enviou_oc: 0,
    finalizou: Math.round(doAgente * 0.1),
    conclusao_p50_min: doAgente > 0 ? Math.round(entre(r, 40, 90)) : null,
    em_aberto: 0,
    parada_mais_longa_min: null,
  }

  const abertas_paradas: AbertaParada[] = abertas
    .filter((it) => it.origem === 'parceiro')
    .map((it) => ({
      id: it.id,
      numero_interno: it.numero_interno,
      status: it.status as SolicitacaoStatus,
      parceiro: it.parceiro,
      responsavel: dono(it.id).nome,
      min_na_etapa: Math.round(minutosNaEtapa(it.status_desde, agora)),
    }))
    .sort((a, b) => b.min_na_etapa - a.min_na_etapa)
    .slice(0, 15)

  return {
    usuarios,
    agente,
    abertas_paradas,
    totais: {
      entradas: tot.entradas,
      de_parceiro: parc.entradas,
      finalizadas: tot.finalizadas,
      abertas: incluiHoje ? fila.length : Math.round(tot.entradas * 0.01),
      recebidas_sem_responsavel: fila.filter((it) => it.status === 'recebida').length,
    },
  }
}

// ── Exportação tidy (§5) ────────────────────────────────────────────────────

export function mockExportacao(p: FiltrosPeriodo, offset: number, limite: number, agora: Date, cenario: Cenario): ExportLinha[] {
  const dias = diasComPar(p, agora)
  const out: ExportLinha[] = []
  let idx = 0
  let numero = 4000
  for (const { dia, fracao } of dias) {
    const d = diaRecortado(dia, fracao, p, cenario)
    if (idx + d.entradas <= offset) {
      idx += d.entradas
      numero += d.entradas
      continue
    }
    const horas = porHora(d.entradas, fracao, agora, dia)
    let h = 0
    let usadosNaHora = 0
    for (let j = 0; j < d.entradas; j++, idx++, numero++) {
      while (h < 23 && usadosNaHora >= horas[h]) { h++; usadosNaHora = 0 }
      usadosNaHora++
      if (idx < offset) continue
      if (out.length >= limite) return out
      const r = gerador(`linha:${chaveDia(dia)}:${j}`)
      const criada = dia.getTime() + h * 3_600_000 + Math.floor(r() * 3_600_000)
      const cancelada = j < d.canceladas
      const mins = [40, 55, 35, 20, 25].map((m) => Math.round(m * entre(r, 0.3, 2.4)))
      const lead = mins.reduce((a, b) => a + b, 0)
      const fim = criada + lead * 60_000
      const finalizada = !cancelada && fim < agora.getTime()
      const parceiro = p.origem === 'parceiro' || (p.origem === 'todas' && r() < FRACAO_PARCEIRO)
      const cli = p.clienteId ? CLIENTES.find((c) => c.id === p.clienteId) ?? CLIENTES[0] : escolher(r, CLIENTES)
      const status: SolicitacaoStatus = cancelada ? 'cancelada' : finalizada ? 'finalizada' : 'em_cadastro'
      out.push({
        numero_interno: numero,
        origem: parceiro ? 'parceiro' : 'interno',
        parceiro: parceiro ? escolher(r, PARCEIROS).nome : null,
        cliente: cli.nome,
        material: escolher(r, MATERIAIS).nome,
        local: p.local ?? escolher(r, LOCAIS).nome,
        status,
        criada_em: new Date(criada).toISOString(),
        finalizada_em: finalizada ? new Date(fim).toISOString() : null,
        lead_min: finalizada ? lead : null,
        min_recebida: cancelada ? null : mins[0],
        min_em_cadastro: finalizada ? mins[1] : null,
        min_instrucao_emitida: finalizada ? mins[2] : null,
        min_oc_gerada: finalizada ? mins[3] : null,
        min_oc_enviada: finalizada ? mins[4] : null,
      })
    }
  }
  return out
}

// ── Mapa de calor (R13) ─────────────────────────────────────────────────────

export function mockMapaCalor(p: FiltrosPeriodo, agora: Date, cenario: Cenario): MapaCalorCelula[] {
  const grade = new Map<string, number>()
  for (const { dia, fracao } of diasComPar(p, agora)) {
    const d = diaRecortado(dia, fracao, p, cenario)
    porHora(d.entradas, fracao, agora, dia).forEach((v, h) => {
      const k = `${dia.getDay()}:${h}`
      grade.set(k, (grade.get(k) ?? 0) + v)
    })
  }
  const out: MapaCalorCelula[] = []
  for (let dow = 0; dow < 7; dow++) for (let hora = 0; hora < 24; hora++) out.push({ dow, hora, entradas: grade.get(`${dow}:${hora}`) ?? 0 })
  return out
}

// ── Painel: hoje ────────────────────────────────────────────────────────────

/**
 * Relógio do "hoje" simulado. O preview não pode parecer vazio de manhã cedo:
 * de madrugada (antes das 6h) mostra o dia anterior completo; até as 13h
 * simula o dia até as 13h (8 h de curva, que começa às 5h); depois, o real.
 */
function relogioDoHoje(agora: Date): Date {
  const h = agora.getHours()
  if (h < 6) return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0, -1)
  if (h < 13) return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 13, 0, 0)
  return agora
}

export function mockPainelHoje(f: FiltrosComuns, agoraReal: Date, cenario: Cenario): PainelHoje {
  const agora = relogioDoHoje(agoraReal)
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const ontem = somarDias(hoje, -1)
  const fr = fracaoDoDia(hoje, agora)
  const d = diaRecortado(hoje, fr, f, cenario)
  const o = diaRecortado(ontem, fr, f, cenario)
  const hf = porHora(d.finalizadas, fr, agora, hoje)
  const he = porHora(d.entradas, fr, agora, hoje)
  // Referência: média de 4 semanas na mesma hora (dia inteiro, sem corte).
  const r = gerador(`ref:${chaveDia(hoje)}`)
  const mediaDia = (hoje.getDay() === 0 ? 5 : hoje.getDay() === 6 ? 14 : 44) * escalaCenario(cenario) * fatorFiltros(f)
  const ref = CURVA_HORA.map((w) => Math.round(((mediaDia * w) / SOMA_CURVA) * entre(r, 0.85, 1.15) * 10) / 10)
  const h = agora.getHours()
  const min = agora.getMinutes() / 60
  const finalizadas_2h = hf[h] + (h > 0 ? hf[h - 1] : 0) + (h > 1 ? Math.round(hf[h - 2] * (1 - min)) : 0)
  const lead = (semente: string, n: number): Percentis => {
    const rr = gerador(semente)
    return n > 0 ? { p50: Math.round(entre(rr, 165, 220)), p90: Math.round(entre(rr, 500, 700)), n } : { p50: null, p90: null, n: 0 }
  }
  const n7 = Math.round(7 * 36 * escalaCenario(cenario) * fatorFiltros(f))
  const metaCfg = config.metas.meta_finalizadas_dia
  return {
    finalizadas: d.finalizadas,
    finalizadas_ref: o.finalizadas,
    meta: metaCfg ?? (cenario === 'meta' ? 45 : null),
    finalizadas_2h,
    lead7d: lead(`lead7:${chaveDia(hoje)}`, n7),
    lead7d_ant: lead(`lead7ant:${chaveDia(hoje)}`, Math.round(n7 * 0.96)),
    por_hora: CURVA_HORA.map((_w, hora) => ({ hora, finalizadas: hf[hora], entradas: he[hora], ref: ref[hora] })),
  }
}
