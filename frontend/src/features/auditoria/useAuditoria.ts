import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database.types'

export type AuditAcao = 'INSERT' | 'UPDATE' | 'DELETE'

export interface AuditPeriodo {
  desde: string | null
  ate: string | null
}

export interface AuditFilters {
  acoes: AuditAcao[]
  tabelas: string[]
  usuarioIds: string[]
  periodo: AuditPeriodo
  page: number
  pageSize: number
}

export interface AuditLogRow {
  id: string
  usuario_id: string | null
  acao: string
  tabela: string
  registro_id: string | null
  dados_antes: Json | null
  dados_depois: Json | null
  created_at: string
  usuario_nome: string | null
}

export const TABELAS_AUDITADAS = [
  'solicitacoes',
  'motoristas',
  'veiculos',
  'carretas',
  'subcontratadas',
  'clientes',
  'materiais',
  'cargas_retorno',
] as const

export type TabelaAuditada = (typeof TABELAS_AUDITADAS)[number]

export const TABELA_LABELS: Record<string, string> = {
  solicitacoes: 'Solicitações',
  motoristas: 'Motoristas',
  veiculos: 'Veículos',
  carretas: 'Carretas',
  subcontratadas: 'Subcontratadas',
  clientes: 'Clientes',
  materiais: 'Materiais',
  cargas_retorno: 'Cargas de Retorno',
}

export const ACAO_LABELS: Record<AuditAcao, string> = {
  INSERT: 'Criação',
  UPDATE: 'Edição',
  DELETE: 'Exclusão',
}

export function useAuditList(filters: AuditFilters) {
  return useQuery({
    queryKey: ['auditoria', filters],
    queryFn: async () => {
      let q = supabase
        .from('log_auditoria')
        .select('*', { count: 'exact' })

      if (filters.acoes.length > 0) q = q.in('acao', filters.acoes)
      if (filters.tabelas.length > 0) q = q.in('tabela', filters.tabelas)
      if (filters.usuarioIds.length > 0) q = q.in('usuario_id', filters.usuarioIds)
      if (filters.periodo.desde) q = q.gte('created_at', filters.periodo.desde)
      if (filters.periodo.ate) q = q.lte('created_at', filters.periodo.ate)

      q = q.order('created_at', { ascending: false })

      const from = (filters.page - 1) * filters.pageSize
      const to = from + filters.pageSize - 1
      q = q.range(from, to)

      const { data, error, count } = await q
      if (error) throw error
      const rows = (data ?? []) as Omit<AuditLogRow, 'usuario_nome'>[]

      const userIds = Array.from(new Set(rows.map((r) => r.usuario_id).filter(Boolean) as string[]))
      const nomeMap = new Map<string, string>()
      if (userIds.length > 0) {
        const { data: perfis } = await supabase
          .from('perfis_usuarios')
          .select('user_id, nome_completo')
          .in('user_id', userIds)
        for (const p of (perfis ?? []) as { user_id: string; nome_completo: string }[]) {
          nomeMap.set(p.user_id, p.nome_completo)
        }
      }

      return {
        data: rows.map((r) => ({
          ...r,
          usuario_nome: r.usuario_id ? nomeMap.get(r.usuario_id) ?? null : null,
        })) as AuditLogRow[],
        count: count ?? 0,
      }
    },
  })
}

export function useAuditUsuarios() {
  return useQuery({
    queryKey: ['auditoria-usuarios'],
    staleTime: 60_000,
    queryFn: async (): Promise<{ user_id: string; nome_completo: string }[]> => {
      const { data, error } = await supabase
        .from('perfis_usuarios')
        .select('user_id, nome_completo')
        .order('nome_completo', { ascending: true })
      if (error) throw error
      return (data ?? []) as { user_id: string; nome_completo: string }[]
    },
  })
}

export interface DiffEntry {
  campo: string
  antes: unknown
  depois: unknown
}

const HIDDEN_FIELDS = new Set(['updated_at', 'created_at', 'created_by'])

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function diffJson(antes: Json | null, depois: Json | null): DiffEntry[] {
  const a = isObject(antes) ? (antes as Record<string, unknown>) : {}
  const d = isObject(depois) ? (depois as Record<string, unknown>) : {}
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(d)])
  const out: DiffEntry[] = []
  for (const k of keys) {
    if (HIDDEN_FIELDS.has(k)) continue
    if (JSON.stringify(a[k]) === JSON.stringify(d[k])) continue
    out.push({ campo: k, antes: a[k], depois: d[k] })
  }
  out.sort((x, y) => x.campo.localeCompare(y.campo))
  return out
}

export function formatJsonValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  return JSON.stringify(v)
}
