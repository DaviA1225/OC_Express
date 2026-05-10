import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PeriodoRelatorio {
  desde: string // ISO timestamp
  ate: string   // ISO timestamp (exclusive)
  label: string
}

export interface RelatorioRow {
  id: string
  numero_interno: number
  status: string
  tipo: string
  created_at: string
  finalizada_em: string | null
  enviada_em: string | null
  cliente_id: string | null
  motorista_id: string | null
  material_id: string | null
  veiculo_id: string | null
  subcontratada_id: string | null
  atendente_id: string | null
}

export interface ClienteRef { razao_social: string }
export interface MotoristaRef { nome_completo: string }
export interface MaterialRef { nome: string }
export interface VeiculoRef { placa: string }
export interface SubcontratadaRef { razao_social: string }
export interface AtendenteRef { nome_completo: string; perfil: string }

export interface RelatorioDataset {
  rows: RelatorioRow[]
  clientes: Map<string, ClienteRef>
  motoristas: Map<string, MotoristaRef>
  materiais: Map<string, MaterialRef>
  veiculos: Map<string, VeiculoRef>
  subcontratadas: Map<string, SubcontratadaRef>
  atendentes: Map<string, AtendenteRef>
}

/** Busca todas as solicitações criadas no período + dicionários para resolver IDs. */
export function useRelatorioDataset(periodo: PeriodoRelatorio) {
  return useQuery({
    queryKey: ['relatorio', periodo.desde, periodo.ate],
    staleTime: 60_000,
    queryFn: async (): Promise<RelatorioDataset> => {
      const { data, error } = await supabase
        .from('solicitacoes')
        .select(
          'id, numero_interno, status, tipo, created_at, finalizada_em, enviada_em, cliente_id, motorista_id, material_id, veiculo_id, subcontratada_id, atendente_id',
        )
        .gte('created_at', periodo.desde)
        .lt('created_at', periodo.ate)
        .order('created_at', { ascending: true })
        .limit(10_000)
      if (error) throw error
      const rows = (data ?? []) as RelatorioRow[]

      const clienteIds = Array.from(new Set(rows.map((r) => r.cliente_id).filter(Boolean) as string[]))
      const motoristaIds = Array.from(new Set(rows.map((r) => r.motorista_id).filter(Boolean) as string[]))
      const materialIds = Array.from(new Set(rows.map((r) => r.material_id).filter(Boolean) as string[]))
      const veiculoIds = Array.from(new Set(rows.map((r) => r.veiculo_id).filter(Boolean) as string[]))
      const subcontratadaIds = Array.from(new Set(rows.map((r) => r.subcontratada_id).filter(Boolean) as string[]))
      const atendenteIds = Array.from(new Set(rows.map((r) => r.atendente_id).filter(Boolean) as string[]))

      const [clientesData, motoristasData, materiaisData, veiculosData, subsData, atendentesData] = await Promise.all([
        clienteIds.length > 0
          ? supabase.from('clientes').select('id, razao_social').in('id', clienteIds)
          : Promise.resolve({ data: [] as { id: string; razao_social: string }[], error: null }),
        motoristaIds.length > 0
          ? supabase.from('motoristas').select('id, nome_completo').in('id', motoristaIds)
          : Promise.resolve({ data: [] as { id: string; nome_completo: string }[], error: null }),
        materialIds.length > 0
          ? supabase.from('materiais').select('id, nome').in('id', materialIds)
          : Promise.resolve({ data: [] as { id: string; nome: string }[], error: null }),
        veiculoIds.length > 0
          ? supabase.from('veiculos').select('id, placa').in('id', veiculoIds)
          : Promise.resolve({ data: [] as { id: string; placa: string }[], error: null }),
        subcontratadaIds.length > 0
          ? supabase.from('subcontratadas').select('id, razao_social').in('id', subcontratadaIds)
          : Promise.resolve({ data: [] as { id: string; razao_social: string }[], error: null }),
        atendenteIds.length > 0
          ? supabase.from('perfis_usuarios').select('user_id, nome_completo, perfil').in('user_id', atendenteIds)
          : Promise.resolve({ data: [] as { user_id: string; nome_completo: string; perfil: string }[], error: null }),
      ])

      const clientes = new Map<string, ClienteRef>()
      for (const c of (clientesData.data ?? []) as { id: string; razao_social: string }[]) {
        clientes.set(c.id, { razao_social: c.razao_social })
      }
      const motoristas = new Map<string, MotoristaRef>()
      for (const m of (motoristasData.data ?? []) as { id: string; nome_completo: string }[]) {
        motoristas.set(m.id, { nome_completo: m.nome_completo })
      }
      const materiais = new Map<string, MaterialRef>()
      for (const m of (materiaisData.data ?? []) as { id: string; nome: string }[]) {
        materiais.set(m.id, { nome: m.nome })
      }
      const veiculos = new Map<string, VeiculoRef>()
      for (const v of (veiculosData.data ?? []) as { id: string; placa: string }[]) {
        veiculos.set(v.id, { placa: v.placa })
      }
      const subcontratadas = new Map<string, SubcontratadaRef>()
      for (const s of (subsData.data ?? []) as { id: string; razao_social: string }[]) {
        subcontratadas.set(s.id, { razao_social: s.razao_social })
      }
      const atendentes = new Map<string, AtendenteRef>()
      for (const a of (atendentesData.data ?? []) as { user_id: string; nome_completo: string; perfil: string }[]) {
        atendentes.set(a.user_id, { nome_completo: a.nome_completo, perfil: a.perfil })
      }

      return { rows, clientes, motoristas, materiais, veiculos, subcontratadas, atendentes }
    },
  })
}

// ── TMA por status (via log_auditoria) ─────────────────────────────────────

export interface StatusTransition {
  registro_id: string
  from_status: string | null
  to_status: string
  at: string
}

/**
 * Busca todas as transições de status das solicitações no período.
 * Reconstrói a linha do tempo a partir do log de auditoria + created_at.
 */
export function useStatusTransitions(periodo: PeriodoRelatorio, solicitacaoIds: string[]) {
  return useQuery({
    enabled: solicitacaoIds.length > 0,
    queryKey: ['relatorio-transicoes', periodo.desde, periodo.ate, solicitacaoIds.length],
    staleTime: 60_000,
    queryFn: async (): Promise<StatusTransition[]> => {
      // Supabase aceita listas grandes em .in(); fragmentamos em chunks de 200 só por segurança.
      const chunks: string[][] = []
      for (let i = 0; i < solicitacaoIds.length; i += 200) {
        chunks.push(solicitacaoIds.slice(i, i + 200))
      }
      const all: StatusTransition[] = []
      for (const ch of chunks) {
        const { data, error } = await supabase
          .from('log_auditoria')
          .select('registro_id, dados_antes, dados_depois, created_at')
          .eq('tabela', 'solicitacoes')
          .eq('acao', 'UPDATE')
          .in('registro_id', ch)
          .order('created_at', { ascending: true })
          .limit(20_000)
        if (error) throw error
        for (const l of (data ?? []) as Array<{
          registro_id: string
          dados_antes: { status?: string } | null
          dados_depois: { status?: string } | null
          created_at: string
        }>) {
          const prev = l.dados_antes?.status ?? null
          const next = l.dados_depois?.status
          if (!next || prev === next) continue
          all.push({
            registro_id: l.registro_id,
            from_status: prev,
            to_status: next,
            at: l.created_at,
          })
        }
      }
      return all
    },
  })
}

export interface TmaStatusEntry {
  status: string
  avgHours: number
  medianHours: number
  count: number
}

const TMA_STATUS_ORDER = ['recebida', 'em_cadastro', 'instrucao_emitida', 'oc_gerada', 'oc_enviada']

/**
 * Para cada solicitação, reconstrói a linha do tempo (created_at → ... transições)
 * e calcula o tempo passado em cada status. Retorna média e mediana por status,
 * considerando apenas intervalos fechados (status que já foi superado).
 */
export function tmaPorStatus(rows: RelatorioRow[], transitions: StatusTransition[]): TmaStatusEntry[] {
  const byId = new Map<string, StatusTransition[]>()
  for (const t of transitions) {
    const arr = byId.get(t.registro_id)
    if (arr) arr.push(t)
    else byId.set(t.registro_id, [t])
  }
  for (const arr of byId.values()) {
    arr.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  }

  const buckets = new Map<string, number[]>()
  for (const r of rows) {
    const transArr = byId.get(r.id) ?? []
    let cursorTime = new Date(r.created_at).getTime()
    let cursorStatus = 'recebida'
    for (const t of transArr) {
      const at = new Date(t.at).getTime()
      const hours = (at - cursorTime) / 3_600_000
      if (hours >= 0) {
        const list = buckets.get(cursorStatus) ?? []
        list.push(hours)
        buckets.set(cursorStatus, list)
      }
      cursorTime = at
      cursorStatus = t.to_status
    }
    // intervalo aberto (em curso) é ignorado; só medimos etapas concluídas
  }

  const order = [...TMA_STATUS_ORDER]
  for (const status of buckets.keys()) {
    if (!order.includes(status)) order.push(status)
  }
  const out: TmaStatusEntry[] = []
  for (const status of order) {
    const arr = buckets.get(status)
    if (!arr || arr.length === 0) continue
    const sorted = [...arr].sort((a, b) => a - b)
    const median =
      sorted.length % 2 === 1
        ? sorted[Math.floor(sorted.length / 2)]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length
    out.push({ status, avgHours: avg, medianHours: median, count: arr.length })
  }
  return out
}

// ── Agregações puras (não tocam o DB) ──────────────────────────────────────

export interface KPIs {
  total: number
  finalizadas: number
  canceladas: number
  emEnvio: number
  taxaFinalizacao: number  // 0..1
  tempoMedioHoras: number | null
}

export function calcKPIs(rows: RelatorioRow[]): KPIs {
  const total = rows.length
  const finalizadas = rows.filter((r) => r.status === 'finalizada').length
  const canceladas = rows.filter((r) => r.status === 'cancelada').length
  const emEnvio = rows.filter((r) => ['oc_gerada', 'oc_enviada'].includes(r.status)).length

  const tempos: number[] = []
  for (const r of rows) {
    if (r.finalizada_em) {
      const start = new Date(r.created_at).getTime()
      const end = new Date(r.finalizada_em).getTime()
      if (end > start) tempos.push((end - start) / 3_600_000)
    }
  }
  const tempoMedioHoras = tempos.length > 0
    ? tempos.reduce((a, b) => a + b, 0) / tempos.length
    : null

  return {
    total,
    finalizadas,
    canceladas,
    emEnvio,
    taxaFinalizacao: total > 0 ? finalizadas / total : 0,
    tempoMedioHoras,
  }
}

export interface PorDia { dia: string; total: number; finalizadas: number }

export function calcPorDia(rows: RelatorioRow[], periodo: PeriodoRelatorio): PorDia[] {
  const start = new Date(periodo.desde)
  const end = new Date(periodo.ate)
  const days: PorDia[] = []
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    days.push({ dia: dayKey(d), total: 0, finalizadas: 0 })
  }
  const idx = new Map<string, PorDia>()
  for (const d of days) idx.set(d.dia, d)

  for (const r of rows) {
    const k = dayKey(new Date(r.created_at))
    const day = idx.get(k)
    if (day) {
      day.total += 1
      if (r.status === 'finalizada') day.finalizadas += 1
    }
  }
  return days
}

function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export interface TopItem { id: string; label: string; total: number }

export function topClientes(ds: RelatorioDataset, limit = 10): TopItem[] {
  const counts = new Map<string, number>()
  for (const r of ds.rows) {
    if (!r.cliente_id) continue
    counts.set(r.cliente_id, (counts.get(r.cliente_id) ?? 0) + 1)
  }
  return entriesToTopItems(counts, ds.clientes, (v) => v.razao_social, limit)
}

export function topMotoristas(ds: RelatorioDataset, limit = 10): TopItem[] {
  const counts = new Map<string, number>()
  for (const r of ds.rows) {
    if (!r.motorista_id) continue
    counts.set(r.motorista_id, (counts.get(r.motorista_id) ?? 0) + 1)
  }
  return entriesToTopItems(counts, ds.motoristas, (v) => v.nome_completo, limit)
}

export function topVeiculos(ds: RelatorioDataset, limit = 10): TopItem[] {
  const counts = new Map<string, number>()
  for (const r of ds.rows) {
    if (!r.veiculo_id) continue
    counts.set(r.veiculo_id, (counts.get(r.veiculo_id) ?? 0) + 1)
  }
  return entriesToTopItems(counts, ds.veiculos, (v) => v.placa, limit)
}

export function topAtendentes(ds: RelatorioDataset, limit = 10): TopItem[] {
  const counts = new Map<string, number>()
  for (const r of ds.rows) {
    if (!r.atendente_id) continue
    counts.set(r.atendente_id, (counts.get(r.atendente_id) ?? 0) + 1)
  }
  return entriesToTopItems(counts, ds.atendentes, (v) => v.nome_completo, limit)
}

export function topSubcontratadas(ds: RelatorioDataset, limit = 10): TopItem[] {
  const counts = new Map<string, number>()
  for (const r of ds.rows) {
    if (!r.subcontratada_id) continue
    counts.set(r.subcontratada_id, (counts.get(r.subcontratada_id) ?? 0) + 1)
  }
  return entriesToTopItems(counts, ds.subcontratadas, (v) => v.razao_social, limit)
}

export function porMaterial(ds: RelatorioDataset): TopItem[] {
  const counts = new Map<string, number>()
  for (const r of ds.rows) {
    if (!r.material_id) continue
    counts.set(r.material_id, (counts.get(r.material_id) ?? 0) + 1)
  }
  return entriesToTopItems(counts, ds.materiais, (v) => v.nome, 50)
}

function entriesToTopItems<T>(
  counts: Map<string, number>,
  refs: Map<string, T>,
  getLabel: (v: T) => string,
  limit: number,
): TopItem[] {
  const arr: TopItem[] = []
  for (const [id, total] of counts.entries()) {
    const ref = refs.get(id)
    arr.push({ id, label: ref ? getLabel(ref) : '—', total })
  }
  arr.sort((a, b) => b.total - a.total)
  return arr.slice(0, limit)
}

// ── Períodos pré-configurados ──────────────────────────────────────────────

export type PeriodoPreset = 'mes' | 'mes_anterior' | '30d' | '90d'

export function periodoFromPreset(preset: PeriodoPreset): PeriodoRelatorio {
  const now = new Date()
  if (preset === 'mes') {
    const desde = new Date(now.getFullYear(), now.getMonth(), 1)
    const ate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return { desde: desde.toISOString(), ate: ate.toISOString(), label: 'Mês corrente' }
  }
  if (preset === 'mes_anterior') {
    const desde = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const ate = new Date(now.getFullYear(), now.getMonth(), 1)
    return { desde: desde.toISOString(), ate: ate.toISOString(), label: 'Mês anterior' }
  }
  if (preset === '30d') {
    const ate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const desde = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
    return { desde: desde.toISOString(), ate: ate.toISOString(), label: 'Últimos 30 dias' }
  }
  // 90d
  const ate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const desde = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89)
  return { desde: desde.toISOString(), ate: ate.toISOString(), label: 'Últimos 90 dias' }
}
