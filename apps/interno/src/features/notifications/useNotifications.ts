import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { SLA_ALERT_HOURS } from '@/features/solicitacoes/status'

export type NotificationKind = 'pendencia_resolvida' | 'pendente' | 'sem_oc' | 'oc_nao_enviada' | 'validade_vencendo'

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

const STUCK_THRESHOLD_H = 4
const VALIDADE_LIMIT_H = 24
const PENDENCIA_RESOLVIDA_LIMIT_H = 72

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

interface RawPendencia {
  id: string
  solicitacao_id: string
  resolvida_em: string | null
  solicitacao: {
    numero_interno: number
    solicitante_nome: string | null
    status: string
    created_at: string
    cliente: { razao_social: string } | null
  } | null
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    staleTime: 30_000,
    queryFn: async (): Promise<NotificationItem[]> => {
      const cutoffSlaAtraso = isoNowMinusHours(SLA_ALERT_HOURS)
      const cutoffStuck = isoNowMinusHours(STUCK_THRESHOLD_H)
      const validadeLimit = isoNowPlusHours(VALIDADE_LIMIT_H)
      const cutoffPendencia = isoNowMinusHours(PENDENCIA_RESOLVIDA_LIMIT_H)

      const [atrasadas, semOc, ocNaoEnviada, validade, pendenciasResolvidas] = await Promise.all([
        supabase
          .from('solicitacoes')
          .select(SELECT)
          .in('status', ['recebida', 'em_cadastro', 'instrucao_emitida', 'oc_gerada'])
          .lt('created_at', cutoffSlaAtraso)
          .order('created_at', { ascending: true })
          .limit(40),
        supabase
          .from('solicitacoes')
          .select(SELECT)
          .eq('status', 'instrucao_emitida')
          .lt('updated_at', cutoffStuck)
          .order('updated_at', { ascending: true })
          .limit(20),
        supabase
          .from('solicitacoes')
          .select(SELECT)
          .eq('status', 'oc_gerada')
          .lt('updated_at', cutoffStuck)
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
        // Tolerante a falha: se a tabela ainda não existir no ambiente (migration
        // 0035 não aplicada), não derruba os demais alertas.
        supabase
          .from('solicitacao_pendencias')
          .select('id, solicitacao_id, resolvida_em, solicitacao:solicitacao_id(numero_interno, solicitante_nome, status, created_at, cliente:cliente_id(razao_social))')
          .eq('status', 'resolvida')
          .gte('resolvida_em', cutoffPendencia)
          .order('resolvida_em', { ascending: false })
          .limit(20)
          .then((r) => r, () => ({ data: [] })),
      ])

      const out: NotificationItem[] = []
      const seen = new Set<string>()
      const push = (kind: NotificationKind, rows: unknown) => {
        for (const r of (rows ?? []) as RawRow[]) {
          if (seen.has(r.id)) continue
          seen.add(r.id)
          const refDate = kind === 'pendente' || kind === 'validade_vencendo' ? r.created_at : r.updated_at
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

      // Pendências resolvidas pelo parceiro — empurradas primeiro para terem
      // prioridade na deduplicação por solicitação (id = solicitacao_id, para a
      // navegação cair na solicitação certa).
      for (const r of (pendenciasResolvidas.data ?? []) as unknown as RawPendencia[]) {
        if (!r.solicitacao || seen.has(r.solicitacao_id)) continue
        seen.add(r.solicitacao_id)
        out.push({
          id: r.solicitacao_id,
          kind: 'pendencia_resolvida',
          numero_interno: r.solicitacao.numero_interno,
          solicitante_nome: r.solicitacao.solicitante_nome,
          cliente_nome: r.solicitacao.cliente?.razao_social ?? null,
          status: r.solicitacao.status,
          created_at: r.solicitacao.created_at,
          validade_fim: null,
          age_label: r.resolvida_em ? fmtAge(ageHours(r.resolvida_em)) : '',
        })
      }

      push('sem_oc', semOc.data)
      push('oc_nao_enviada', ocNaoEnviada.data)
      push('pendente', atrasadas.data)
      push('validade_vencendo', validade.data)
      return out
    },
  })
}

export const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
  pendencia_resolvida: 'Parceiro resolveu a pendência',
  pendente: `Atrasada (mais de ${SLA_ALERT_HOURS}h)`,
  sem_oc: 'Instrução emitida sem OC',
  oc_nao_enviada: 'OC gerada · não enviada',
  validade_vencendo: 'OC sem CT-e · validade vencendo',
}
