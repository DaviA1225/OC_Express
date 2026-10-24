import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { AgenteModo, Tables } from '@/types/database.types'

/**
 * Dados da tela "Conversas" (agente de IA do WhatsApp — docs/SPEC-AGENTE-IA.md).
 *
 * Leitura e as ações simples (assumir, rejeitar rascunho, trocar o modo) vão
 * direto ao banco pela RLS. Responder, devolver ao agente e aprovar rascunho
 * passam pelo servidor do agente (`/api/agente`), que tem o token da UAZAPI.
 *
 * Atualização por consulta periódica, e só com a tela aberta e a aba visível
 * (o react-query não consulta em segundo plano por padrão): conversa é ao vivo,
 * mas quem não está nesta tela não paga por isso.
 */

export type Conversa = Tables<'agente_conversas'>
export type MensagemAgente = Tables<'agente_mensagens'>
export type AcaoAgente = Tables<'agente_acoes'>

export interface ConversaResumo extends Conversa {
  ultimaMensagem: Pick<MensagemAgente, 'texto' | 'tipo' | 'direcao' | 'autor' | 'created_at'> | null
  /** Mensagens do contato que o agente ainda não leu (fila enquanto está com humano). */
  pendentes: number
  rascunhos: number
}

const INTERVALO_LISTA_MS = 10_000
const INTERVALO_CONVERSA_MS = 4_000
const LIMITE_CONVERSAS = 100

export function useAgenteModo() {
  return useQuery({
    queryKey: ['agente', 'modo'],
    queryFn: async (): Promise<AgenteModo> => {
      const { data, error } = await supabase.from('agente_config').select('modo').eq('id', 1).maybeSingle()
      if (error) throw error
      return ((data as { modo?: AgenteModo } | null)?.modo ?? 'desligado') as AgenteModo
    },
    staleTime: 30_000,
  })
}

export function useDefinirModo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (modo: AgenteModo) => {
      const { data: u } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('agente_config')
        .update({ modo, updated_at: new Date().toISOString(), updated_by: u.user?.id ?? null } as never)
        .eq('id', 1)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agente', 'modo'] }),
    onError: () => toast.error('Não foi possível trocar o modo do agente.'),
  })
}

export function useConversas() {
  return useQuery({
    queryKey: ['agente', 'conversas'],
    refetchInterval: INTERVALO_LISTA_MS,
    queryFn: async (): Promise<ConversaResumo[]> => {
      const { data: conversas, error } = await supabase
        .from('agente_conversas')
        .select('*')
        .order('ultima_atividade_em', { ascending: false })
        .limit(LIMITE_CONVERSAS)
      if (error) throw error
      const lista = (conversas ?? []) as Conversa[]
      if (lista.length === 0) return []
      const ids = lista.map((c) => c.id)

      // Uma consulta por conjunto, não por conversa. 100 ids cabem no .in()
      // sem estourar a URL (ver o limite de ~120 do PostgREST).
      const desde = new Date(Date.now() - 7 * 86_400_000).toISOString()
      const [msgs, pend, rasc] = await Promise.all([
        supabase
          .from('agente_mensagens')
          .select('conversa_id, texto, tipo, direcao, autor, created_at')
          .in('conversa_id', ids)
          .gte('created_at', desde)
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('agente_mensagens')
          .select('conversa_id')
          .in('conversa_id', ids)
          .eq('direcao', 'entrada')
          .eq('processada', false),
        supabase.from('agente_acoes').select('conversa_id').in('conversa_id', ids).eq('status', 'rascunho'),
      ])
      if (msgs.error) throw msgs.error

      const ultima = new Map<string, ConversaResumo['ultimaMensagem']>()
      for (const m of (msgs.data ?? []) as (ConversaResumo['ultimaMensagem'] & { conversa_id: string })[]) {
        if (m && !ultima.has(m.conversa_id)) ultima.set(m.conversa_id, m)
      }
      const contar = (rows: { conversa_id: string }[] | null) => {
        const mapa = new Map<string, number>()
        for (const r of rows ?? []) mapa.set(r.conversa_id, (mapa.get(r.conversa_id) ?? 0) + 1)
        return mapa
      }
      const pendentes = contar(pend.data as { conversa_id: string }[] | null)
      const rascunhos = contar(rasc.data as { conversa_id: string }[] | null)

      return lista.map((c) => ({
        ...c,
        ultimaMensagem: ultima.get(c.id) ?? null,
        pendentes: pendentes.get(c.id) ?? 0,
        rascunhos: rascunhos.get(c.id) ?? 0,
      }))
    },
  })
}

export interface ConversaDetalhe {
  conversa: Conversa
  mensagens: MensagemAgente[]
  acoes: AcaoAgente[]
  nomes: Record<string, string>
  /** Dentro das 24 h desde a última mensagem do contato? Calculado na consulta (que se
   *  repete a cada poucos segundos), não na renderização. */
  janelaAberta: boolean
}

const JANELA_RESPOSTA_MS = 24 * 3_600_000

export function useConversa(id: string | null) {
  return useQuery({
    queryKey: ['agente', 'conversa', id],
    enabled: !!id,
    refetchInterval: INTERVALO_CONVERSA_MS,
    queryFn: async (): Promise<ConversaDetalhe> => {
      const [c, m, a] = await Promise.all([
        supabase.from('agente_conversas').select('*').eq('id', id!).single(),
        supabase.from('agente_mensagens').select('*').eq('conversa_id', id!).order('created_at').limit(500),
        supabase.from('agente_acoes').select('*').eq('conversa_id', id!).order('created_at').limit(300),
      ])
      if (c.error) throw c.error
      if (m.error) throw m.error
      if (a.error) throw a.error
      const mensagens = (m.data ?? []) as MensagemAgente[]
      const acoes = (a.data ?? []) as AcaoAgente[]

      // Nome de quem respondeu, assumiu ou decidiu: a tela mostra pessoas, não ids.
      const conversa = c.data as Conversa
      const ids = new Set<string>()
      for (const x of mensagens) if (x.enviada_por) ids.add(x.enviada_por)
      for (const x of acoes) if (x.decidido_por) ids.add(x.decidido_por)
      if (conversa.assumida_por) ids.add(conversa.assumida_por)
      const nomes: Record<string, string> = {}
      if (ids.size) {
        const { data: perfis } = await supabase
          .from('perfis_usuarios')
          .select('user_id, nome_completo')
          .in('user_id', [...ids])
        for (const p of (perfis ?? []) as { user_id: string; nome_completo: string }[]) nomes[p.user_id] = p.nome_completo
      }
      const janelaAberta =
        !!conversa.ultima_entrada_em && Date.now() - new Date(conversa.ultima_entrada_em).getTime() < JANELA_RESPOSTA_MS
      return { conversa, mensagens, acoes, nomes, janelaAberta }
    },
  })
}

/** Conversas que pedem a equipe: com humano e com rascunho a decidir. Badge do menu. */
export function useConversasAtencaoCount(enabled = true) {
  return useQuery({
    queryKey: ['agente', 'atencao'],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [h, r] = await Promise.all([
        supabase.from('agente_conversas').select('id', { count: 'exact', head: true }).eq('estado', 'humano'),
        supabase.from('agente_acoes').select('id', { count: 'exact', head: true }).eq('status', 'rascunho'),
      ])
      return { comHumano: h.count ?? 0, rascunhos: r.count ?? 0 }
    },
  })
}

function invalidar(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: ['agente', 'conversas'] })
  qc.invalidateQueries({ queryKey: ['agente', 'atencao'] })
  if (id) qc.invalidateQueries({ queryKey: ['agente', 'conversa', id] })
}

export function useAssumirConversa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser()
      const agora = new Date().toISOString()
      const { error } = await supabase
        .from('agente_conversas')
        .update({ estado: 'humano', assumida_por: u.user?.id ?? null, assumida_em: agora, updated_at: agora } as never)
        .eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: (id) => invalidar(qc, id),
    onError: () => toast.error('Não foi possível assumir a conversa.'),
  })
}

export function useRejeitarRascunho() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ acaoId }: { acaoId: string; conversaId: string }) => {
      const { data: u } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('agente_acoes')
        .update({ status: 'rejeitada', decidido_por: u.user?.id ?? null, decidido_em: new Date().toISOString() } as never)
        .eq('id', acaoId)
        .eq('status', 'rascunho')
      if (error) throw error
    },
    onSuccess: (_d, v) => invalidar(qc, v.conversaId),
    onError: () => toast.error('Não foi possível rejeitar o rascunho.'),
  })
}

// ── Ações pelo servidor do agente ───────────────────────────────────────────

type AcaoServidor =
  | { acao: 'enviar'; conversa_id: string; texto: string }
  | { acao: 'devolver'; conversa_id: string }
  | { acao: 'aprovar'; acao_id: string }

async function chamarAgente(corpo: AcaoServidor): Promise<{ ok: boolean; resultado?: Record<string, unknown> }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessão expirada. Entre de novo.')
  const res = await fetch('/api/agente', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(corpo),
  })
  const json = (await res.json().catch(() => ({}))) as { erro?: string; ok?: boolean; resultado?: Record<string, unknown> }
  if (!res.ok) throw new Error(json.erro ?? `Servidor do agente indisponível (${res.status}).`)
  return { ok: json.ok ?? true, resultado: json.resultado }
}

export function useEnviarMensagem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { conversaId: string; texto: string }) =>
      chamarAgente({ acao: 'enviar', conversa_id: v.conversaId, texto: v.texto }),
    onSuccess: (_d, v) => invalidar(qc, v.conversaId),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDevolverAoAgente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (conversaId: string) => chamarAgente({ acao: 'devolver', conversa_id: conversaId }),
    onSuccess: (_d, id) => {
      invalidar(qc, id)
      toast.success('Conversa devolvida ao agente.')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAprovarRascunho() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { acaoId: string; conversaId: string }) => chamarAgente({ acao: 'aprovar', acao_id: v.acaoId }),
    onSuccess: (r, v) => {
      invalidar(qc, v.conversaId)
      if (r.ok) toast.success('Rascunho aprovado e executado.')
      else toast.error(`Aprovado, mas a execução falhou: ${String(r.resultado?.erro ?? 'erro')}`)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/** URL assinada de 1 h para tocar áudio, ver foto ou abrir PDF. */
export async function urlDaMidia(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('agente-midia').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}
