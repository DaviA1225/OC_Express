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
 */
export function useIntervaloPersistido(chave: string, padrao: Intervalo) {
  const [params, setParams] = useSearchParams()

  // Semente lida UMA vez, na montagem (initializer preguiçoso do useState, mesmo
  // motivo documentado na Conferência: em useRef o argumento seria reavaliado a
  // cada render).
  const [intervalo, setEstado] = React.useState<Intervalo>(() => {
    const urlDe = params.get('de')
    const urlAte = params.get('ate')
    if (urlDe && urlAte) return { de: urlDe, ate: urlAte }
    const salvo = carregar(chave)
    return { de: salvo?.de || padrao.de, ate: salvo?.ate || padrao.ate }
  })

  const setIntervalo = React.useCallback(
    (de: string, ate: string) => {
      setEstado({ de, ate })
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
    de: intervalo.de,
    ate: intervalo.ate,
    setIntervalo,
    limpar,
    noPadrao: intervalo.de === padrao.de && intervalo.ate === padrao.ate,
  }
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
