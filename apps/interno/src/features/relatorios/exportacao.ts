// CSVs dos Relatórios e da Produtividade (§5 do plano). Tudo sai por
// lib/csv.ts, que registra o acesso (LGPD) e grava no formato do Excel pt-BR.

import { buildCsv, downloadCsv, type CsvColumn } from '@/lib/csv'
import { fmtDec, fmtDur, fmtInt, fmtPct } from '@/lib/format'
import { buscarExportacaoPagina } from '@/features/metricas/fonte'
import { rotuloOrigem } from '@/features/metricas/rotulos'
import { lerBalde } from '@/features/metricas/periodo'
import { STATUS_LABELS } from '@/features/solicitacoes/status'
import { labelPerfil } from '@/features/auth/perfis'
import type {
  ExportLinha,
  FiltrosPeriodo,
  Granularidade,
  Percentis,
  Produtividade,
  ProdutividadeUsuario,
  RankingLinha,
  RelatorioResumo,
  ResumoBloco,
  SerieLinha,
  TempoEtapaLinha,
} from '@/features/metricas/tipos'
import { carimboArquivo, rotuloIntervalo } from './intervalo'

/** Versão da semântica das métricas — vai no CSV (finalizadas = vazão, 48 h…). */
export const VERSAO_METRICAS = '2026-10'

interface LinhaResumo {
  secao: string
  titulo: string
  valor: string
}

function fmtPercentis(p: Percentis): string {
  if (p.n < 5 || p.p50 == null) return `amostra pequena · n=${fmtInt(p.n)}`
  return `P50 ${fmtDur(p.p50)} · P90 ${fmtDur(p.p90)} · n=${fmtInt(p.n)}`
}

function blocoLinhas(secao: string, b: ResumoBloco): LinhaResumo[] {
  return [
    { secao, titulo: 'Entradas', valor: fmtInt(b.entradas) },
    { secao, titulo: 'Finalizadas (vazão)', valor: fmtInt(b.finalizadas) },
    { secao, titulo: 'Canceladas', valor: fmtInt(b.canceladas) },
    { secao, titulo: 'Concluídas em até 48 h', valor: `${fmtPct(b.conclusao48_pct)} (n=${fmtInt(b.conclusao48_n)})` },
    { secao, titulo: 'Taxa de cancelamento', valor: fmtPct(b.cancelamento_pct) },
    { secao, titulo: 'Lead time (entrada → finalização)', valor: fmtPercentis(b.lead) },
    { secao, titulo: 'Dentro do SLA', valor: fmtPct(b.dentro_sla_pct) },
  ]
}

function rotuloBalde(balde: string, gran: Granularidade): string {
  const d = lerBalde(balde)
  const p = (n: number) => String(n).padStart(2, '0')
  const dia = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
  if (gran === 'hora') return `${dia} ${p(d.getHours())}h`
  if (gran === 'semana') return `semana de ${dia}`
  return dia
}

export interface DadosResumoCsv {
  filtros: FiltrosPeriodo
  rotuloCliente: string | null
  resumo: RelatorioResumo
  serie: SerieLinha[]
  granularidade: Granularidade
  etapas: TempoEtapaLinha[]
  rankings: { titulo: string; linhas: RankingLinha[] }[]
  parceiros: RankingLinha[] | null
}

/**
 * Resumo: mantém o layout `Seção;Item;Valor` do CSV anterior (planilhas que já
 * leem o arquivo continuam abrindo). Semântica nova: Finalizadas = vazão; taxa =
 * concluídas em até 48 h; tempos em P50/P90/n.
 */
export function exportarResumo(d: DadosResumoCsv): void {
  const f = d.filtros
  const linhas: LinhaResumo[] = [
    { secao: 'Recorte', titulo: 'Origem', valor: f.origem === 'todas' ? 'Todas' : f.origem === 'interno' ? 'Internas' : 'Parceiros' },
    { secao: 'Recorte', titulo: 'Cliente', valor: d.rotuloCliente ?? 'Todos' },
    { secao: 'Recorte', titulo: 'Local', valor: f.local ?? 'Todos' },
    { secao: 'Recorte', titulo: 'Período', valor: rotuloIntervalo(f.de, f.ate) },
    { secao: 'Recorte', titulo: 'Versão das métricas', valor: VERSAO_METRICAS },
    ...blocoLinhas('KPIs', d.resumo.atual),
    ...blocoLinhas('Período anterior', d.resumo.anterior),
  ]
  for (const s of d.serie) {
    linhas.push({
      secao: d.granularidade === 'hora' ? 'Volume por hora' : d.granularidade === 'semana' ? 'Volume semanal' : 'Volume diário',
      titulo: rotuloBalde(s.balde, d.granularidade),
      valor: `${fmtInt(s.entradas)} entradas · ${fmtInt(s.finalizadas)} finalizadas · ${fmtInt(s.canceladas)} canceladas`,
    })
  }
  for (const e of d.etapas) {
    linhas.push({
      secao: 'Tempo por etapa',
      titulo: STATUS_LABELS[e.status],
      valor: fmtPercentis({ p50: e.p50_min, p90: e.p90_min, n: e.n }) + (e.acima_alerta_pct != null ? ` · ${fmtPct(e.acima_alerta_pct)} acima do alerta` : ''),
    })
  }
  for (const r of d.rankings) {
    for (const l of r.linhas.slice(0, 10)) {
      linhas.push({ secao: r.titulo, titulo: l.rotulo, valor: `${fmtInt(l.entradas)} entradas · ${fmtInt(l.finalizadas)} finalizadas` })
    }
  }
  if (d.parceiros) {
    const total = d.parceiros.reduce((a, p) => a + p.entradas, 0)
    for (const p of d.parceiros) {
      linhas.push({
        secao: 'Parceiros',
        titulo: p.rotulo,
        valor: `${fmtInt(p.entradas)} enviadas (${fmtPct(total > 0 ? p.entradas / total : null, { casas: 0 })}) · ${fmtInt(p.finalizadas)} finalizadas · emissão P50 ${fmtDur(p.emissao_p50_min)} · P90 ${fmtDur(p.emissao_p90_min)}`,
      })
    }
  }
  const cols: CsvColumn<LinhaResumo>[] = [
    { header: 'Seção', accessor: (r) => r.secao },
    { header: 'Item', accessor: (r) => r.titulo },
    { header: 'Valor', accessor: (r) => r.valor },
  ]
  downloadCsv(`relatorio_${f.de}_a_${f.ate}_${carimboArquivo()}.csv`, buildCsv(linhas, cols))
}

/** Série: uma linha por balde, números crus (inteiros). */
export function exportarSerie(f: FiltrosPeriodo, gran: Granularidade, serie: SerieLinha[]): void {
  const cols: CsvColumn<SerieLinha>[] = [
    { header: 'balde', accessor: (s) => rotuloBalde(s.balde, gran) },
    { header: 'entradas', accessor: (s) => s.entradas },
    { header: 'finalizadas', accessor: (s) => s.finalizadas },
    { header: 'canceladas', accessor: (s) => s.canceladas },
    { header: 'entradas_ant', accessor: (s) => s.entradas_ant },
    { header: 'finalizadas_ant', accessor: (s) => s.finalizadas_ant },
  ]
  downloadCsv(`serie_${gran}_${f.de}_a_${f.ate}_${carimboArquivo()}.csv`, buildCsv(serie, cols))
}

function dataHora(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Teto de páginas do CSV de dados (50 × 1000 linhas). */
const MAX_PAGINAS = 50

/**
 * Dados (tidy): uma linha por solicitação, buscada de 1000 em 1000. Substitui o
 * drill-down do tempo por etapa (R8). Devolve quantas linhas saíram.
 */
export async function exportarDados(f: FiltrosPeriodo): Promise<{ linhas: number; truncado: boolean }> {
  const linhas: ExportLinha[] = []
  let truncado = false
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const lote = await buscarExportacaoPagina(f, pagina * 1000, 1000)
    linhas.push(...lote)
    if (lote.length < 1000) break
    // Última página permitida veio cheia: há mais linhas que o teto.
    if (pagina === MAX_PAGINAS - 1) truncado = true
  }
  const min = (v: number | null) => (v == null ? '' : Math.round(v))
  const cols: CsvColumn<ExportLinha>[] = [
    { header: 'Nº', accessor: (l) => l.numero_interno },
    { header: 'Origem', accessor: (l) => rotuloOrigem(l.origem) },
    { header: 'Parceiro', accessor: (l) => l.parceiro },
    { header: 'Cliente', accessor: (l) => l.cliente },
    { header: 'Material', accessor: (l) => l.material },
    { header: 'Local', accessor: (l) => l.local },
    { header: 'Status', accessor: (l) => STATUS_LABELS[l.status] },
    { header: 'Criada em', accessor: (l) => dataHora(l.criada_em) },
    { header: 'Finalizada em', accessor: (l) => dataHora(l.finalizada_em) },
    { header: 'Lead time (min)', accessor: (l) => min(l.lead_min) },
    { header: 'Min. Recebida', accessor: (l) => min(l.min_recebida) },
    { header: 'Min. Em emissão', accessor: (l) => min(l.min_em_cadastro) },
    { header: 'Min. Instrução emitida', accessor: (l) => min(l.min_instrucao_emitida) },
    { header: 'Min. OC gerada', accessor: (l) => min(l.min_oc_gerada) },
    { header: 'Min. OC enviada', accessor: (l) => min(l.min_oc_enviada) },
  ]
  let csv = buildCsv(linhas, cols)
  // Aviso dentro do próprio arquivo: quem abre a planilha depois não viu o toast.
  if (truncado) csv += `
AVISO: arquivo truncado em ${fmtInt(linhas.length)} linhas; reduza o período para exportar tudo.`
  downloadCsv(`solicitacoes_${f.de}_a_${f.ate}_${carimboArquivo()}.csv`, csv)
  return { linhas: linhas.length, truncado }
}

/**
 * Produtividade: mantém o nome `relatorio_interno_…` (§5). Colunas novas (E1–E5
 * por transições); o agente de WhatsApp sai na última linha, marcado como fora
 * dos totais.
 */
export function exportarProdutividade(de: string, ate: string, p: Produtividade): void {
  const horas = (m: number | null) => (m == null ? '' : fmtDec(m / 60, 1))
  const cols: CsvColumn<ProdutividadeUsuario & { nota?: string }>[] = [
    { header: 'Usuário', accessor: (u) => u.nome },
    { header: 'Perfil', accessor: (u) => (u.nota ? u.nota : labelPerfil(u.perfil)) },
    { header: 'Ativo', accessor: (u) => u.ativo },
    { header: 'Criou', accessor: (u) => u.criou },
    { header: 'Pôs em emissão', accessor: (u) => u.em_emissao },
    { header: 'Gerou OC', accessor: (u) => u.gerou_oc },
    { header: 'Enviou OC', accessor: (u) => u.enviou_oc },
    { header: 'Finalizou', accessor: (u) => u.finalizou },
    { header: 'Conclusão P50 (h)', accessor: (u) => horas(u.conclusao_p50_min) },
    { header: 'Em aberto com ele', accessor: (u) => u.em_aberto },
    { header: 'Parada mais longa (h)', accessor: (u) => horas(u.parada_mais_longa_min) },
  ]
  const linhas: (ProdutividadeUsuario & { nota?: string })[] = [...p.usuarios]
  if (p.agente) linhas.push({ ...p.agente, nota: 'Agente WhatsApp (fora dos totais)' })
  downloadCsv(`relatorio_interno_${de}_a_${ate}_${carimboArquivo()}.csv`, buildCsv(linhas, cols))
}
