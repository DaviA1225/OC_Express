import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { traduzirErroBanco } from '@/features/crud/useCrudQueries'
import type { Tables, TipoVeiculoSlot } from '@/types/database.types'

export type TerminalJanela = Tables<'terminal_janelas'>

export interface Terminal {
  id: string
  razao_social: string
  terminal_nome: string | null
  antecedencia_minima_horas: number | null
  observacoes_agendamento: string | null
}

/** Clientes que exigem agendamento — alimenta o filtro por terminal da fila. */
export function useTerminais() {
  return useQuery({
    queryKey: ['terminais'],
    staleTime: 300_000,
    queryFn: async (): Promise<Terminal[]> => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, razao_social, terminal_nome, antecedencia_minima_horas, observacoes_agendamento')
        .eq('requer_agendamento', true)
        .eq('ativo', true)
        .order('razao_social', { ascending: true })
      if (error) throw error
      return (data ?? []) as Terminal[]
    },
  })
}

/** Grade de slots de um terminal, na ordem do dia. Inclui slots desativados
 *  para a tela de cadastro poder reativá-los. */
export function useTerminalJanelas(clienteId: string | null | undefined) {
  return useQuery({
    enabled: !!clienteId,
    queryKey: ['terminal-janelas', clienteId],
    queryFn: async (): Promise<TerminalJanela[]> => {
      const { data, error } = await supabase
        .from('terminal_janelas')
        .select('*')
        .eq('cliente_id', clienteId as string)
        .order('hora', { ascending: true })
        .order('tipo_veiculo', { ascending: true })
      if (error) throw error
      return (data ?? []) as TerminalJanela[]
    },
  })
}

/** Grades de vários terminais de uma vez — o cabeçalho de cada grupo da fila
 *  interna mostra a grade ("08:00–16:00 · 4 por hora") sem uma consulta por
 *  card. Só slots ativos. */
export function useGradesAtivas(clienteIds: string[]) {
  const chave = [...clienteIds].sort().join(',')
  return useQuery({
    enabled: clienteIds.length > 0,
    queryKey: ['terminal-janelas', 'ativas', chave],
    queryFn: async (): Promise<Map<string, TerminalJanela[]>> => {
      const { data, error } = await supabase
        .from('terminal_janelas')
        .select('*')
        .in('cliente_id', clienteIds)
        .eq('ativo', true)
        .order('hora', { ascending: true })
        .order('tipo_veiculo', { ascending: true })
      if (error) throw error
      const mapa = new Map<string, TerminalJanela[]>()
      for (const j of (data ?? []) as TerminalJanela[]) {
        const lista = mapa.get(j.cliente_id) ?? []
        lista.push(j)
        mapa.set(j.cliente_id, lista)
      }
      return mapa
    },
  })
}

export interface SlotOcupacao {
  hora: string
  /** 'todos' no terminal de grade única. Onde a grade é separada por tipo
   *  (A.B/CSN), o mesmo horário pode aparecer duas vezes — uma por tipo. */
  tipo_veiculo: TipoVeiculoSlot
  duracao_minutos: number
  capacidade: number | null
  /** Agendamentos da própria LHG naquele slot. NÃO é disponibilidade: outras
   *  transportadoras também ocupam vagas e o SisLog não as enxerga. */
  ocupados: number
}

/** Ocupação da LHG por slot numa data. Via RPC porque a contagem tem que somar
 *  os agendamentos de todos os parceiros para servir de referência, e ninguém
 *  enxerga os agendamentos alheios pelo RLS. */
export function useOcupacaoSlots(clienteId: string | null | undefined, data: string | null) {
  return useQuery({
    enabled: !!clienteId && !!data,
    queryKey: ['agendamentos', 'ocupacao', clienteId, data],
    queryFn: async (): Promise<SlotOcupacao[]> => {
      const { data: rows, error } = await supabase.rpc('agendamentos_ocupacao_slot', {
        p_cliente_id: clienteId as string,
        p_data: data as string,
      } as never)
      if (error) throw error
      return (rows ?? []) as SlotOcupacao[]
    },
  })
}

export function useSalvarJanela() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      cliente_id: string
      hora: string
      tipo_veiculo: TipoVeiculoSlot
      duracao_minutos: number
      capacidade: number | null
      ativo?: boolean
    }) => {
      const { id, ...values } = input
      if (id) {
        const { error } = await supabase.from('terminal_janelas').update(values as never).eq('id', id)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('terminal_janelas').insert(values as never)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['terminal-janelas'] })
      qc.invalidateQueries({ queryKey: ['agendamentos', 'ocupacao'] })
      toast.success(vars.id ? 'Horário atualizado.' : 'Horário adicionado à grade.')
    },
    onError: (e: unknown) => {
      const err = e as { code?: string } | undefined
      if (err?.code === '23505') {
        toast.error('Esse horário já existe na grade deste terminal para esse tipo de veículo.')
        return
      }
      toast.error(traduzirErroBanco(e))
    },
  })
}

export function useRemoverJanela() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('terminal_janelas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['terminal-janelas'] })
      toast.success('Horário removido da grade.')
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

/** Teto de janelas por grade. Existe para um dedo escorregando no campo de
 *  duração (1 minuto das 7 às 18 = 660 linhas) não virar uma grade que ninguém
 *  consegue mais desfazer pela tela. */
export const MAX_SLOTS_GRADE = 96

/** Gera a grade de um terminal a partir da faixa que ele informou.
 *
 *  Substitui os dois presets ('horaria' e 'janela_longa'): cada terminal novo
 *  vinha com números próprios — a MRS foi descrita como "padrão do TCI" e veio
 *  com 30 min e 3 vagas —, então preset fixo só empurrava o problema para uma
 *  migration por terminal.
 *
 *  `ignoreDuplicates` traduz o ON CONFLICT DO NOTHING: gerar de novo por cima de
 *  uma grade existente completa as lacunas em vez de derrubar o que a equipe já
 *  ajustou à mão. O retorno conta só o que foi realmente criado. */
export function useGerarGrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      clienteId: string
      horas: string[]
      tipoVeiculo: TipoVeiculoSlot
      duracaoMinutos: number
      capacidade: number | null
    }) => {
      const linhas = input.horas.map((hora) => ({
        cliente_id: input.clienteId,
        hora,
        tipo_veiculo: input.tipoVeiculo,
        duracao_minutos: input.duracaoMinutos,
        capacidade: input.capacidade,
      }))
      const { data, error } = await supabase
        .from('terminal_janelas')
        // O arbitro do upsert e a UNIQUE da 0069, que inclui o tipo: gerar a
        // grade do graneleiro nao apaga nem colide com a da cacamba.
        .upsert(linhas as never, { onConflict: 'cliente_id,hora,tipo_veiculo', ignoreDuplicates: true })
        .select('id')
      if (error) throw error
      return (data ?? []).length
    },
    onSuccess: (criados) => {
      qc.invalidateQueries({ queryKey: ['terminal-janelas'] })
      qc.invalidateQueries({ queryKey: ['agendamentos', 'ocupacao'] })
      if (criados === 0) {
        toast.info('Nenhum horário novo — a grade já cobria essa faixa.')
      } else {
        toast.success(`${criados} horário(s) criado(s).`)
      }
    },
    onError: (e: unknown) => toast.error(traduzirErroBanco(e)),
  })
}

/** Horas de início de cada janela, em `HH:MM:SS`.
 *
 *  `fim` é o horário de FECHAMENTO, não o início da última janela: das 07:00 às
 *  18:00 com janelas de 30 min, a última começa 17:30 e termina 18:00. Foi a
 *  leitura usada para a MRS, e deixá-la explícita aqui (com a prévia na tela)
 *  evita que cada pessoa interprete de um jeito. */
export function gerarHorarios(inicio: string, fim: string, duracaoMinutos: number): string[] {
  const emMinutos = (hhmm: string): number | null => {
    const [h, m] = hhmm.split(':').map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    return h * 60 + m
  }
  const ini = emMinutos(inicio)
  const f = emMinutos(fim)
  if (ini == null || f == null || duracaoMinutos <= 0 || f <= ini) return []

  const horas: string[] = []
  for (let t = ini; t + duracaoMinutos <= f; t += duracaoMinutos) {
    const h = String(Math.floor(t / 60)).padStart(2, '0')
    const m = String(t % 60).padStart(2, '0')
    horas.push(`${h}:${m}:00`)
    if (horas.length > MAX_SLOTS_GRADE) break
  }
  return horas
}
