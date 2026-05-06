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
}

export interface ClienteRef { razao_social: string }
export interface MotoristaRef { nome_completo: string }
export interface MaterialRef { nome: string }
export interface VeiculoRef { placa: string }
export interface SubcontratadaRef { razao_social: string }

export interface RelatorioDataset {
  rows: RelatorioRow[]
  clientes: Map<string, ClienteRef>
  motoristas: Map<string, MotoristaRef>
  materiais: Map<string, MaterialRef>
  veiculos: Map<string, VeiculoRef>
  subcontratadas: Map<string, SubcontratadaRef>
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
          'id, numero_interno, status, tipo, created_at, finalizada_em, enviada_em, cliente_id, motorista_id, material_id, veiculo_id, subcontratada_id',
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

      const [clientesData, motoristasData, materiaisData, veiculosData, subsData] = await Promise.all([
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

      return { rows, clientes, motoristas, materiais, veiculos, subcontratadas }
    },
  })
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
