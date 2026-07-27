import { useQuery } from '@tanstack/react-query'
import { ilikeFilter, ilikePattern } from '@sislog/shared/postgrest'
import { supabase } from '@/lib/supabase'

export type SearchEntityType =
  | 'solicitacao'
  | 'cliente'
  | 'motorista'
  | 'veiculo'
  | 'carreta'
  | 'material'
  | 'subcontratada'

export interface SearchResultItem {
  type: SearchEntityType
  id: string
  label: string
  hint?: string
  href: string
}

const PER_TYPE_LIMIT = 5

// Remove acentos do termo no cliente para casar com as colunas `*_unaccent`
// (geradas via imm_unaccent no banco — migration 0024). Assim "jose" acha
// "josé" e "graos" acha "grãos".
function unaccent(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function useGlobalSearch(query: string, enabled: boolean) {
  const term = query.trim()
  return useQuery({
    enabled: enabled && term.length >= 2,
    queryKey: ['global-search', term],
    staleTime: 30_000,
    queryFn: async (): Promise<SearchResultItem[]> => {
      // Padrões para os métodos dedicados (`.ilike`), que mandam o valor como
      // parâmetro próprio; para as cláusulas `.or(...)` vai `ilikeFilter`, que
      // acrescenta as aspas que o parser do PostgREST exige em termos com
      // vírgula ou parêntese.
      const ilike = ilikePattern(term)
      // Termo sem acento para as colunas `*_unaccent` (migration 0024).
      const termoU = unaccent(term)
      const ilikeU = ilikePattern(termoU)
      const asNumber = Number(term.replace(/\D/g, ''))
      // numero_interno é serial (int4). Um CPF/telefone (dígito-string longo)
      // estoura o range e faz o .eq falhar com 400; só tratamos como número da
      // OC se couber no int4.
      const isNumber = Number.isFinite(asNumber) && asNumber > 0 && asNumber <= 2147483647

      const [solicNum, solicNome, clientes, motoristas, veiculos, carretas, materiais, subs] =
        await Promise.all([
          isNumber
            ? supabase
                .from('solicitacoes')
                .select('id, numero_interno, status, solicitante_nome, cliente:cliente_id(razao_social)')
                .eq('numero_interno', asNumber)
                .limit(1)
            : Promise.resolve({ data: [] as unknown[], error: null }),
          supabase
            .from('solicitacoes')
            .select('id, numero_interno, status, solicitante_nome, cliente:cliente_id(razao_social)')
            .ilike('solicitante_nome_unaccent', ilikeU)
            .order('created_at', { ascending: false })
            .limit(PER_TYPE_LIMIT),
          supabase
            .from('clientes')
            .select('id, razao_social, cidade, uf')
            .ilike('razao_social_unaccent', ilikeU)
            .eq('ativo', true)
            .order('razao_social', { ascending: true })
            .limit(PER_TYPE_LIMIT),
          supabase
            .from('motoristas')
            .select('id, nome_completo, cpf')
            .or(`${ilikeFilter('nome_completo_unaccent', termoU)},${ilikeFilter('cpf', term)}`)
            .eq('ativo', true)
            .order('nome_completo', { ascending: true })
            .limit(PER_TYPE_LIMIT),
          supabase
            .from('veiculos')
            .select('id, placa, tipo')
            .ilike('placa', ilike)
            .eq('ativo', true)
            .order('placa', { ascending: true })
            .limit(PER_TYPE_LIMIT),
          supabase
            .from('carretas')
            .select('id, placa, tipo')
            .ilike('placa', ilike)
            .eq('ativo', true)
            .order('placa', { ascending: true })
            .limit(PER_TYPE_LIMIT),
          supabase
            .from('materiais')
            .select('id, nome, filial')
            .ilike('nome_unaccent', ilikeU)
            .eq('ativo', true)
            .order('nome', { ascending: true })
            .limit(PER_TYPE_LIMIT),
          supabase
            .from('subcontratadas')
            .select('id, razao_social, documento')
            .or(`${ilikeFilter('razao_social_unaccent', termoU)},${ilikeFilter('documento', term)}`)
            .eq('ativo', true)
            .order('razao_social', { ascending: true })
            .limit(PER_TYPE_LIMIT),
        ])

      // Surface qualquer erro do banco como falha da query (react-query marca
      // isError) em vez de silenciosamente devolver categorias vazias.
      const firstError = [
        solicNum, solicNome, clientes, motoristas, veiculos, carretas, materiais, subs,
      ].find((r) => r.error)?.error
      if (firstError) throw firstError

      const out: SearchResultItem[] = []
      const seen = new Set<string>()

      const pushSolic = (rows: unknown[]) => {
        for (const r of rows as Array<{
          id: string
          numero_interno: number
          status: string
          solicitante_nome: string | null
          cliente?: { razao_social: string } | null
        }>) {
          const key = `solicitacao:${r.id}`
          if (seen.has(key)) continue
          seen.add(key)
          const numero = `#${String(r.numero_interno).padStart(4, '0')}`
          const hint = [r.solicitante_nome, r.cliente?.razao_social].filter(Boolean).join(' · ')
          out.push({
            type: 'solicitacao',
            id: r.id,
            label: `${numero}${hint ? `, ${hint}` : ''}`,
            hint: r.status,
            href: `/solicitacoes/${r.id}`,
          })
        }
      }

      pushSolic((solicNum.data ?? []) as unknown[])
      pushSolic((solicNome.data ?? []) as unknown[])

      const sp = new URLSearchParams({ search: term }).toString()

      for (const c of (clientes.data ?? []) as Array<{ id: string; razao_social: string; cidade: string | null; uf: string | null }>) {
        const cidade = [c.cidade, c.uf].filter(Boolean).join('/')
        out.push({
          type: 'cliente',
          id: c.id,
          label: c.razao_social,
          hint: cidade || undefined,
          href: `/cadastros/clientes?${sp}`,
        })
      }
      for (const m of (motoristas.data ?? []) as Array<{ id: string; nome_completo: string; cpf: string | null }>) {
        out.push({
          type: 'motorista',
          id: m.id,
          label: m.nome_completo,
          hint: m.cpf ?? undefined,
          href: `/cadastros/motoristas?${sp}`,
        })
      }
      for (const v of (veiculos.data ?? []) as Array<{ id: string; placa: string; tipo: string | null }>) {
        out.push({
          type: 'veiculo',
          id: v.id,
          label: v.placa,
          hint: v.tipo ?? undefined,
          href: `/cadastros/veiculos?${sp}`,
        })
      }
      for (const c of (carretas.data ?? []) as Array<{ id: string; placa: string; tipo: string | null }>) {
        out.push({
          type: 'carreta',
          id: c.id,
          label: c.placa,
          hint: c.tipo ?? undefined,
          href: `/cadastros/carretas?${sp}`,
        })
      }
      for (const mat of (materiais.data ?? []) as Array<{ id: string; nome: string; filial: string }>) {
        out.push({
          type: 'material',
          id: mat.id,
          label: mat.nome,
          hint: mat.filial,
          href: `/cadastros/materiais?${sp}`,
        })
      }
      for (const s of (subs.data ?? []) as Array<{ id: string; razao_social: string; documento: string | null }>) {
        out.push({
          type: 'subcontratada',
          id: s.id,
          label: s.razao_social,
          hint: s.documento ?? undefined,
          href: `/cadastros/subcontratadas?${sp}`,
        })
      }

      return out
    },
  })
}

export const TYPE_LABELS: Record<SearchEntityType, string> = {
  solicitacao: 'Solicitações',
  cliente: 'Clientes',
  motorista: 'Motoristas',
  veiculo: 'Veículos',
  carreta: 'Carretas',
  material: 'Materiais',
  subcontratada: 'Subcontratadas',
}
