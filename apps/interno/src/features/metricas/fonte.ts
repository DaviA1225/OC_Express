// Ponto ÚNICO de acesso aos dados dos dashboards (Painel, TV, Relatórios,
// Produtividade, Metas e SLA). As telas e os hooks só falam com este arquivo.
//
// Dados reais: RPCs da migration 0080 (supabase/migrations/0080_rpcs_dashboards.sql)
// e as tabelas sla_etapas/metas_operacao da 0079. Os retornos seguem tipos.ts.
// As RPCs ainda não estão nos tipos gerados (packages/shared/src/database.types.ts):
// por isso `rpc()` faz a chamada sem tipo — regenerar os tipos e trocar por
// `supabase.rpc` tipado quando a 0080 estiver no remoto.

import { supabase } from '@/lib/supabase'
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

/** Fonte dos dados: sempre o banco (o modo simulado saiu com a 0080). */
export const FONTE = 'rpc' as const

// Chamada sem tipo enquanto as RPCs não estão em database.types.ts.
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
  return rpc('painel_estado_atual', argsF(f))
}

export function buscarPainelHoje(f: FiltrosComuns): Promise<PainelHoje> {
  return rpc('painel_hoje', argsF(f))
}

// ── Relatórios ──────────────────────────────────────────────────────────────

export function buscarRelatorioResumo(p: FiltrosPeriodo): Promise<RelatorioResumo> {
  return rpc('relatorio_resumo', argsP(p))
}

export function buscarRelatorioSerie(p: FiltrosPeriodo, granularidade: Granularidade): Promise<SerieLinha[]> {
  return rpc('relatorio_serie', { ...argsP(p), p_granularidade: granularidade })
}

export function buscarRelatorioTempoEtapas(p: FiltrosPeriodo): Promise<TempoEtapaLinha[]> {
  return rpc('relatorio_tempo_etapas', argsP(p))
}

export function buscarRelatorioRanking(p: FiltrosPeriodo, dimensao: DimensaoRanking, limite = 50): Promise<RankingLinha[]> {
  return rpc('relatorio_ranking', { ...argsP(p), p_dimensao: dimensao, p_limite: limite })
}

export function buscarRelatorioLocais(p: Periodo): Promise<LocalLinha[]> {
  return rpc('relatorio_locais', { p_de: p.de, p_ate: p.ate })
}

export function buscarMapaCalor(p: FiltrosPeriodo): Promise<MapaCalorCelula[]> {
  return rpc('relatorio_mapa_calor', argsP(p))
}

export function buscarProdutividade(p: Periodo): Promise<Produtividade> {
  return rpc('relatorio_produtividade', { p_de: p.de, p_ate: p.ate })
}

/** Uma página (≤ 1000 linhas) do CSV de dados tidy (§5). */
export function buscarExportacaoPagina(p: FiltrosPeriodo, offset: number, limite = 1000): Promise<ExportLinha[]> {
  const lim = Math.min(limite, 1000)
  return rpc('exportar_solicitacoes_periodo', { ...argsP(p), p_offset: offset, p_limite: lim })
}

// ── Opções dos filtros ──────────────────────────────────────────────────────

export async function buscarOpcoesClientes(): Promise<OpcaoCliente[]> {
  const { data, error } = await supabase.from('clientes').select('id, razao_social').order('razao_social').range(0, 999)
  if (error) throw error
  return ((data ?? []) as { id: string; razao_social: string }[]).map((c) => ({ id: c.id, nome: c.razao_social }))
}

// ── Metas e SLA ─────────────────────────────────────────────────────────────

const METAS_PADRAO: ConfigMetasSla['metas'] = {
  id: '',
  meta_finalizadas_dia: null,
  meta_lead_time_p90_min: null,
  alerta_validade_h: 24,
  expediente_inicio: '07:00',
  expediente_fim: '18:00',
  atualizado_em: new Date(0).toISOString(),
  atualizado_por: null,
}

export async function buscarConfigMetasSla(): Promise<ConfigMetasSla> {
  const sb = supabase as unknown as { from: (t: string) => { select: (c: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> } }
  const [et, me] = await Promise.all([
    sb.from('sla_etapas').select('*'),
    sb.from('metas_operacao').select('*'),
  ])
  if (et.error) throw et.error
  if (me.error) throw me.error
  const etapas = (et.data as ConfigMetasSla['etapas'] | null) ?? []
  // Singleton ausente (seed não rodou) não pode derrubar a tela: cai nos
  // valores do seed (D3: sem meta) e a primeira gravação revela o problema.
  const metas = (me.data as ConfigMetasSla['metas'][] | null)?.[0] ?? METAS_PADRAO
  const ultima = [metas, ...etapas]
    .filter((x) => x !== METAS_PADRAO).sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em))[0]
  let porNome: string | null = null
  if (ultima?.atualizado_por) {
    const { data } = await supabase.from('perfis_usuarios').select('nome_completo').eq('user_id', ultima.atualizado_por).maybeSingle()
    porNome = (data as { nome_completo: string } | null)?.nome_completo ?? null
  }
  return { etapas, metas, ultima_alteracao: ultima ? { em: ultima.atualizado_em, por_nome: porNome } : null }
}

/** Salva a config; o trigger carimba `atualizado_em/por`. */
export async function salvarConfigMetasSla(entrada: ConfigMetasSlaEntrada): Promise<ConfigMetasSla> {
  // Uma transação só no banco (salvar_metas_sla, 0080): ou grava tudo, ou nada.
  // Só admin; o banco devolve 'forbidden' (42501) para os demais.
  await rpc<null>('salvar_metas_sla', { p: entrada })
  return buscarConfigMetasSla()
}

/** Fila atual (status + status_desde) para a prévia da tela de Metas. */
export async function buscarFilaPrevia(): Promise<ItemFilaPrevia[]> {
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
