import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { SolicitacaoStatus, SolicitacaoTipo } from '@/types/database.types'

const HISTORICO_DIAS = 30

export interface HistoricoRecent {
  id: string
  numero_interno: number
  status: SolicitacaoStatus
  tipo: SolicitacaoTipo
  created_at: string
  cliente: { razao_social: string } | null
  veiculo: { placa: string } | null
}

export interface HistoricoSummary {
  totalMotorista: number
  totalVeiculo: number
  totalParaCliente: number
  ultimaParaCliente: {
    numero_interno: number
    id: string
    created_at: string
    status: SolicitacaoStatus
  } | null
  topRota: { cliente: string; count: number } | null
  recentes: HistoricoRecent[]
}

/** Ids que a própria solicitação já aponta — entram sempre, então o histórico
 *  nunca fica menor do que era quando casava só por `motorista_id`. */
export interface IdsProprios {
  motoristaId: string | null
  parceiroMotoristaId: string | null
  veiculoId: string | null
  parceiroVeiculoId: string | null
}

interface Params {
  /** CPF do motorista (cadastro interno OU do parceiro — o mesmo motorista
   *  pode estar nos dois, com ids diferentes). */
  motoristaCpf: string | null
  /** Placa do cavalo, idem. */
  veiculoPlaca: string | null
  idsProprios: IdsProprios
  clienteId: string | null
  currentId: string
}

/** CPF como pode estar gravado: o valor exato e, só se tiver 11 dígitos,
 *  também formatado e só dígitos (um id anonimizado "ANON-…" não vira CPF). */
function variantesCpf(cpf: string): string[] {
  const exato = cpf.trim()
  const digitos = exato.replace(/\D/g, '')
  if (digitos.length !== 11 || !/^[\d.\-\s]+$/.test(exato)) return [exato]
  const formatado = `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`
  return Array.from(new Set([exato, digitos, formatado]))
}

/** Placa com e sem hífen, em maiúsculas. */
function variantesPlaca(placa: string): string[] {
  const limpa = placa.trim().toUpperCase().replace(/\s/g, '')
  const sem = limpa.replace(/-/g, '')
  const com = /^[A-Z]{3}\d[A-Z\d]\d{2}$/.test(sem) ? `${sem.slice(0, 3)}-${sem.slice(3)}` : sem
  return Array.from(new Set([placa.trim(), limpa, sem, com]))
}

const uniq = (...listas: (string | null)[][]) => Array.from(new Set(listas.flat().filter((x): x is string => !!x)))

/**
 * Ids do motorista e do cavalo nos dois cadastros (interno e parceiros). Sem
 * isso, solicitação vinda do portal (que só tem parceiro_motorista_id) ficava
 * sem histórico, e o histórico do interno ignorava o que veio pelo portal.
 * `.in()` do postgrest-js codifica os valores (nada de filtro montado à mão
 * com texto digitado pelo parceiro).
 */
async function resolverIds(motoristaCpf: string, veiculoPlaca: string | null) {
  const cpfs = variantesCpf(motoristaCpf)
  const placas = veiculoPlaca ? variantesPlaca(veiculoPlaca) : []
  const vazio = Promise.resolve({ data: [] as { id: string }[], error: null })
  const [mot, parcMot, veic, parcVeic] = await Promise.all([
    supabase.from('motoristas').select('id').in('cpf', cpfs).limit(20),
    supabase.from('parceiro_motoristas').select('id').in('cpf', cpfs).limit(50),
    placas.length ? supabase.from('veiculos').select('id').in('placa', placas).limit(20) : vazio,
    placas.length ? supabase.from('parceiro_veiculos').select('id').in('placa', placas).limit(50) : vazio,
  ])
  for (const r of [mot, parcMot, veic, parcVeic]) if (r.error) throw r.error
  const ids = (r: { data: unknown }) => ((r.data ?? []) as { id: string }[]).map((x) => x.id)
  return { motoristaIds: ids(mot), parceiroMotoristaIds: ids(parcMot), veiculoIds: ids(veic), parceiroVeiculoIds: ids(parcVeic) }
}

/** Filtro `or` do PostgREST: qualquer um dos ids (UUIDs), em qualquer dos dois campos. */
function orIds(campo: string, idsInternos: string[], campoParceiro: string, idsParceiro: string[]): string | null {
  const partes: string[] = []
  if (idsInternos.length) partes.push(`${campo}.in.(${idsInternos.join(',')})`)
  if (idsParceiro.length) partes.push(`${campoParceiro}.in.(${idsParceiro.join(',')})`)
  return partes.length ? partes.join(',') : null
}

/**
 * Histórico operacional dos últimos 30 dias do motorista/veículo da solicitação,
 * usado pra ajudar o atendente a reconhecer "essa rota o cara já fez".
 */
export function useHistoricoOperacional({
  motoristaCpf,
  veiculoPlaca,
  idsProprios,
  clienteId,
  currentId,
}: Params) {
  // Ids por CPF/placa em cache próprio: percorrendo a fila com "Próxima", o
  // mesmo motorista não refaz as 4 buscas a cada solicitação.
  const resolvidos = useQuery({
    enabled: !!motoristaCpf,
    queryKey: ['historico-ids', motoristaCpf, veiculoPlaca],
    staleTime: 10 * 60_000,
    queryFn: () => resolverIds(motoristaCpf!, veiculoPlaca),
  })
  const ids = resolvidos.data
  const enabled = !!motoristaCpf && !!ids
  return useQuery({
    enabled,
    queryKey: ['historico-operacional', motoristaCpf, veiculoPlaca, clienteId, currentId, ids],
    staleTime: 60_000,
    queryFn: async (): Promise<HistoricoSummary> => {
      const desde = new Date(Date.now() - HISTORICO_DIAS * 24 * 3_600_000).toISOString()
      const filtroMotorista = orIds(
        'motorista_id',
        uniq(ids!.motoristaIds, [idsProprios.motoristaId]),
        'parceiro_motorista_id',
        uniq(ids!.parceiroMotoristaIds, [idsProprios.parceiroMotoristaId]),
      )
      const filtroVeiculo = orIds(
        'veiculo_id',
        uniq(ids!.veiculoIds, [idsProprios.veiculoId]),
        'parceiro_veiculo_id',
        uniq(ids!.parceiroVeiculoIds, [idsProprios.parceiroVeiculoId]),
      )
      if (!filtroMotorista) {
        return { totalMotorista: 0, totalVeiculo: 0, totalParaCliente: 0, ultimaParaCliente: null, topRota: null, recentes: [] }
      }

      const recentesPromise = supabase
        .from('solicitacoes')
        .select(
          'id, numero_interno, status, tipo, cliente_id, created_at, cliente:cliente_id(razao_social), veiculo:veiculo_id(placa), parceiro_veiculo:parceiro_veiculo_id(placa)',
        )
        .or(filtroMotorista)
        .neq('id', currentId)
        .gte('created_at', desde)
        .order('created_at', { ascending: false })
        .limit(20)

      const veiculoCountPromise = filtroVeiculo
        ? supabase
            .from('solicitacoes')
            .select('id', { count: 'exact', head: true })
            .or(filtroVeiculo)
            .neq('id', currentId)
            .gte('created_at', desde)
        : Promise.resolve({ count: 0, error: null })

      type UltimaRow = {
        id: string
        numero_interno: number
        status: string
        created_at: string
      }
      const ultimaClientePromise: Promise<{
        data: UltimaRow | null
        error: { message: string } | null
      }> = clienteId
        ? (supabase
            .from('solicitacoes')
            .select('id, numero_interno, status, created_at')
            .or(filtroMotorista)
            .eq('cliente_id', clienteId)
            .neq('id', currentId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle() as unknown as Promise<{
            data: UltimaRow | null
            error: { message: string } | null
          }>)
        : Promise.resolve({ data: null, error: null })

      const [recentesRes, veicRes, ultimaRes] = await Promise.all([
        recentesPromise,
        veiculoCountPromise,
        ultimaClientePromise,
      ])

      if (recentesRes.error) throw recentesRes.error
      if (veicRes.error) throw veicRes.error
      if (ultimaRes.error) throw ultimaRes.error

      const recentes = ((recentesRes.data ?? []) as unknown as Array<
        HistoricoRecent & { cliente_id: string | null; parceiro_veiculo: { placa: string } | null }
      >).map((r) => ({ ...r, veiculo: r.veiculo ?? r.parceiro_veiculo }))

      // Top rota do motorista nos últimos 30d (cliente mais frequente)
      const counts = new Map<string, { label: string; count: number }>()
      let totalParaCliente = 0
      for (const r of recentes) {
        if (r.cliente_id && clienteId && r.cliente_id === clienteId) totalParaCliente += 1
        const label = r.cliente?.razao_social
        if (!label) continue
        const cur = counts.get(label) ?? { label, count: 0 }
        cur.count += 1
        counts.set(label, cur)
      }
      let topRota: HistoricoSummary['topRota'] = null
      for (const v of counts.values()) {
        if (!topRota || v.count > topRota.count) topRota = { cliente: v.label, count: v.count }
      }

      return {
        totalMotorista: recentes.length,
        totalVeiculo: veicRes.count ?? 0,
        totalParaCliente,
        ultimaParaCliente: ultimaRes.data
          ? {
              id: ultimaRes.data.id,
              numero_interno: ultimaRes.data.numero_interno,
              status: ultimaRes.data.status as SolicitacaoStatus,
              created_at: ultimaRes.data.created_at,
            }
          : null,
        topRota,
        recentes: recentes.slice(0, 5).map((r) => ({
          id: r.id,
          numero_interno: r.numero_interno,
          status: r.status,
          tipo: r.tipo,
          created_at: r.created_at,
          cliente: r.cliente,
          veiculo: r.veiculo,
        })),
      }
    },
  })
}

export const HISTORICO_JANELA_DIAS = HISTORICO_DIAS
