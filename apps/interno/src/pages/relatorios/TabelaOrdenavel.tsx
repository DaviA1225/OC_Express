import * as React from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Coluna<T> {
  chave: string
  rotulo: string
  /** Dica no cabeçalho (definição da métrica). */
  titulo?: string
  alinhar?: 'esquerda' | 'direita'
  /** Valor usado para ordenar (null vai sempre para o fim). */
  valor: (linha: T) => number | string | null
  /** Conteúdo da célula; sem isto, mostra `valor`. */
  render?: (linha: T) => React.ReactNode
  className?: string
}

interface Props<T> {
  colunas: Coluna<T>[]
  linhas: T[]
  chaveLinha: (linha: T) => string
  ordemInicial: { coluna: string; dir: 'asc' | 'desc' }
  /** Linhas extras no rodapé (totais, linha do agente). */
  rodape?: React.ReactNode
  rotulo: string
}

/**
 * Tabela com ordenação por coluna (clique no cabeçalho; `aria-sort`). Rola só
 * dentro do próprio contêiner no celular — a página nunca rola para o lado.
 */
export function TabelaOrdenavel<T>({ colunas, linhas, chaveLinha, ordemInicial, rodape, rotulo }: Props<T>) {
  const [ordem, setOrdem] = React.useState(ordemInicial)
  const col = colunas.find((c) => c.chave === ordem.coluna) ?? colunas[0]
  const ordenadas = React.useMemo(() => {
    const fator = ordem.dir === 'asc' ? 1 : -1
    return [...linhas].sort((a, b) => {
      const va = col.valor(a)
      const vb = col.valor(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * fator
      return String(va).localeCompare(String(vb), 'pt-BR') * fator
    })
  }, [linhas, col, ordem.dir])

  const alternar = (chave: string) => {
    setOrdem((o) =>
      o.coluna === chave
        ? { coluna: chave, dir: o.dir === 'asc' ? 'desc' : 'asc' }
        : { coluna: chave, dir: colunas.find((c) => c.chave === chave)?.alinhar === 'direita' ? 'desc' : 'asc' },
    )
  }

  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-body" aria-label={rotulo}>
        <thead className="bg-muted">
          <tr className="border-b">
            {colunas.map((c) => {
              const ativa = c.chave === ordem.coluna
              const Icone = !ativa ? ArrowUpDown : ordem.dir === 'asc' ? ArrowUp : ArrowDown
              return (
                <th
                  key={c.chave}
                  scope="col"
                  aria-sort={ativa ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={cn('h-9 whitespace-nowrap px-4 text-meta font-medium text-muted-foreground', c.alinhar === 'direita' ? 'text-right' : 'text-left')}
                >
                  <button
                    type="button"
                    onClick={() => alternar(c.chave)}
                    title={c.titulo}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      c.alinhar === 'direita' && 'flex-row-reverse',
                      ativa && 'text-foreground',
                    )}
                  >
                    {c.rotulo}
                    <Icone className={cn('h-3 w-3', !ativa && 'text-tertiary')} aria-hidden />
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((l) => (
            <tr key={chaveLinha(l)} className="border-b transition-colors duration-fast last:border-0 hover:bg-row-hover">
              {colunas.map((c) => (
                <td
                  key={c.chave}
                  className={cn('h-10 px-4 tabular-nums', c.alinhar === 'direita' ? 'text-right' : 'text-left', c.className)}
                >
                  {c.render ? c.render(l) : (c.valor(l) ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {rodape && <tfoot>{rodape}</tfoot>}
      </table>
    </div>
  )
}
