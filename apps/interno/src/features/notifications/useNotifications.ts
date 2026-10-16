import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { clausulaSla } from '@/features/solicitacoes/recorteLista'
import { buscarConfigMetasSla } from '@/features/metricas/fonte'
import { mapaSla } from '@/features/metricas/sla'
import { hojeOperacao } from '@/lib/datasOperacao'

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
  status_desde?: string | null
  validade_fim: string | null
  cliente: { razao_social: string } | null
}

const SELECT = 'id, numero_interno, solicitante_nome, status, created_at, updated_at, status_desde, validade_fim, cliente:cliente_id(razao_social)'

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
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['notifications'],
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    queryFn: async (): Promise<NotificationItem[]> => {
      // "Atrasada" = fora do SLA da etapa (mesma regra do Painel e da lista).
      // A config vem do cache de Metas e SLA (10 min); falhou, usa os padrões.
      const cfg = await qc
        .fetchQuery({ queryKey: ['metas-operacao'], queryFn: buscarConfigMetasSla, staleTime: 10 * 60_000 })
        .catch(() => null)
      const foraSla = clausulaSla(mapaSla(cfg?.etapas), 'fora')
      const cutoffStuck = isoNowMinusHours(STUCK_THRESHOLD_H)
      // Validade é DATE: compara com o "hoje" da operação (MS), não com o dia UTC.
      const validadeLimit = hojeOperacao(new Date(Date.now() + VALIDADE_LIMIT_H * 3_600_000))
      const cutoffPendencia = isoNowMinusHours(PENDENCIA_RESOLVIDA_LIMIT_H)

      const [atrasadas, semOc, ocNaoEnviada, validade, pendenciasResolvidas] = await Promise.all([
        supabase
          .from('solicitacoes')
          .select(SELECT)
          .or(foraSla ?? 'id.eq.00000000-0000-0000-0000-000000000000')
          .order('status_desde', { ascending: true })
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
          .in('status', ['oc_gerada', 'oc_enviada'])
          .lte('validade_fim', validadeLimit)
          .gte('validade_fim', hojeOperacao())
          .order('validade_fim', { ascending: true })
          .limit(20),
        // Tolerante a falha: se a tabela ainda não existir no ambiente (migration
        // 0035 não aplicada), não derruba os demais alertas.
        supabase
          .from('solicitacao_pendencias')
          .select('id, solicitacao_id, resolvida_em, solicitacao:solicitacao_id(numero_interno, solicitante_nome, status, created_at, cliente:cliente_id(razao_social))')
          .eq('status', 'resolvida')
          .is('vista_equipe_em', null)
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
          // Atrasada: tempo na etapa atual (status_desde, 0079).
          const refDate = kind === 'pendente' ? (r.status_desde ?? r.created_at) : kind === 'validade_vencendo' ? r.created_at : r.updated_at
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

      // Validade primeiro (mesma ordem do KIND_ORDER do sininho): a dedupe por id
      // mantém só o primeiro alerta, e uma OC gerada há mais de 4h também cai em
      // "não enviada"/"atrasada" — sem isso ela sumiria do grupo mais urgente.
      push('validade_vencendo', validade.data)
      push('sem_oc', semOc.data)
      push('oc_nao_enviada', ocNaoEnviada.data)
      push('pendente', atrasadas.data)
      return out
    },
  })
}

export const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
  pendencia_resolvida: 'Parceiro resolveu a pendência',
  pendente: 'Fora do SLA da etapa',
  sem_oc: 'Instrução emitida sem OC',
  oc_nao_enviada: 'OC gerada · não enviada',
  validade_vencendo: 'Validade da OC vence até amanhã',
}
