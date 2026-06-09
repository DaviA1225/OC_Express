import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { SolicitacaoStatus } from '@/types/database.types'
import type { PeriodoRelatorio } from './useRelatorios'

/**
 * Relatório de PRODUTIVIDADE da equipe interna (diferente de /relatorios, que é
 * volume/TMA agregado, e de /auditoria, que é o log cru).
 *
 * Responde, nominalmente por atendente: quantas solicitações ele criou, quantas
 * solicitações de PARCEIRO ele pegou (tirou de "Recebida" → "Em emissão"),
 * quantas dessas ele levou até "Finalizada", quantas ficaram paradas na mão dele
 * e há quanto tempo, e o tempo médio que ele leva pra concluir.
 *
 * Tudo é reconstruído do `log_auditoria` (cada INSERT/UPDATE grava `usuario_id =
 * auth.uid()`), então não depende de nenhuma coluna nova — só de quem o Postgres
 * registrou como autor de cada ação. Partner-users vivem em `parceiro_usuarios`,
 * NÃO em `perfis_usuarios`; por isso um autor que não está em `perfis_usuarios`
 * é, por definição, um usuário do parceiro e fica de fora do placar da equipe.
 */

const STATUS_FECHADO: SolicitacaoStatus[] = ['finalizada', 'cancelada']

export interface SolicRowInterno {
  id: string
  numero_interno: number
  status: SolicitacaoStatus
  origem: string
  created_at: string
  finalizada_em: string | null
  parceiro_id: string | null
}

interface AuditEvent {
  registro_id: string
  usuario_id: string | null
  acao: string
  from_status: string | null
  to_status: string | null
  at: string
}

export interface ProdutividadeUsuario {
  userId: string
  nome: string
  perfil: string
  ativo: boolean
  // ── Atividade por etapa (nº de solicitações DISTINTAS em que o usuário
  //    executou aquela transição; bounce-backs não contam em dobro) ──────────
  /** Solicitações que ESTE usuário criou (autor do INSERT). */
  criou: number
  /** Solicitações que ele colocou Em emissão (→ em_cadastro). */
  emEmissao: number
  /** Solicitações em que ele gerou a OC (→ oc_gerada). */
  gerouOC: number
  /** Solicitações em que ele marcou OC enviada (→ oc_enviada). */
  enviouOC: number
  /** Solicitações que ele finalizou (→ finalizada). */
  finalizou: number
  // ── Acompanhamento / "enrolando" ────────────────────────────────────────
  /** De parceiro: que ele pôs em emissão e seguem ABERTAS (não fecharam). */
  emAbertoNaMao: number
  /** Tempo médio (em emissão → finalizada) das que ele finalizou, em horas. */
  tempoMedioConclusaoH: number | null
  /** Maior tempo que uma solicitação que ele iniciou está parada e aberta, em horas. */
  paradaMaisLongaH: number | null
}

export interface AbertaParada {
  solicitacaoId: string
  numero_interno: number
  status: SolicitacaoStatus
  parceiroNome: string | null
  ownerId: string
  ownerNome: string
  paradaHoras: number
}

export interface RelatorioInternoResult {
  usuarios: ProdutividadeUsuario[]
  abertasParadas: AbertaParada[]
  totais: {
    solicitacoesNoPeriodo: number
    deParceiro: number
    recebidasNaoIniciadas: number
    finalizadas: number
    abertas: number
  }
}

interface Refs {
  internos: Map<string, { nome: string; perfil: string; ativo: boolean }>
  parceiros: Map<string, string>
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// PostgREST limita cada resposta a 1000 linhas (db-max-rows). Cada solicitação
// acumula ~6-8 linhas de auditoria, então um bloco de 200 ids geraria >1000
// linhas e seria TRUNCADO em silêncio — subcontando transições. Por isso
// paginamos cada bloco com .range() até a página vir incompleta.
const PG_PAGE = 1000

async function fetchAuditEvents(solicitacaoIds: string[]): Promise<AuditEvent[]> {
  const all: AuditEvent[] = []
  for (const ch of chunk(solicitacaoIds, 150)) {
    let from = 0
    for (;;) {
      const { data, error } = await supabase
        .from('log_auditoria')
        .select('registro_id, usuario_id, acao, dados_antes, dados_depois, created_at')
        .eq('tabela', 'solicitacoes')
        .in('registro_id', ch)
        .order('created_at', { ascending: true })
        .range(from, from + PG_PAGE - 1)
      if (error) throw error
      const page = (data ?? []) as Array<{
        registro_id: string
        usuario_id: string | null
        acao: string
        dados_antes: { status?: string } | null
        dados_depois: { status?: string } | null
        created_at: string
      }>
      for (const l of page) {
        const fromStatus = l.dados_antes?.status ?? null
        const to = l.dados_depois?.status ?? null
        // INSERT: só interessa como "criação"; UPDATE: só se o status mudou.
        if (l.acao === 'UPDATE' && fromStatus === to) continue
        all.push({
          registro_id: l.registro_id,
          usuario_id: l.usuario_id,
          acao: l.acao,
          from_status: fromStatus,
          to_status: to,
          at: l.created_at,
        })
      }
      if (page.length < PG_PAGE) break
      from += PG_PAGE
    }
  }
  return all
}

/** Agregação pura (testável) a partir das solicitações + eventos + dicionários. */
export function agregarProdutividade(
  rows: SolicRowInterno[],
  events: AuditEvent[],
  refs: Refs,
  agora: number,
): RelatorioInternoResult {
  const eventosPorSolic = new Map<string, AuditEvent[]>()
  for (const e of events) {
    const arr = eventosPorSolic.get(e.registro_id)
    if (arr) arr.push(e)
    else eventosPorSolic.set(e.registro_id, [e])
  }
  for (const arr of eventosPorSolic.values()) {
    arr.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  }

  const isInterno = (uid: string | null): uid is string => !!uid && refs.internos.has(uid)

  const acc = new Map<string, ProdutividadeUsuario>()
  const tempoConclusao = new Map<string, number[]>()
  const ensure = (uid: string): ProdutividadeUsuario => {
    let u = acc.get(uid)
    if (!u) {
      const ref = refs.internos.get(uid)
      u = {
        userId: uid,
        nome: ref?.nome ?? '—',
        perfil: ref?.perfil ?? '—',
        ativo: ref?.ativo ?? false,
        criou: 0,
        emEmissao: 0,
        gerouOC: 0,
        enviouOC: 0,
        finalizou: 0,
        emAbertoNaMao: 0,
        tempoMedioConclusaoH: null,
        paradaMaisLongaH: null,
      }
      acc.set(uid, u)
    }
    return u
  }
  // Mapa de transição-de-status → campo de contagem por etapa.
  type EtapaCampo = 'emEmissao' | 'gerouOC' | 'enviouOC' | 'finalizou'
  const ETAPA: Record<string, EtapaCampo> = {
    em_cadastro: 'emEmissao',
    oc_gerada: 'gerouOC',
    oc_enviada: 'enviouOC',
    finalizada: 'finalizou',
  }

  const abertasParadas: AbertaParada[] = []
  let deParceiro = 0
  let recebidasNaoIniciadas = 0
  let finalizadas = 0
  let abertas = 0

  for (const r of rows) {
    const evs = eventosPorSolic.get(r.id) ?? []
    const ehParceiro = r.origem === 'parceiro'
    if (ehParceiro) deParceiro += 1
    const fechado = STATUS_FECHADO.includes(r.status)
    if (r.status === 'finalizada') finalizadas += 1
    if (!fechado) abertas += 1

    // Criação: autor do INSERT (se interno).
    const insert = evs.find((e) => e.acao === 'INSERT')
    if (insert && isInterno(insert.usuario_id)) {
      ensure(insert.usuario_id).criou += 1
    }

    // Contagem por etapa: nº de solicitações DISTINTAS em que cada usuário
    // executou aquela transição (um Set por etapa evita contar 2x quando a
    // solicitação volta e refaz a etapa).
    const creditadoNaEtapa = new Map<EtapaCampo, Set<string>>() // campo → userIds já creditados nesta solicitação
    for (const e of evs) {
      if (e.acao !== 'UPDATE' || !e.to_status) continue
      const campo = ETAPA[e.to_status]
      if (!campo || !isInterno(e.usuario_id)) continue
      let creditados = creditadoNaEtapa.get(campo)
      if (!creditados) {
        creditados = new Set()
        creditadoNaEtapa.set(campo, creditados)
      }
      if (creditados.has(e.usuario_id)) continue
      creditados.add(e.usuario_id)
      ensure(e.usuario_id)[campo] += 1
    }

    // Quem PEGOU primeiro (tira de "recebida" pra frente, ≠ cancelada): usado só
    // para o acompanhamento de "parado na mão de alguém" e o tempo de conclusão.
    const saiuDeRecebida = evs.find(
      (e) => e.acao === 'UPDATE' && e.from_status === 'recebida' && e.to_status && e.to_status !== 'cancelada',
    )
    const ownerId = isInterno(saiuDeRecebida?.usuario_id ?? null) ? saiuDeRecebida!.usuario_id! : null
    const inicioMs = saiuDeRecebida
      ? new Date(saiuDeRecebida.at).getTime()
      : new Date(r.created_at).getTime()
    const finalizacao = [...evs].reverse().find((e) => e.to_status === 'finalizada')

    // Recebidas que ninguém pegou ainda (sinal de fila parada na entrada).
    if (r.status === 'recebida') recebidasNaoIniciadas += 1

    if (ehParceiro && ownerId) {
      if (r.status === 'finalizada') {
        const fimMs = finalizacao
          ? new Date(finalizacao.at).getTime()
          : r.finalizada_em
            ? new Date(r.finalizada_em).getTime()
            : null
        // Tempo de conclusão creditado a quem FINALIZOU (não a quem pegou).
        const finalizadorId = isInterno(finalizacao?.usuario_id ?? null) ? finalizacao!.usuario_id! : ownerId
        if (fimMs != null && fimMs > inicioMs) {
          const horas = (fimMs - inicioMs) / 3_600_000
          const list = tempoConclusao.get(finalizadorId) ?? []
          list.push(horas)
          tempoConclusao.set(finalizadorId, list)
        }
      } else if (r.status !== 'cancelada') {
        const u = ensure(ownerId)
        u.emAbertoNaMao += 1
        const paradaHoras = (agora - inicioMs) / 3_600_000
        if (u.paradaMaisLongaH == null || paradaHoras > u.paradaMaisLongaH) {
          u.paradaMaisLongaH = paradaHoras
        }
        abertasParadas.push({
          solicitacaoId: r.id,
          numero_interno: r.numero_interno,
          status: r.status,
          parceiroNome: r.parceiro_id ? refs.parceiros.get(r.parceiro_id) ?? null : null,
          ownerId,
          ownerNome: u.nome,
          paradaHoras,
        })
      }
    }
  }

  // Médias.
  for (const u of acc.values()) {
    const tempos = tempoConclusao.get(u.userId)
    if (tempos && tempos.length > 0) {
      u.tempoMedioConclusaoH = tempos.reduce((a, b) => a + b, 0) / tempos.length
    }
  }

  const usuarios = Array.from(acc.values()).sort((a, b) => {
    if (b.finalizou !== a.finalizou) return b.finalizou - a.finalizou
    return b.emEmissao - a.emEmissao
  })
  abertasParadas.sort((a, b) => b.paradaHoras - a.paradaHoras)

  return {
    usuarios,
    abertasParadas,
    totais: {
      solicitacoesNoPeriodo: rows.length,
      deParceiro,
      recebidasNaoIniciadas,
      finalizadas,
      abertas,
    },
  }
}

export function useRelatorioInterno(periodo: PeriodoRelatorio) {
  return useQuery({
    queryKey: ['relatorio-interno', periodo.desde, periodo.ate],
    staleTime: 60_000,
    queryFn: async (): Promise<RelatorioInternoResult> => {
      // Paginado: o PostgREST corta em 1000 linhas/resposta, e um período longo
      // já passa disso (o sistema gera ~15 OCs/dia). Sem paginar, a cohort vinha
      // truncada e os totais/atribuições ficariam menores que o real.
      const rows: SolicRowInterno[] = []
      for (let from = 0; ; from += PG_PAGE) {
        const { data, error } = await supabase
          .from('solicitacoes')
          .select('id, numero_interno, status, origem, created_at, finalizada_em, parceiro_id')
          .gte('created_at', periodo.desde)
          .lt('created_at', periodo.ate)
          .order('created_at', { ascending: true })
          .range(from, from + PG_PAGE - 1)
        if (error) throw error
        const page = (data ?? []) as SolicRowInterno[]
        rows.push(...page)
        if (page.length < PG_PAGE) break
      }

      const [perfisRes, parceirosRes] = await Promise.all([
        supabase.from('perfis_usuarios').select('user_id, nome_completo, perfil, ativo'),
        rows.some((r) => r.parceiro_id)
          ? supabase.from('parceiros').select('id, razao_social')
          : Promise.resolve({ data: [] as { id: string; razao_social: string }[], error: null }),
      ])
      if (perfisRes.error) throw perfisRes.error
      if (parceirosRes.error) throw parceirosRes.error

      const internos = new Map<string, { nome: string; perfil: string; ativo: boolean }>()
      for (const p of (perfisRes.data ?? []) as {
        user_id: string
        nome_completo: string
        perfil: string
        ativo: boolean
      }[]) {
        internos.set(p.user_id, { nome: p.nome_completo, perfil: p.perfil, ativo: p.ativo })
      }
      const parceiros = new Map<string, string>()
      for (const p of (parceirosRes.data ?? []) as { id: string; razao_social: string }[]) {
        parceiros.set(p.id, p.razao_social)
      }

      const events = rows.length > 0 ? await fetchAuditEvents(rows.map((r) => r.id)) : []

      return agregarProdutividade(rows, events, { internos, parceiros }, Date.now())
    },
  })
}

// ── Formatação de duração (compartilhada com a página) ──────────────────────

export function formatHoras(h: number | null): string {
  if (h == null) return '—'
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}min`
  if (h < 24) return `${h.toFixed(1)}h`
  const dias = Math.floor(h / 24)
  const resto = Math.round(h - dias * 24)
  return resto > 0 ? `${dias}d ${resto}h` : `${dias}d`
}
