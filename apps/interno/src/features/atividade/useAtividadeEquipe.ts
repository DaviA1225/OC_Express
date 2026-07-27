import { useQuery } from '@tanstack/react-query'
import { startOfDay } from 'date-fns'
import { supabase } from '@/lib/supabase'

/**
 * Painel "Atividade da equipe" — retrato do AGORA, complementar a
 * /relatorios-internos (que é o placar AGREGADO do mês).
 *
 * Responde, por atendente operacional: qual foi a ÚLTIMA ação que ele
 * registrou ("Gerou a OC #0123"), há quanto tempo, o que ele fez HOJE, e —
 * por consequência — quem está SEM registrar ação há um tempo (ocioso).
 *
 * Tudo vem do `log_auditoria` (cada INSERT/UPDATE grava `usuario_id =
 * auth.uid()`), sem coluna nova. IMPORTANTE: o log registra ESCRITAS, não
 * presença. "Sem ação registrada" ≠ "não está trabalhando" — quem está no
 * telefone, lendo ou conferindo não gera log. O rótulo "ocioso" aqui significa
 * estritamente "não registrou nenhuma ação há mais de X minutos".
 */

// Equipe operacional cujo trabalho passa por solicitações. gerente/supervisor
// não processam OC (são o público deste painel), então não entram no placar a
// menos que tenham, de fato, registrado uma ação no período.
const PERFIS_OPERACIONAIS = new Set(['admin', 'analista', 'assistente'])

// Janela de busca do log para reconstruir a "última ação". 7 dias cobre com
// folga o volume (~15 OCs/dia → ~100 linhas/dia) sem estourar o teto do
// PostgREST, e ainda mostra "há 3 dias" para quem sumiu.
const JANELA_DIAS = 7
const PG_PAGE = 1000

interface PerfilRef {
  user_id: string
  nome_completo: string
  perfil: string
  ativo: boolean
}

interface RawEvent {
  usuario_id: string | null
  acao: string
  numero: number | null
  fromStatus: string | null
  toStatus: string | null
  at: string
}

export interface HojeContagem {
  criou: number
  emEmissao: number
  gerouOC: number
  enviouOC: number
  finalizou: number
  total: number
}

export interface UltimaAcao {
  descricao: string
  numero: number | null
  at: string
}

export interface AtividadeUsuario {
  userId: string
  nome: string
  perfil: string
  /** Última ação registrada na janela, ou null se não houve nenhuma. */
  ultimaAcao: UltimaAcao | null
  /** Minutos desde a última ação; null se não houve ação na janela. */
  ociosoMin: number | null
  hoje: HojeContagem
}

export interface AtividadeEquipeResult {
  usuarios: AtividadeUsuario[]
  geradoEm: number
  equipe: number
}

const ETAPA: Record<string, keyof HojeContagem> = {
  em_cadastro: 'emEmissao',
  oc_gerada: 'gerouOC',
  oc_enviada: 'enviouOC',
  finalizada: 'finalizou',
}

/** Descrição curta da ação, sem o número (a página acrescenta "#0123"). */
function descricaoBase(e: RawEvent): string {
  if (e.acao === 'INSERT') return 'Criou a solicitação'
  if (e.acao === 'DELETE') return 'Removeu a solicitação'
  // UPDATE
  if (e.toStatus && e.toStatus !== e.fromStatus) {
    switch (e.toStatus) {
      case 'em_cadastro':
        return 'Pôs em emissão'
      case 'instrucao_emitida':
        return 'Emitiu a instrução'
      case 'oc_gerada':
        return 'Gerou a OC'
      case 'oc_enviada':
        return 'Enviou a OC'
      case 'finalizada':
        return 'Finalizou'
      case 'cancelada':
        return 'Cancelou'
      default:
        return 'Atualizou'
    }
  }
  return 'Editou a solicitação'
}

/** `->>` devolve texto; `numero_interno` volta como string e precisa virar número. */
function paraNumero(v: string | null): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function fetchEventos(desdeISO: string): Promise<RawEvent[]> {
  const all: RawEvent[] = []
  // Ordem DESC: a primeira linha vista de cada usuário já é a mais recente.
  for (let from = 0; ; from += PG_PAGE) {
    // Extrai só os quatro campos usados, no SERVIDOR (`->>`). `dados_antes` e
    // `dados_depois` são snapshots `to_jsonb()` da linha inteira da solicitação
    // (~1,9 KB por linha de log) — trazer sete dias deles a cada 60s, para ler
    // status e número, era o maior tráfego do painel.
    const { data, error } = await supabase
      .from('log_auditoria')
      .select(
        'usuario_id, acao, created_at,' +
          ' antesStatus:dados_antes->>status, depoisStatus:dados_depois->>status,' +
          ' antesNumero:dados_antes->>numero_interno, depoisNumero:dados_depois->>numero_interno',
      )
      .eq('tabela', 'solicitacoes')
      .gte('created_at', desdeISO)
      .order('created_at', { ascending: false })
      .range(from, from + PG_PAGE - 1)
    if (error) throw error
    const page = (data ?? []) as unknown as Array<{
      usuario_id: string | null
      acao: string
      created_at: string
      antesStatus: string | null
      depoisStatus: string | null
      antesNumero: string | null
      depoisNumero: string | null
    }>
    for (const l of page) {
      all.push({
        usuario_id: l.usuario_id,
        acao: l.acao,
        numero: paraNumero(l.depoisNumero) ?? paraNumero(l.antesNumero),
        fromStatus: l.antesStatus,
        toStatus: l.depoisStatus,
        at: l.created_at,
      })
    }
    if (page.length < PG_PAGE) break
  }
  return all
}

/** Agregação pura (testável) a partir dos perfis + eventos do log. */
export function agregarAtividade(
  perfis: PerfilRef[],
  events: RawEvent[],
  agoraMs: number,
): AtividadeEquipeResult {
  const todayStart = startOfDay(new Date(agoraMs)).getTime()
  const refByUser = new Map(perfis.map((p) => [p.user_id, p]))

  const roster = new Map<string, AtividadeUsuario>()
  const ensure = (uid: string): AtividadeUsuario => {
    let u = roster.get(uid)
    if (!u) {
      const ref = refByUser.get(uid)
      u = {
        userId: uid,
        nome: ref?.nome_completo ?? '—',
        perfil: ref?.perfil ?? '—',
        ultimaAcao: null,
        ociosoMin: null,
        hoje: { criou: 0, emEmissao: 0, gerouOC: 0, enviouOC: 0, finalizou: 0, total: 0 },
      }
      roster.set(uid, u)
    }
    return u
  }

  // Roster base: equipe operacional ativa (aparece mesmo sem nenhuma ação).
  for (const p of perfis) {
    if (p.ativo && PERFIS_OPERACIONAIS.has(p.perfil)) ensure(p.user_id)
  }
  // Inclui também quem registrou ação e é interno ativo (ex.: supervisor que
  // excepcionalmente processou) — para não perder o trabalho dele.
  for (const e of events) {
    if (!e.usuario_id) continue
    const ref = refByUser.get(e.usuario_id)
    if (ref && ref.ativo) ensure(e.usuario_id)
  }

  for (const e of events) {
    if (!e.usuario_id) continue
    const u = roster.get(e.usuario_id)
    if (!u) continue
    // events vêm em DESC → a primeira ocorrência é a última ação.
    if (!u.ultimaAcao) {
      u.ultimaAcao = { descricao: descricaoBase(e), numero: e.numero, at: e.at }
      u.ociosoMin = Math.max(0, Math.round((agoraMs - new Date(e.at).getTime()) / 60_000))
    }
    if (new Date(e.at).getTime() >= todayStart) {
      u.hoje.total += 1
      if (e.acao === 'INSERT') {
        u.hoje.criou += 1
      } else if (e.acao === 'UPDATE' && e.toStatus && e.toStatus !== e.fromStatus) {
        const campo = ETAPA[e.toStatus]
        if (campo) u.hoje[campo] += 1
      }
    }
  }

  const usuarios = Array.from(roster.values())
  return { usuarios, geradoEm: agoraMs, equipe: usuarios.length }
}

export function useAtividadeEquipe() {
  return useQuery({
    queryKey: ['atividade-equipe'],
    // Retrato do agora: revalida sozinho enquanto o painel está aberto.
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<AtividadeEquipeResult> => {
      const desde = new Date(Date.now() - JANELA_DIAS * 86_400_000).toISOString()
      const [perfisRes, events] = await Promise.all([
        supabase.from('perfis_usuarios').select('user_id, nome_completo, perfil, ativo'),
        fetchEventos(desde),
      ])
      if (perfisRes.error) throw perfisRes.error
      const perfis = (perfisRes.data ?? []) as PerfilRef[]
      return agregarAtividade(perfis, events, Date.now())
    },
  })
}

// ── Formatação compartilhada com a página ───────────────────────────────────

export function formatHaQuanto(min: number | null): string {
  if (min == null) return '—'
  if (min < 1) return 'agora mesmo'
  if (min < 60) return `há ${min} min`
  if (min < 1440) {
    const h = Math.floor(min / 60)
    return `há ${h} h`
  }
  const d = Math.floor(min / 1440)
  return `há ${d} d`
}
