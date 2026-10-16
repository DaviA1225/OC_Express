// Tipos dos retornos das RPCs dos dashboards (plano dashboards-operacionais v2,
// §2.5). Os nomes de campo são os mesmos do jsonb/TABLE que a migration 0080 vai
// devolver — quando os tipos gerados do Supabase chegarem a
// packages/shared/src/database.types.ts, estes tipos continuam valendo para o
// conteúdo dos jsonb (o gerador tipa jsonb como `Json`).
//
// Convenções:
// - durações em MINUTOS (`*_min`), percentis como `p50`/`p90` em minutos;
// - percentuais (`*_pct`) como FRAÇÃO 0–1 (fmtPct já espera fração);
// - datas de filtro `YYYY-MM-DD` (dia em America/Sao_Paulo, inclusivo);
// - timestamps ISO 8601.

import type { SolicitacaoStatus } from '@/types/database.types'

// ── Filtros comuns `F` ──────────────────────────────────────────────────────

/** `interno` = tudo que não é `parceiro` (inclui e-mail e WhatsApp). */
export type OrigemFiltro = 'todas' | 'interno' | 'parceiro'

/** Parâmetros `F` de todas as RPCs: p_origem, p_cliente_id, p_local. */
export interface FiltrosComuns {
  origem: OrigemFiltro
  clienteId: string | null
  local: string | null
}

/** Período das RPCs de relatório: p_de, p_ate (datas SP, inclusivas). */
export interface Periodo {
  de: string
  ate: string
}

export type FiltrosPeriodo = FiltrosComuns & Periodo

/** Etapas com SLA (a fila) — "OC enviada" fica fora (D1). */
export type EtapaFila = 'recebida' | 'em_cadastro' | 'instrucao_emitida' | 'oc_gerada'

/** Etapas configuráveis em `sla_etapas` (inclui oc_enviada, com ativo=false). */
export type EtapaSla = EtapaFila | 'oc_enviada'

export type ClasseSla = 'ok' | 'aviso' | 'fora'

// ── painel_estado_atual ─────────────────────────────────────────────────────

export interface PainelEtapa {
  status: EtapaSla
  qtd: number
  fora_sla: number
  aviso: number
  /** Minutos na etapa da mais antiga; null se a etapa está vazia. */
  mais_antiga_min: number | null
}

/** Faixas da idade da fila (P9), pelo tempo desde a entrada (created_at). */
export type FaixaIdade = 'lt1h' | '1a4h' | '4a8h' | '8a24h' | 'gt24h'

export interface PainelAging {
  faixa: FaixaIdade
  qtd: number
}

export interface PainelPorLocal {
  /** Texto livre de `local_carregamento`; 'Sem local' e 'Outros' são agregados. */
  local: string
  qtd: number
  fora_sla: number
}

/** P14 — sem motorista nem solicitante (o payload também vai para a TV). */
export interface PainelAtrasada {
  id: string
  numero_interno: number
  status: EtapaFila
  cliente: string | null
  local: string | null
  origem: string
  min_na_etapa: number
  excesso_min: number
}

export interface PainelEstadoAtual {
  gerado_em: string
  fila: {
    total: number
    aguardando_finalizacao: number
    fora_sla: number
    aviso: number
  }
  etapas: PainelEtapa[]
  aging: PainelAging[]
  validade: { vencendo: number; vencidas: number }
  pamcard_pendente: number
  pendencias_parceiro: number
  por_local: PainelPorLocal[]
  /** No máximo 12, maior excesso primeiro. */
  atrasadas: PainelAtrasada[]
}

// ── painel_hoje ─────────────────────────────────────────────────────────────

export interface Percentis {
  p50: number | null
  p90: number | null
  n: number
}

export interface PainelHora {
  /** 0–23, hora de São Paulo. */
  hora: number
  finalizadas: number
  entradas: number
  /** Média das finalizadas nessa hora nos 4 mesmos dias da semana anteriores. */
  ref: number
}

export interface PainelHoje {
  finalizadas: number
  /** Ontem até o mesmo horário. */
  finalizadas_ref: number
  /** Meta diária; null = sem meta (D3). */
  meta: number | null
  finalizadas_2h: number
  lead7d: Percentis
  lead7d_ant: Percentis
  por_hora: PainelHora[]
}

// ── relatorio_resumo ────────────────────────────────────────────────────────

export interface ResumoBloco {
  entradas: number
  finalizadas: number
  canceladas: number
  /** R4: fração das entradas com 48 h+ de idade finalizadas em até 48 h (sem canceladas). */
  conclusao48_pct: number | null
  /** Denominador do R4. */
  conclusao48_n: number
  /** R5: fração das entradas do período com status atual cancelada. */
  cancelamento_pct: number | null
  lead: Percentis
  /** R7: fração das finalizadas sem nenhuma etapa acima do alerta. */
  dentro_sla_pct: number | null
}

export interface RelatorioResumo {
  atual: ResumoBloco
  anterior: ResumoBloco
  /** Limites efetivos (ISO): [ini, least(fim, now())) e o período anterior. */
  limites: { ini: string; fim: string; ini_ant: string; fim_ant: string }
}

// ── relatorio_serie ─────────────────────────────────────────────────────────

export type Granularidade = 'hora' | 'dia' | 'semana'

export interface SerieLinha {
  /** ISO do início do balde (hora, dia ou semana). */
  balde: string
  entradas: number
  finalizadas: number
  canceladas: number
  entradas_ant: number
  finalizadas_ant: number
}

// ── relatorio_tempo_etapas ──────────────────────────────────────────────────

export interface TempoEtapaLinha {
  status: EtapaSla
  n: number
  p50_min: number | null
  p90_min: number | null
  /** Fração das passagens acima do alerta da etapa. */
  acima_alerta_pct: number | null
}

// ── relatorio_ranking ───────────────────────────────────────────────────────

export type DimensaoRanking =
  | 'cliente'
  | 'material'
  | 'local'
  | 'motorista'
  | 'veiculo'
  | 'subcontratada'
  | 'parceiro'
  | 'origem'

export interface RankingLinha {
  chave: string
  rotulo: string
  entradas: number
  finalizadas: number
  lead_p50_min: number | null
  /** 1ª entrada em "Em emissão" até a finalização (R11). */
  emissao_p50_min: number | null
  emissao_p90_min: number | null
}

// ── relatorio_locais ────────────────────────────────────────────────────────

export interface LocalLinha {
  local: string
  qtd: number
}

// ── ids_para_drill ──────────────────────────────────────────────────────────

export type TipoDrill = 'sla_estourou' | 'conclusao48' | 'cancelada'

// ── relatorio_produtividade ─────────────────────────────────────────────────

export interface ProdutividadeUsuario {
  usuario_id: string
  nome: string
  perfil: string
  ativo: boolean
  /** E1 */
  criou: number
  /** E2 */
  em_emissao: number
  gerou_oc: number
  enviou_oc: number
  finalizou: number
  /** E3: mediana de "Em emissão" → finalizada nas que ele finalizou. */
  conclusao_p50_min: number | null
  /** E4 */
  em_aberto: number
  /** E5: maior tempo na etapa atual entre as em aberto com ele. */
  parada_mais_longa_min: number | null
}

export interface AbertaParada {
  id: string
  numero_interno: number
  status: SolicitacaoStatus
  parceiro: string | null
  responsavel: string
  min_na_etapa: number
}

export interface Produtividade {
  usuarios: ProdutividadeUsuario[]
  /** Agente de WhatsApp: linha separada, fora dos totais (N3). null se não houver. */
  agente: ProdutividadeUsuario | null
  abertas_paradas: AbertaParada[]
  totais: {
    entradas: number
    de_parceiro: number
    finalizadas: number
    abertas: number
    recebidas_sem_responsavel: number
  }
}

// ── exportar_solicitacoes_periodo (linhas tidy, §5) ─────────────────────────

export interface ExportLinha {
  numero_interno: number
  origem: string
  parceiro: string | null
  cliente: string | null
  material: string | null
  local: string | null
  status: SolicitacaoStatus
  criada_em: string
  finalizada_em: string | null
  lead_min: number | null
  min_recebida: number | null
  min_em_cadastro: number | null
  min_instrucao_emitida: number | null
  min_oc_gerada: number | null
  min_oc_enviada: number | null
}

// ── relatorio_mapa_calor ────────────────────────────────────────────────────

export interface MapaCalorCelula {
  /** 0 = domingo … 6 = sábado (extract(dow)). */
  dow: number
  hora: number
  entradas: number
}

// ── Configuração (tabelas sla_etapas e metas_operacao, §2.2) ────────────────

export interface SlaEtapa {
  id: string
  status: EtapaSla
  aviso_min: number
  alerta_min: number
  ativo: boolean
  atualizado_em: string
  atualizado_por: string | null
}

export interface MetasOperacao {
  id: string
  /** null = sem meta (D3). */
  meta_finalizadas_dia: number | null
  meta_lead_time_p90_min: number | null
  alerta_validade_h: number
  /** `HH:MM` */
  expediente_inicio: string
  expediente_fim: string
  atualizado_em: string
  atualizado_por: string | null
}

/** O que a tela de Metas e SLA lê: as duas tabelas + o nome de quem alterou por último. */
export interface ConfigMetasSla {
  etapas: SlaEtapa[]
  metas: MetasOperacao
  ultima_alteracao: { em: string; por_nome: string | null } | null
}

export interface ConfigMetasSlaEntrada {
  etapas: Pick<SlaEtapa, 'status' | 'aviso_min' | 'alerta_min' | 'ativo'>[]
  metas: Pick<
    MetasOperacao,
    'meta_finalizadas_dia' | 'meta_lead_time_p90_min' | 'alerta_validade_h' | 'expediente_inicio' | 'expediente_fim'
  >
}

/** Item da fila para a prévia "com estes limites, hoje N estariam fora do SLA". */
export interface ItemFilaPrevia {
  status: EtapaSla
  status_desde: string
}

export interface OpcaoCliente {
  id: string
  nome: string
}
