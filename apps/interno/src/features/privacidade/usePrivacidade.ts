// Tela /privacidade — o lado operável do COMPLIANCE.md (pendências 6 e 7).
//
// Três fontes que até aqui só se consultavam pelo SQL Editor:
//   • log_acesso (0059/0061) — quem tirou dado pessoal do sistema, e como;
//   • storage_remocao_pendente (0060) — arquivos cujo anexo foi apagado mas
//     que podem ter ficado no bucket;
//   • exportar_dados_titular / anonimizar_titular (0057) — pedidos do art. 18.
//
// As permissões reais estão no banco (RLS das tabelas, checagem de perfil
// dentro das funções). O front só esconde o que o usuário não poderia usar.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { registrarAcesso } from '@/lib/acesso'
import { maskCpf } from '@/lib/utils'
import type { Json, Tables } from '@/types/database.types'

// ── Registro de acesso ──────────────────────────────────────────────────────

export const ACOES_ACESSO = [
  'export_csv',
  'download_oc_pdf',
  'abrir_anexo',
  'abrir_documento_agendamento',
  'copiar_cpf',
] as const

export type AcaoAcessoLog = (typeof ACOES_ACESSO)[number]

export const ACAO_ACESSO_LABELS: Record<AcaoAcessoLog, string> = {
  export_csv: 'Exportação',
  download_oc_pdf: 'PDF da OC',
  abrir_anexo: 'Anexo',
  abrir_documento_agendamento: 'Documento de agendamento',
  copiar_cpf: 'CPF copiado',
}

export interface LogAcessoFilters {
  acoes: AcaoAcessoLog[]
  desde: string | null
  page: number
  pageSize: number
}

export type LogAcessoRow = Tables<'log_acesso'> & { usuario_nome: string | null }

/**
 * Resolve o nome de quem acessou. O `usuario_id` pode ser da equipe
 * (perfis_usuarios) ou de um parceiro (parceiro_usuarios) — `origem` diz qual,
 * mas consultar as duas é mais simples e cobre linha antiga sem origem certa.
 */
async function nomesDosUsuarios(ids: string[]): Promise<Map<string, string>> {
  const nomes = new Map<string, string>()
  if (ids.length === 0) return nomes
  const [internos, parceiros] = await Promise.all([
    supabase.from('perfis_usuarios').select('user_id, nome_completo').in('user_id', ids),
    supabase.from('parceiro_usuarios').select('user_id, nome_completo').in('user_id', ids),
  ])
  for (const p of (parceiros.data ?? []) as { user_id: string; nome_completo: string }[]) {
    nomes.set(p.user_id, `${p.nome_completo} (parceiro)`)
  }
  for (const p of (internos.data ?? []) as { user_id: string; nome_completo: string }[]) {
    nomes.set(p.user_id, p.nome_completo)
  }
  return nomes
}

export function useLogAcesso(filters: LogAcessoFilters) {
  return useQuery({
    queryKey: ['privacidade', 'log-acesso', filters],
    queryFn: async () => {
      let q = supabase.from('log_acesso').select('*', { count: 'exact' })
      if (filters.acoes.length > 0) q = q.in('acao', filters.acoes)
      if (filters.desde) q = q.gte('created_at', filters.desde)
      const from = (filters.page - 1) * filters.pageSize
      q = q.order('created_at', { ascending: false }).range(from, from + filters.pageSize - 1)

      const { data, error, count } = await q
      if (error) throw error
      const rows = (data ?? []) as Tables<'log_acesso'>[]
      const ids = Array.from(new Set(rows.map((r) => r.usuario_id).filter(Boolean) as string[]))
      const nomes = await nomesDosUsuarios(ids)
      return {
        data: rows.map((r) => ({
          ...r,
          usuario_nome: r.usuario_id ? nomes.get(r.usuario_id) ?? null : null,
        })) as LogAcessoRow[],
        count: count ?? 0,
      }
    },
  })
}

// ── Arquivos órfãos ─────────────────────────────────────────────────────────

export type OrfaoRow = Tables<'storage_remocao_pendente'>

export function useOrfaosStorage() {
  return useQuery({
    queryKey: ['privacidade', 'orfaos'],
    queryFn: async (): Promise<OrfaoRow[]> => {
      // A fila só cresce quando um anexo é apagado e a remoção do arquivo
      // falha — são poucas linhas. 1000 é o teto do PostgREST; passar disso
      // já seria um problema a investigar, não a paginar.
      const { data, error } = await supabase
        .from('storage_remocao_pendente')
        .select('*')
        .is('removido_em', null)
        .order('created_at', { ascending: true })
        .range(0, 999)
      if (error) throw error
      return (data ?? []) as OrfaoRow[]
    },
  })
}

/**
 * Tenta de novo o que o app não conseguiu na hora da exclusão: apaga o arquivo
 * do bucket e dá baixa na fila. Se o storage recusar, grava o motivo e a linha
 * continua aberta — mesma regra do `useDeleteAnexo`.
 *
 * Arquivo que já não existe no bucket conta como removido: o `remove()` do
 * storage não acusa erro nesse caso, e o objetivo (o dado não estar mais lá)
 * está cumprido.
 */
export function useRemoverOrfaos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orfaos: OrfaoRow[]) => {
      let removidos = 0
      const falhas: string[] = []
      for (const o of orfaos) {
        const { error: rmErr } = await supabase.storage.from(o.bucket).remove([o.path])
        const baixa = { p_path: o.path, p_erro: rmErr?.message ?? null } as never
        const { error } = await supabase.rpc('marcar_storage_removido', baixa)
        if (rmErr || error) falhas.push(o.path)
        else removidos++
      }
      return { removidos, falhas }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['privacidade', 'orfaos'] })
    },
  })
}

// ── Pedidos do titular ──────────────────────────────────────────────────────

/** Mensagem legível para os RAISE EXCEPTION da 0057. */
export function traduzirErroTitular(e: unknown): string {
  const msg = (e as { message?: string } | null)?.message ?? ''
  if (msg.includes('forbidden')) return 'Seu perfil não pode atender este pedido.'
  if (msg.includes('cpf invalido')) return 'Informe os 11 dígitos do CPF.'
  const andamento = msg.match(/titular tem (\d+) solicita/)
  if (andamento) {
    const n = Number(andamento[1])
    return n === 1
      ? 'Este titular tem 1 solicitação em andamento. Finalize ou cancele antes de anonimizar.'
      : `Este titular tem ${n} solicitações em andamento. Finalize ou cancele antes de anonimizar.`
  }
  return 'Não foi possível concluir. Tente novamente.'
}

export interface ExportacaoTitular {
  encontrado: boolean
  cadastros: number
  solicitacoes: number
  anexos: number
  dados: Json
}

export async function exportarDadosTitular(cpf: string): Promise<ExportacaoTitular> {
  const { data, error } = await supabase.rpc('exportar_dados_titular', { p_cpf: cpf } as never)
  if (error) throw error
  const d = (data ?? {}) as Record<string, unknown>
  const len = (k: string) => (Array.isArray(d[k]) ? (d[k] as unknown[]).length : 0)

  // O JSON sai do sistema na mão de quem pediu: é acesso a dado pessoal, igual
  // a um CSV. O CPF vai mascarado — o log não pode virar mais uma cópia dele.
  registrarAcesso('export_csv', 'titular', {
    cpf: maskCpf(cpf),
    encontrado: d.encontrado === true,
  })

  return {
    encontrado: d.encontrado === true,
    cadastros: len('cadastro_frota_interna') + len('cadastro_frota_parceiro'),
    solicitacoes: len('solicitacoes'),
    anexos: len('anexos'),
    dados: data as Json,
  }
}

export interface SimulacaoAnonimizacao {
  encontrado: boolean
  cadastrosInterna: number
  cadastrosParceiro: number
  solicitacoesPreservadas: number
  linhasAuditoria: number
}

export async function simularAnonimizacao(cpf: string): Promise<SimulacaoAnonimizacao> {
  const { data, error } = await supabase.rpc(
    'anonimizar_titular',
    { p_cpf: cpf, p_confirmar: false } as never,
  )
  if (error) throw error
  const d = (data ?? {}) as Record<string, unknown>
  const n = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : 0)
  return {
    encontrado: d.encontrado === true,
    cadastrosInterna: n('cadastros_frota_interna'),
    cadastrosParceiro: n('cadastros_frota_parceiro'),
    solicitacoesPreservadas: n('solicitacoes_preservadas'),
    linhasAuditoria: n('linhas_de_auditoria_a_limpar'),
  }
}

export async function confirmarAnonimizacao(cpf: string): Promise<{ linhasAuditoria: number }> {
  const { data, error } = await supabase.rpc(
    'anonimizar_titular',
    { p_cpf: cpf, p_confirmar: true } as never,
  )
  if (error) throw error
  const d = (data ?? {}) as Record<string, unknown>
  return {
    linhasAuditoria: typeof d.linhas_de_auditoria_limpas === 'number' ? d.linhas_de_auditoria_limpas : 0,
  }
}

/** Baixa o JSON do titular. Nome sem CPF: o arquivo pode ficar numa pasta de downloads. */
export function baixarJsonTitular(dados: Json): void {
  const ts = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${ts.getFullYear()}${p(ts.getMonth() + 1)}${p(ts.getDate())}_${p(ts.getHours())}${p(ts.getMinutes())}`
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `titular_${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
