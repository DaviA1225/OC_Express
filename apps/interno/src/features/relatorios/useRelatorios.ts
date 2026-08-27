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
  origem: string
  parceiro_id: string | null
  created_at: string
  finalizada_em: string | null
  enviada_em: string | null
  cliente_id: string | null
  motorista_id: string | null
  material_id: string | null
  veiculo_id: string | null
  subcontratada_id: string | null
  atendente_id: string | null
  // Solicitações de parceiro referenciam a frota do próprio parceiro (tabelas
  // parceiro_*), não os cadastros internos — por isso os campos paralelos.
  parceiro_motorista_id: string | null
  parceiro_veiculo_id: string | null
  parceiro_subcontratada_id: string | null
}

export interface ClienteRef { razao_social: string }
export interface MotoristaRef { nome_completo: string }
export interface MaterialRef { nome: string }
export interface VeiculoRef { placa: string }
export interface SubcontratadaRef { razao_social: string }
export interface AtendenteRef { nome_completo: string; perfil: string }
export interface ParceiroRef { razao_social: string }

export interface RelatorioDataset {
  rows: RelatorioRow[]
  clientes: Map<string, ClienteRef>
  motoristas: Map<string, MotoristaRef>
  materiais: Map<string, MaterialRef>
  veiculos: Map<string, VeiculoRef>
  subcontratadas: Map<string, SubcontratadaRef>
  atendentes: Map<string, AtendenteRef>
  parceiros: Map<string, ParceiroRef>
  // Frota do parceiro (para resolver os tops nas solicitações de parceiro).
  parceiroMotoristas: Map<string, MotoristaRef>
  parceiroVeiculos: Map<string, VeiculoRef>
  parceiroSubcontratadas: Map<string, SubcontratadaRef>
}

/**
 * Resolve um dicionário por lista de ids, buscando em blocos. Um único `.in()`
 * com centenas de ids gera uma URL longa demais e o PostgREST responde 400.
 */
async function fetchInChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  size = 120,
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += size) {
    const { data, error } = await run(ids.slice(i, i + size))
    if (error) throw error
    if (data) out.push(...data)
  }
  return out
}

/** Busca todas as solicitações criadas no período + dicionários para resolver IDs. */
export function useRelatorioDataset(periodo: PeriodoRelatorio) {
  return useQuery({
    queryKey: ['relatorio', periodo.desde, periodo.ate],
    staleTime: 60_000,
    queryFn: async (): Promise<RelatorioDataset> => {
      // O PostgREST limita cada resposta a ~1000 linhas (db-max-rows) e IGNORA
      // .limit() acima disso. Como a ordenação é por created_at ascendente, sem
      // paginar o relatório "trava" nas 1000 OCs mais antigas e some com os dias
      // mais recentes. Paginamos em blocos para trazer todas as OCs do período.
      const PAGE = 1000
      const rows: RelatorioRow[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('solicitacoes')
          .select(
            'id, numero_interno, status, tipo, origem, parceiro_id, created_at, finalizada_em, enviada_em, cliente_id, motorista_id, material_id, veiculo_id, subcontratada_id, atendente_id, parceiro_motorista_id, parceiro_veiculo_id, parceiro_subcontratada_id',
          )
          .gte('created_at', periodo.desde)
          .lt('created_at', periodo.ate)
          .order('created_at', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error) throw error
        const batch = (data ?? []) as RelatorioRow[]
        rows.push(...batch)
        if (batch.length < PAGE) break
      }

      const clienteIds = Array.from(new Set(rows.map((r) => r.cliente_id).filter(Boolean) as string[]))
      const motoristaIds = Array.from(new Set(rows.map((r) => r.motorista_id).filter(Boolean) as string[]))
      const materialIds = Array.from(new Set(rows.map((r) => r.material_id).filter(Boolean) as string[]))
      const veiculoIds = Array.from(new Set(rows.map((r) => r.veiculo_id).filter(Boolean) as string[]))
      const subcontratadaIds = Array.from(new Set(rows.map((r) => r.subcontratada_id).filter(Boolean) as string[]))
      const atendenteIds = Array.from(new Set(rows.map((r) => r.atendente_id).filter(Boolean) as string[]))
      const parceiroIds = Array.from(new Set(rows.map((r) => r.parceiro_id).filter(Boolean) as string[]))
      const pMotoristaIds = Array.from(new Set(rows.map((r) => r.parceiro_motorista_id).filter(Boolean) as string[]))
      const pVeiculoIds = Array.from(new Set(rows.map((r) => r.parceiro_veiculo_id).filter(Boolean) as string[]))
      const pSubIds = Array.from(new Set(rows.map((r) => r.parceiro_subcontratada_id).filter(Boolean) as string[]))

      // Um único .in() com centenas de ids estoura o tamanho da URL do PostgREST
      // (Bad Request). Períodos longos têm 700+ motoristas/veículos distintos, o
      // que quebrava só esses dicionários — deixando os tops sem nome. Buscamos
      // cada dicionário em blocos de ids.
      const [
        clientesArr,
        motoristasArr,
        materiaisArr,
        veiculosArr,
        subsArr,
        atendentesArr,
        parceirosArr,
        pMotoristasArr,
        pVeiculosArr,
        pSubsArr,
      ] = await Promise.all([
        fetchInChunks<{ id: string; razao_social: string }>(clienteIds, (ch) =>
          supabase.from('clientes').select('id, razao_social').in('id', ch),
        ),
        fetchInChunks<{ id: string; nome_completo: string }>(motoristaIds, (ch) =>
          supabase.from('motoristas').select('id, nome_completo').in('id', ch),
        ),
        fetchInChunks<{ id: string; nome: string }>(materialIds, (ch) =>
          supabase.from('materiais').select('id, nome').in('id', ch),
        ),
        fetchInChunks<{ id: string; placa: string }>(veiculoIds, (ch) =>
          supabase.from('veiculos').select('id, placa').in('id', ch),
        ),
        fetchInChunks<{ id: string; razao_social: string }>(subcontratadaIds, (ch) =>
          supabase.from('subcontratadas').select('id, razao_social').in('id', ch),
        ),
        fetchInChunks<{ user_id: string; nome_completo: string; perfil: string }>(atendenteIds, (ch) =>
          supabase.from('perfis_usuarios').select('user_id, nome_completo, perfil').in('user_id', ch),
        ),
        fetchInChunks<{ id: string; razao_social: string }>(parceiroIds, (ch) =>
          supabase.from('parceiros').select('id, razao_social').in('id', ch),
        ),
        fetchInChunks<{ id: string; nome_completo: string }>(pMotoristaIds, (ch) =>
          supabase.from('parceiro_motoristas').select('id, nome_completo').in('id', ch),
        ),
        fetchInChunks<{ id: string; placa: string }>(pVeiculoIds, (ch) =>
          supabase.from('parceiro_veiculos').select('id, placa').in('id', ch),
        ),
        fetchInChunks<{ id: string; razao_social: string }>(pSubIds, (ch) =>
          supabase.from('parceiro_subcontratadas').select('id, razao_social').in('id', ch),
        ),
      ])

      const clientes = new Map<string, ClienteRef>()
      for (const c of clientesArr) clientes.set(c.id, { razao_social: c.razao_social })
      const motoristas = new Map<string, MotoristaRef>()
      for (const m of motoristasArr) motoristas.set(m.id, { nome_completo: m.nome_completo })
      const materiais = new Map<string, MaterialRef>()
      for (const m of materiaisArr) materiais.set(m.id, { nome: m.nome })
      const veiculos = new Map<string, VeiculoRef>()
      for (const v of veiculosArr) veiculos.set(v.id, { placa: v.placa })
      const subcontratadas = new Map<string, SubcontratadaRef>()
      for (const s of subsArr) subcontratadas.set(s.id, { razao_social: s.razao_social })
      const atendentes = new Map<string, AtendenteRef>()
      for (const a of atendentesArr) atendentes.set(a.user_id, { nome_completo: a.nome_completo, perfil: a.perfil })
      const parceiros = new Map<string, ParceiroRef>()
      for (const p of parceirosArr) parceiros.set(p.id, { razao_social: p.razao_social })
      const parceiroMotoristas = new Map<string, MotoristaRef>()
      for (const m of pMotoristasArr) parceiroMotoristas.set(m.id, { nome_completo: m.nome_completo })
      const parceiroVeiculos = new Map<string, VeiculoRef>()
      for (const v of pVeiculosArr) parceiroVeiculos.set(v.id, { placa: v.placa })
      const parceiroSubcontratadas = new Map<string, SubcontratadaRef>()
      for (const s of pSubsArr) parceiroSubcontratadas.set(s.id, { razao_social: s.razao_social })

      return {
        rows,
        clientes,
        motoristas,
        materiais,
        veiculos,
        subcontratadas,
        atendentes,
        parceiros,
        parceiroMotoristas,
        parceiroVeiculos,
        parceiroSubcontratadas,
      }
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
/**
 * `habilitado` existe porque a leitura de `log_auditoria` é restrita por RLS a
 * admin/gerente/supervisor (0025). O perfil `analista` enxerga a página de
 * Relatórios mas NÃO essa tabela — e a RLS não devolve erro, devolve zero
 * linhas. Sem a guarda, o TMA aparecia vazio para ele como se não houvesse
 * dados, o que é diferente de "você não tem acesso a isto".
 */
export function useStatusTransitions(
  periodo: PeriodoRelatorio,
  solicitacaoIds: string[],
  habilitado = true,
) {
  return useQuery({
    enabled: habilitado && solicitacaoIds.length > 0,
    queryKey: ['relatorio-transicoes', periodo.desde, periodo.ate, solicitacaoIds.length],
    staleTime: 60_000,
    queryFn: async (): Promise<StatusTransition[]> => {
      // Supabase aceita listas grandes em .in(); fragmentamos em chunks de 200 só por segurança.
      const chunks: string[][] = []
      for (let i = 0; i < solicitacaoIds.length; i += 200) {
        chunks.push(solicitacaoIds.slice(i, i + 200))
      }
      const PAGE = 1000

      const carregarChunk = async (ch: string[]): Promise<StatusTransition[]> => {
        const out: StatusTransition[] = []
        // Mesmo teto de ~1000 linhas do PostgREST: um chunk de 200 solicitações
        // pode ter muito mais de 1000 transições no log. Paginamos cada chunk.
        for (let from = 0; ; from += PAGE) {
          // Só o `status` de cada snapshot, extraído no SERVIDOR (`->>`). Antes
          // vinham `dados_antes` e `dados_depois` inteiros: são cópias
          // `to_jsonb()` da linha completa da solicitação (~1,9 KB por linha de
          // log), e todo esse payload trafegava para o navegador ler UM campo.
          const { data, error } = await supabase
            .from('log_auditoria')
            .select('registro_id, created_at, antes:dados_antes->>status, depois:dados_depois->>status')
            .eq('tabela', 'solicitacoes')
            .eq('acao', 'UPDATE')
            .in('registro_id', ch)
            .order('created_at', { ascending: true })
            .range(from, from + PAGE - 1)
          if (error) throw error
          const batch = (data ?? []) as unknown as Array<{
            registro_id: string
            created_at: string
            antes: string | null
            depois: string | null
          }>
          for (const l of batch) {
            const prev = l.antes ?? null
            const next = l.depois
            if (!next || prev === next) continue
            out.push({
              registro_id: l.registro_id,
              from_status: prev,
              to_status: next,
              at: l.created_at,
            })
          }
          if (batch.length < PAGE) break
        }
        return out
      }

      // Blocos em paralelo: são independentes entre si (cada um filtra por ids
      // distintos) e antes rodavam em série, somando o tempo de ida e volta de
      // dezenas de requisições num período longo.
      const porChunk = await Promise.all(chunks.map(carregarChunk))
      return porChunk.flat()
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

/**
 * Converte a chave de dia "YYYY-MM-DD" para um Date no fuso LOCAL.
 * Use isto (e não `new Date(key)`) para exibir o dia: `new Date('2026-06-20')`
 * é interpretado como UTC meia-noite e, em fusos negativos (Brasil, UTC-3),
 * volta um dia no `format()` — exibindo "19/06" para a barra do dia 20.
 */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
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

/**
 * Conta ocorrências por entidade resolvendo, para cada linha, ou o cadastro
 * INTERNO ou o do PARCEIRO (frota própria). A chave leva prefixo de fonte
 * (`i:` / `p:`) para nunca fundir um id interno com um id de parceiro.
 */
function topPorFonte(
  rows: RelatorioRow[],
  internoId: (r: RelatorioRow) => string | null,
  internoLabel: (id: string) => string | undefined,
  parceiroId: (r: RelatorioRow) => string | null,
  parceiroLabel: (id: string) => string | undefined,
  limit: number,
): TopItem[] {
  const counts = new Map<string, number>()
  const labels = new Map<string, string>()
  for (const r of rows) {
    const iId = internoId(r)
    const pId = iId ? null : parceiroId(r)
    const key = iId ? `i:${iId}` : pId ? `p:${pId}` : null
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (!labels.has(key)) {
      labels.set(key, (iId ? internoLabel(iId) : parceiroLabel(pId!)) ?? '—')
    }
  }
  const arr: TopItem[] = Array.from(counts.entries()).map(([key, total]) => ({
    id: key,
    label: labels.get(key) ?? '—',
    total,
  }))
  arr.sort((a, b) => b.total - a.total)
  return arr.slice(0, limit)
}

export function topMotoristas(ds: RelatorioDataset, limit = 10): TopItem[] {
  return topPorFonte(
    ds.rows,
    (r) => r.motorista_id,
    (id) => ds.motoristas.get(id)?.nome_completo,
    (r) => r.parceiro_motorista_id,
    (id) => ds.parceiroMotoristas.get(id)?.nome_completo,
    limit,
  )
}

export function topVeiculos(ds: RelatorioDataset, limit = 10): TopItem[] {
  return topPorFonte(
    ds.rows,
    (r) => r.veiculo_id,
    (id) => ds.veiculos.get(id)?.placa,
    (r) => r.parceiro_veiculo_id,
    (id) => ds.parceiroVeiculos.get(id)?.placa,
    limit,
  )
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
  return topPorFonte(
    ds.rows,
    (r) => r.subcontratada_id,
    (id) => ds.subcontratadas.get(id)?.razao_social,
    (r) => r.parceiro_subcontratada_id,
    (id) => ds.parceiroSubcontratadas.get(id)?.razao_social,
    limit,
  )
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

// ── Períodos ───────────────────────────────────────────────────────────────
// O Dashboard e os dois Relatórios pedem intervalo livre (De/Até), como a
// Conferência de Viagem. Os presets ('hoje', '7d', 'mes'…) foram removidos com
// as abas que os usavam — preset responde "quanto tempo atrás", e a pergunta da
// operação é "o que aconteceu entre estas duas datas".

/** `yyyy-mm-dd` de uma data local, no formato que o `<input type="date">` usa. */
export function paraInputDate(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/** Intervalo inicial das telas: os últimos N dias terminando hoje. */
export function intervaloPadrao(dias: number): { de: string; ate: string } {
  const hoje = new Date()
  const de = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (dias - 1))
  return { de: paraInputDate(de), ate: paraInputDate(hoje) }
}

/**
 * Converte o par de `<input type="date">` no período do relatório.
 *
 * `PeriodoRelatorio.ate` é EXCLUSIVO — as consultas usam `.lt('created_at', ate)`.
 * Por isso o dia escolhido em "Até" entra somando UM dia: sem isso, pedir "até
 * 27/08" deixaria o dia 27 inteiro de fora, e o relatório mostraria menos do que
 * a pessoa pediu sem dizer por quê.
 *
 * Intervalo invertido vira um único dia em vez de intervalo negativo (que
 * devolveria zero linhas em silêncio). Os inputs já se limitam por `min`/`max`,
 * então isso só cobre valor digitado à mão.
 */
export function periodoDeIntervalo(de: string, ate: string): PeriodoRelatorio {
  const [y1, m1, d1] = de.split('-').map(Number)
  const [y2, m2, d2] = ate.split('-').map(Number)
  const desde = new Date(y1, m1 - 1, d1)
  let fimExclusivo = new Date(y2, m2 - 1, d2 + 1)
  if (fimExclusivo.getTime() <= desde.getTime()) {
    fimExclusivo = new Date(y1, m1 - 1, d1 + 1)
  }
  const ultimoDia = new Date(fimExclusivo.getTime() - 1)
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  const mesmoDia = fmt(desde) === fmt(ultimoDia)
  return {
    desde: desde.toISOString(),
    ate: fimExclusivo.toISOString(),
    // Um dia só não vira "27/08 a 27/08": os cards usam este rótulo como
    // subtítulo, e repetir a data ali é ruído.
    label: mesmoDia ? fmt(desde) : `${fmt(desde)} a ${fmt(ultimoDia)}`,
  }
}

/** Dias corridos do intervalo, para a tela avisar quando ele fica muito longo. */
export function diasDoIntervalo(de: string, ate: string): number {
  const [y1, m1, d1] = de.split('-').map(Number)
  const [y2, m2, d2] = ate.split('-').map(Number)
  if (!y1 || !y2) return 0
  const ini = new Date(y1, m1 - 1, d1).getTime()
  const fim = new Date(y2, m2 - 1, d2).getTime()
  return Math.max(0, Math.round((fim - ini) / 86_400_000) + 1)
}

/** Retorna o mesmo intervalo do período anterior (mesma duração, deslocado pra trás). */
export function previousPeriod(periodo: PeriodoRelatorio): PeriodoRelatorio {
  const desde = new Date(periodo.desde).getTime()
  const ate = new Date(periodo.ate).getTime()
  const dur = ate - desde
  const prevDesde = new Date(desde - dur)
  const prevAte = new Date(desde)
  return { desde: prevDesde.toISOString(), ate: prevAte.toISOString(), label: 'Período anterior' }
}

// ── Segmentação por origem (interno × parceiro) ────────────────────────────

/** `interno` = tudo que NÃO veio do parceiro (origem interna ou e-mail). */
export type OrigemFiltro = 'todas' | 'interno' | 'parceiro'

export function filtrarPorOrigem(rows: RelatorioRow[], filtro: OrigemFiltro): RelatorioRow[] {
  if (filtro === 'todas') return rows
  if (filtro === 'parceiro') return rows.filter((r) => r.origem === 'parceiro')
  return rows.filter((r) => r.origem !== 'parceiro')
}

/** Quantas solicitações cada parceiro enviou no período (e quantas finalizaram). */
export interface ParceiroStat {
  id: string
  label: string
  total: number
  finalizadas: number
}

export function topParceiros(ds: RelatorioDataset, limit = 20): ParceiroStat[] {
  const counts = new Map<string, { total: number; finalizadas: number }>()
  for (const r of ds.rows) {
    if (r.origem !== 'parceiro' || !r.parceiro_id) continue
    const c = counts.get(r.parceiro_id) ?? { total: 0, finalizadas: 0 }
    c.total += 1
    if (r.status === 'finalizada') c.finalizadas += 1
    counts.set(r.parceiro_id, c)
  }
  const arr: ParceiroStat[] = []
  for (const [id, c] of counts.entries()) {
    arr.push({ id, label: ds.parceiros.get(id)?.razao_social ?? '—', total: c.total, finalizadas: c.finalizadas })
  }
  arr.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
  return arr.slice(0, limit)
}

// ── TMA "em emissão → finalizada" (recorte para o relatório de parceiros) ───

export interface TmaResumo {
  avgHours: number | null
  medianHours: number | null
  count: number
}

function buildTransIndex(transitions: StatusTransition[]): Map<string, StatusTransition[]> {
  const byId = new Map<string, StatusTransition[]>()
  for (const t of transitions) {
    const arr = byId.get(t.registro_id)
    if (arr) arr.push(t)
    else byId.set(t.registro_id, [t])
  }
  for (const arr of byId.values()) {
    arr.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  }
  return byId
}

/**
 * Duração (horas) entre a PRIMEIRA entrada em "em emissão" (`em_cadastro`) e a
 * finalização. Só conta solicitações já finalizadas com a transição de emissão
 * registrada; usa o evento de finalização do log e, na falta, `finalizada_em`.
 */
function duracaoEmissaoFinalizacaoH(
  row: RelatorioRow,
  trans: StatusTransition[] | undefined,
): number | null {
  if (row.status !== 'finalizada') return null
  const arr = trans ?? []
  const emissao = arr.find((t) => t.to_status === 'em_cadastro')
  if (!emissao) return null
  const fim = [...arr].reverse().find((t) => t.to_status === 'finalizada')
  const fimMs = fim
    ? new Date(fim.at).getTime()
    : row.finalizada_em
      ? new Date(row.finalizada_em).getTime()
      : null
  if (fimMs == null) return null
  const h = (fimMs - new Date(emissao.at).getTime()) / 3_600_000
  return h > 0 ? h : null
}

function resumoDuracoes(durations: number[]): TmaResumo {
  if (durations.length === 0) return { avgHours: null, medianHours: null, count: 0 }
  const sorted = [...durations].sort((a, b) => a - b)
  const median =
    sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length
  return { avgHours: avg, medianHours: median, count: durations.length }
}

/** TMA emissão→finalização agregado sobre o conjunto de linhas informado. */
export function tmaEmissaoFinalizacao(rows: RelatorioRow[], transitions: StatusTransition[]): TmaResumo {
  const byId = buildTransIndex(transitions)
  const durations: number[] = []
  for (const r of rows) {
    const d = duracaoEmissaoFinalizacaoH(r, byId.get(r.id))
    if (d != null) durations.push(d)
  }
  return resumoDuracoes(durations)
}

export interface ParceiroTma {
  id: string
  label: string
  resumo: TmaResumo
}

/** TMA emissão→finalização por parceiro (ordenado do mais rápido ao mais lento). */
export function tmaEmissaoFinalizacaoPorParceiro(
  ds: RelatorioDataset,
  transitions: StatusTransition[],
  limit = 20,
): ParceiroTma[] {
  const byId = buildTransIndex(transitions)
  const buckets = new Map<string, number[]>()
  for (const r of ds.rows) {
    if (r.origem !== 'parceiro' || !r.parceiro_id) continue
    const d = duracaoEmissaoFinalizacaoH(r, byId.get(r.id))
    if (d == null) continue
    const arr = buckets.get(r.parceiro_id) ?? []
    arr.push(d)
    buckets.set(r.parceiro_id, arr)
  }
  const out: ParceiroTma[] = []
  for (const [id, arr] of buckets.entries()) {
    out.push({ id, label: ds.parceiros.get(id)?.razao_social ?? '—', resumo: resumoDuracoes(arr) })
  }
  out.sort((a, b) => (a.resumo.avgHours ?? Infinity) - (b.resumo.avgHours ?? Infinity))
  return out.slice(0, limit)
}
