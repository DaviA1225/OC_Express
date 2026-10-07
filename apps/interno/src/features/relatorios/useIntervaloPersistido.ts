import * as React from 'react'
import { useSearchParams } from 'react-router-dom'

export interface Intervalo {
  de: string
  ate: string
}

/**
 * Intervalo De/Até que sobrevive a sair da página e voltar, como os filtros da
 * Conferência de Viagem e da lista de Solicitações. Por aba (`sessionStorage`),
 * não por navegador: fechar a aba recomeça do padrão.
 *
 * A URL continua mandando quando vem preenchida — link compartilhado abre no
 * intervalo do link, não no que a pessoa tinha filtrado antes. Fora isso, o
 * estado vive no React e é espelhado na URL a cada mudança, para o endereço
 * sempre refletir o que está na tela.
 *
 * Há dois pares de datas. `deCampo`/`ateCampo` são o que está digitado nos
 * campos, e podem estar incompletos: enquanto a pessoa digita, o <input
 * type="date"> devolve '' a cada segmento apagado. `de`/`ate` são o último
 * intervalo VÁLIDO, que é o que as páginas usam para montar o período. Antes
 * era um par só, e um '' no meio da digitação virava `new Date(NaN)`: o
 * `toISOString()` lançava RangeError e a página inteira ficava em branco.
 */
export function useIntervaloPersistido(chave: string, padrao: Intervalo) {
  const [params, setParams] = useSearchParams()

  // Semente lida UMA vez, na montagem (initializer preguiçoso do useState, mesmo
  // motivo documentado na Conferência: em useRef o argumento seria reavaliado a
  // cada render). Link com data inválida (`?de=` vazio, `?de=abc`) cai no
  // salvo/padrão em vez de derrubar a página.
  const [valido, setValido] = React.useState<Intervalo>(() => {
    const urlDe = params.get('de')
    const urlAte = params.get('ate')
    if (urlDe && urlAte && intervaloValido(urlDe, urlAte)) return { de: urlDe, ate: urlAte }
    const salvo = carregar(chave)
    if (salvo && intervaloValido(salvo.de, salvo.ate)) return salvo
    return padrao
  })
  const [campos, setCampos] = React.useState<Intervalo>(valido)

  const setIntervalo = React.useCallback(
    (de: string, ate: string) => {
      setCampos({ de, ate })
      // Data incompleta só atualiza o campo. Tela, sessão e URL continuam no
      // último intervalo válido até a digitação terminar.
      if (!intervaloValido(de, ate)) return
      setValido({ de, ate })
      salvar(chave, { de, ate })
      // Escreve SEMPRE os dois parâmetros, inclusive quando iguais ao padrão.
      // Apagá-los deixaria a URL divergindo do que a tela mostra, e o "Limpar"
      // pareceria não funcionar — a leitura cairia de volta no valor salvo.
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('de', de)
          next.set('ate', ate)
          return next
        },
        { replace: true },
      )
    },
    [chave, setParams],
  )

  const limpar = React.useCallback(
    () => setIntervalo(padrao.de, padrao.ate),
    [setIntervalo, padrao.de, padrao.ate],
  )

  return {
    de: valido.de,
    ate: valido.ate,
    deCampo: campos.de,
    ateCampo: campos.ate,
    setIntervalo,
    limpar,
    noPadrao: valido.de === padrao.de && valido.ate === padrao.ate,
  }
}

/**
 * `YYYY-MM-DD` que existe no calendário (rejeita '', 2026-02-31 etc.). O ano
 * tem faixa porque, ao digitar, o campo passa por 0002, 0020, 0202: datas
 * "válidas" que puxariam séculos de dados antes de a pessoa terminar.
 */
function dataValida(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (y < 2020 || y > 2100) return false
  const dt = new Date(y, mo - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
}

export function intervaloValido(de: string, ate: string): boolean {
  return dataValida(de) && dataValida(ate)
}

function chaveCompleta(chave: string): string {
  return `${chave}:intervalo`
}

function carregar(chave: string): Intervalo | null {
  try {
    const raw = sessionStorage.getItem(chaveCompleta(chave))
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<Intervalo>
    if (!v.de || !v.ate) return null
    return { de: v.de, ate: v.ate }
  } catch {
    return null
  }
}

function salvar(chave: string, intervalo: Intervalo): void {
  try {
    sessionStorage.setItem(chaveCompleta(chave), JSON.stringify(intervalo))
  } catch {
    /* storage indisponível (ex.: janela anônima) — o filtro só não persiste */
  }
}
