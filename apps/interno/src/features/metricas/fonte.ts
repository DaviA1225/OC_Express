// Ponto ÚNICO de acesso aos dados dos dashboards (Painel, TV, Relatórios,
// Produtividade, Metas e SLA). As telas e os hooks só falam com este arquivo.
//
// ─── Troca simulada → RPC ───────────────────────────────────────────────────
// Hoje `FONTE = 'simulada'`: tudo vem de `mocks.ts`. Quando a migration 0080
// (RPCs da §2.5 do plano) estiver no remoto:
//   1. regenerar `packages/shared/src/database.types.ts` (as RPCs entram em
//      Database['public']['Functions']);
//   2. trocar a constante abaixo para 'rpc';
//   3. substituir `rpc()` (cast sem tipo) por `supabase.rpc` tipado e apagar
//      `mocks.ts` + o selo "Dados simulados" (some sozinho com FONTE='rpc').
// Os nomes de parâmetro (`p_de`, `p_origem`…) e os retornos (tipos.ts) já
// seguem o plano; nenhuma tela muda.
// ────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase'
import * as mock from './mocks'
import type {
  ConfigMetasSla,
  ConfigMetasSlaEntrada,
  DimensaoRanking,
  ExportLinha,
  FiltrosComuns,
  FiltrosPeriodo,
  Granularidade,
  ItemFilaPrevia,
  LocalLinha,
  MapaCalorCelula,
  OpcaoCliente,
  PainelEstadoAtual,
  PainelHoje,
  Periodo,
  Produtividade,
  RankingLinha,
  RelatorioResumo,
  SerieLinha,
  TempoEtapaLinha,
} from './tipos'

export const FONTE = 'simulada' as 'simulada' | 'rpc'

/** Verdadeiro enquanto as telas mostram dados de mentira (selo no cabeçalho). */
export const DADOS_SIMULADOS = FONTE === 'simulada'

/** Latência artificial do modo simulado — o esqueleto aparece como no real. */
const LATENCIA_MS = 350

function cenario(): mock.Cenario {
  try {
    const c = new URLSearchParams(window.location.search).get('cenario')
    return c === 'vazio' || c === 'grande' || c === 'meta' ? c : 'normal'
  } catch {
    return 'normal'
  }
}

function simular<T>(fn: (agora: Date, c: mock.Cenario) => T): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(fn(new Date(), cenario())), LATENCIA_MS)
  })
}

// As RPCs ainda não existem nos tipos gerados; até o passo 1 acima, chamada sem tipo.
type RpcSemTipo = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>

async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as unknown as RpcSemTipo)(nome, args)
  if (error) throw error
  return data as T
}

function argsF(f: FiltrosComuns): Record<string, unknown> {
  return { p_origem: f.origem, p_cliente_id: f.clienteId, p_local: f.local }
}

function argsP(p: FiltrosPeriodo): Record<string, unknown> {
  return { p_de: p.de, p_ate: p.ate, ...argsF(p) }
}

// ── Painel / TV ─────────────────────────────────────────────────────────────

export function buscarPainelEstadoAtual(f: FiltrosComuns): Promise<PainelEstadoAtual> {
  if (FONTE === 'simulada') return simular((agora, c) => mock.mockPainelEstadoAtual(f, agora, c))
  return rpc('painel_estado_atual', argsF(f))
}

export function buscarPainelHoje(f: FiltrosComuns): Promise<PainelHoje> {
  if (FONTE === 'simulada') return simular((agora, c) => mock.mockPainelHoje(f, agora, c))
  return rpc('painel_hoje', argsF(f))
}

// ── Relatórios ──────────────────────────────────────────────────────────────

export function buscarRelatorioResumo(p: FiltrosPeriodo): Promise<RelatorioResumo> {
  if (FONTE === 'simulada') return simular((agora, c) => mock.mockRelatorioResumo(p, agora, c))
  return rpc('relatorio_resumo', argsP(p))
}

export function buscarRelatorioSerie(p: FiltrosPeriodo, granularidade: Granularidade): Promise<SerieLinha[]> {
  if (FONTE === 'simulada') return simular((agora, c) => mock.mockRelatorioSerie(p, granularidade, agora, c))
  return rpc('relatorio_serie', { ...argsP(p), p_granularidade: granularidade })
}

export function buscarRelatorioTempoEtapas(p: FiltrosPeriodo): Promise<TempoEtapaLinha[]> {
  if (FONTE === 'simulada') return simular((agora, c) => mock.mockRelatorioTempoEtapas(p, agora, c))
  return rpc('relatorio_tempo_etapas', argsP(p))
}

export function buscarRelatorioRanking(p: FiltrosPeriodo, dimensao: DimensaoRanking, limite = 50): Promise<RankingLinha[]> {
  if (FONTE === 'simulada') return simular((agora, c) => mock.mockRelatorioRanking(p, dimensao, limite, agora, c))
  return rpc('relatorio_ranking', { ...argsP(p), p_dimensao: dimensao, p_limite: limite })
}

export function buscarRelatorioLocais(p: Periodo): Promise<LocalLinha[]> {
  if (FONTE === 'simulada') return simular((agora, c) => mock.mockRelatorioLocais(p, agora, c))
  return rpc('relatorio_locais', { p_de: p.de, p_ate: p.ate })
}

export function buscarMapaCalor(p: FiltrosPeriodo): Promise<MapaCalorCelula[]> {
  if (FONTE === 'simulada') return simular((agora, c) => mock.mockMapaCalor(p, agora, c))
  return rpc('relatorio_mapa_calor', argsP(p))
}

export function buscarProdutividade(p: Periodo): Promise<Produtividade> {
  if (FONTE === 'simulada') return simular((agora, c) => mock.mockProdutividade(p, agora, c))
  return rpc('relatorio_produtividade', { p_de: p.de, p_ate: p.ate })
}

/** Uma página (≤ 1000 linhas) do CSV de dados tidy (§5). */
export function buscarExportacaoPagina(p: FiltrosPeriodo, offset: number, limite = 1000): Promise<ExportLinha[]> {
  const lim = Math.min(limite, 1000)
  if (FONTE === 'simulada') return simular((agora, c) => mock.mockExportacao(p, offset, lim, agora, c))
  return rpc('exportar_solicitacoes_periodo', { ...argsP(p), p_offset: offset, p_limite: lim })
}

// ── Opções dos filtros ──────────────────────────────────────────────────────

export async function buscarOpcoesClientes(): Promise<OpcaoCliente[]> {
  if (FONTE === 'simulada') return simular(() => mock.mockOpcoesClientes())
  const { data, error } = await supabase.from('clientes').select('id, razao_social').order('razao_social').range(0, 999)
  if (error) throw error
  return ((data ?? []) as { id: string; razao_social: string }[]).map((c) => ({ id: c.id, nome: c.razao_social }))
}

// ── Metas e SLA ─────────────────────────────────────────────────────────────

export async function buscarConfigMetasSla(): Promise<ConfigMetasSla> {
  if (FONTE === 'simulada') return simular(() => mock.mockConfigMetasSla())
  const sb = supabase as unknown as { from: (t: string) => { select: (c: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> } }
  const [et, me] = await Promise.all([
    sb.from('sla_etapas').select('*'),
    sb.from('metas_operacao').select('*'),
  ])
  if (et.error) throw et.error
  if (me.error) throw me.error
  const etapas = et.data as ConfigMetasSla['etapas']
  const metas = (me.data as ConfigMetasSla['metas'][])[0]
  const ultima = [metas, ...etapas].sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em))[0]
  let porNome: string | null = null
  if (ultima?.atualizado_por) {
    const { data } = await supabase.from('perfis_usuarios').select('nome_completo').eq('user_id', ultima.atualizado_por).maybeSingle()
    porNome = (data as { nome_completo: string } | null)?.nome_completo ?? null
  }
  return { etapas, metas, ultima_alteracao: ultima ? { em: ultima.atualizado_em, por_nome: porNome } : null }
}

/**
 * Salva a config. No real, a RLS só deixa o admin escrever e o trigger carimba
 * `atualizado_em/por`; `autorNome` só serve ao modo simulado.
 */
export async function salvarConfigMetasSla(entrada: ConfigMetasSlaEntrada, autorNome: string | null): Promise<ConfigMetasSla> {
  if (FONTE === 'simulada') return simular(() => mock.mockSalvarConfigMetasSla(entrada, autorNome))
  const sb = supabase as unknown as {
    from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: unknown) => { select: (c: string) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> } } }
  }
  for (const e of entrada.etapas) {
    const { data, error } = await sb.from('sla_etapas').update(e).eq('status', e.status).select('id')
    if (error) throw error
    // RLS nega UPDATE em silêncio (0 linhas): sem isto, "salvo" sem ter salvo.
    if (!data || data.length === 0) throw new Error('Sem permissão para alterar o SLA.')
  }
  const { data, error } = await sb.from('metas_operacao').update(entrada.metas).eq('singleton', true).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Sem permissão para alterar as metas.')
  return buscarConfigMetasSla()
}

/** Fila atual (status + status_desde) para a prévia da tela de Metas. */
export async function buscarFilaPrevia(): Promise<ItemFilaPrevia[]> {
  if (FONTE === 'simulada') return simular((agora, c) => mock.mockFilaPrevia(agora, c))
  const sb = supabase as unknown as {
    from: (t: string) => { select: (c: string) => { in: (c: string, v: string[]) => { range: (a: number, b: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> } } }
  }
  const { data, error } = await sb
    .from('solicitacoes')
    .select('status, status_desde')
    .in('status', ['recebida', 'em_cadastro', 'instrucao_emitida', 'oc_gerada', 'oc_enviada'])
    .range(0, 999)
  if (error) throw error
  return data as ItemFilaPrevia[]
}
