import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import type { FiltrosComuns, OrigemFiltro } from './tipos'

const ORIGENS: OrigemFiltro[] = ['todas', 'interno', 'parceiro']

export const FILTROS_PADRAO: FiltrosComuns = { origem: 'todas', clienteId: null, local: null }

/**
 * Filtros de análise na URL (§4): `o` (todas|interno|parceiro), `cliente`
 * (uuid) e `local` (texto exato). Painel, TV e Relatórios usam o mesmo hook,
 * então um link copiado abre no mesmo recorte. Sem nada na URL, volta ao
 * último recorte da aba (`sessionStorage`, por tela). O período (`de`/`ate`)
 * fica com `useIntervaloPersistido`, que já faz o mesmo para as datas.
 */
export function useFiltrosAnalise(chave: string) {
  const [params, setParams] = useSearchParams()
  const [filtros, setFiltros] = React.useState<FiltrosComuns>(() => {
    const daUrl = lerUrl(params)
    if (daUrl) return daUrl
    return carregar(chave) ?? FILTROS_PADRAO
  })

  const atualizar = React.useCallback(
    (parcial: Partial<FiltrosComuns>) => {
      const novo = { ...filtros, ...parcial }
      setFiltros(novo)
      salvar(chave, novo)
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (novo.origem === 'todas') next.delete('o')
          else next.set('o', novo.origem)
          if (novo.clienteId) next.set('cliente', novo.clienteId)
          else next.delete('cliente')
          if (novo.local) next.set('local', novo.local)
          else next.delete('local')
          return next
        },
        { replace: true },
      )
    },
    [chave, filtros, setParams],
  )

  const ativos = (filtros.origem !== 'todas' ? 1 : 0) + (filtros.clienteId ? 1 : 0) + (filtros.local ? 1 : 0)

  return {
    filtros,
    setOrigem: (origem: OrigemFiltro) => atualizar({ origem }),
    setCliente: (clienteId: string | null) => atualizar({ clienteId }),
    setLocal: (local: string | null) => atualizar({ local }),
    limpar: () => atualizar(FILTROS_PADRAO),
    /** Quantos filtros fogem do padrão (rótulo "Filtros (n)"). */
    ativos,
  }
}

function lerUrl(params: URLSearchParams): FiltrosComuns | null {
  const o = params.get('o')
  const cliente = params.get('cliente')
  const local = params.get('local')
  if (!o && !cliente && !local) return null
  return {
    origem: (ORIGENS as string[]).includes(o ?? '') ? (o as OrigemFiltro) : 'todas',
    clienteId: cliente || null,
    local: local || null,
  }
}

function carregar(chave: string): FiltrosComuns | null {
  try {
    const raw = sessionStorage.getItem(`${chave}:filtros`)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<FiltrosComuns>
    return {
      origem: (ORIGENS as string[]).includes(v.origem ?? '') ? (v.origem as OrigemFiltro) : 'todas',
      clienteId: v.clienteId ?? null,
      local: v.local ?? null,
    }
  } catch {
    return null
  }
}

function salvar(chave: string, f: FiltrosComuns): void {
  try {
    sessionStorage.setItem(`${chave}:filtros`, JSON.stringify(f))
  } catch {
    /* storage indisponível — o filtro só não persiste */
  }
}
