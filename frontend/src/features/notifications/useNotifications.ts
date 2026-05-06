import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type NotificationKind = 'pendente' | 'sem_oc' | 'validade_vencendo'

export interface NotificationItem {
  id: string
  kind: NotificationKind
  numero_interno: number
  solicitante_nome: string | null
  cliente_nome: string | null
  status: string
  created_at: string
  validade_fim: string | null
  age_label: string
}

const PENDING_THRESHOLD_H = 24
const INSTRUCAO_THRESHOLD_H = 4
const VALIDADE_LIMIT_H = 24

function isoNowMinusHours(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString()
}
function isoNowPlusHours(h: number): string {
  return new Date(Date.now() + h * 3_600_000).toISOString()
}

function ageHours(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}

function fmtAge(h: number): string {
  if (h < 1) return `há ${Math.round(h * 60)} min`
  if (h < 24) return `há ${Math.round(h)} h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'há 1 dia' : `há ${d} dias`
}

interface RawRow {
  id: string
  numero_interno: number
  solicitante_nome: string | null
  status: string
  created_at: string
  updated_at: string
  validade_fim: string | null
  cliente: { razao_social: string } | null
}

const SELECT = 'id, numero_interno, solicitante_nome, status, created_at, updated_at, validade_fim, cliente:cliente_id(razao_social)'

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    staleTime: 30_000,
    queryFn: async (): Promise<NotificationItem[]> => {
      const cutoffPending = isoNowMinusHours(PENDING_THRESHOLD_H)
      const cutoffInstrucao = isoNowMinusHours(INSTRUCAO_THRESHOLD_H)
      const validadeLimit = isoNowPlusHours(VALIDADE_LIMIT_H)

      const [pendentes, semOc, validade] = await Promise.all([
        supabase
          .from('solicitacoes')
          .select(SELECT)
          .in('status', ['recebida', 'em_cadastro'])
          .lt('created_at', cutoffPending)
          .order('created_at', { ascending: true })
          .limit(20),
        supabase
          .from('solicitacoes')
          .select(SELECT)
          .eq('status', 'instrucao_emitida')
          .lt('updated_at', cutoffInstrucao)
          .order('updated_at', { ascending: true })
          .limit(20),
        supabase
          .from('solicitacoes')
          .select(SELECT)
          .eq('status', 'oc_enviada')
          .eq('cte_emitido', false)
          .lt('validade_fim', validadeLimit)
          .gte('validade_fim', new Date().toISOString().slice(0, 10))
          .order('validade_fim', { ascending: true })
          .limit(20),
      ])

      const out: NotificationItem[] = []
      const seen = new Set<string>()
      const push = (kind: NotificationKind, rows: unknown) => {
        for (const r of (rows ?? []) as RawRow[]) {
          const key = `${kind}:${r.id}`
          if (seen.has(key)) continue
          seen.add(key)
          const refDate = kind === 'sem_oc' ? r.updated_at : r.created_at
          out.push({
            id: r.id,
            kind,
            numero_interno: r.numero_interno,
            solicitante_nome: r.solicitante_nome,
            cliente_nome: r.cliente?.razao_social ?? null,
            status: r.status,
            created_at: r.created_at,
            validade_fim: r.validade_fim,
            age_label: fmtAge(ageHours(refDate)),
          })
        }
      }

      push('pendente', pendentes.data)
      push('sem_oc', semOc.data)
      push('validade_vencendo', validade.data)
      return out
    },
  })
}

export const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
  pendente: 'Pendente há mais de 24h',
  sem_oc: 'Instrução emitida sem OC',
  validade_vencendo: 'OC sem CT-e · validade vencendo',
}
