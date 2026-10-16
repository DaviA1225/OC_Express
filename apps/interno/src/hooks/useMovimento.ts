import * as React from 'react'

// Movimento do SisLog — arquivo IDÊNTICO em apps/interno e apps/portal.
// Regras (DESIGN.md + decisão do Davi, 2026-10-16): só transform/opacity, nada
// de loop decorativo, nada atrasa a interação, e SEM guarda de "reduzir
// movimento" (o Windows do dono tem a opção ligada e as animações devem aparecer).
// Keyframes de CSS (entrada-login, cascata, etapa-*) ficam no index.css.

/** Saída rápida e assentamento suave — a mesma curva do `--ease-firme` do CSS. */
export const EASE_FIRME = 'cubic-bezier(0.16, 1, 0.3, 1)'

/**
 * Fade + subida de 4px no conteúdo principal quando `chave` muda (pathname).
 * Usa a Web Animations API no próprio elemento: não remonta a página (nenhum
 * estado se perde) e não roda em re-render/refetch — só na troca de rota.
 */
export function useEntradaDeRota<T extends HTMLElement>(chave: string) {
  const ref = React.useRef<T>(null)
  React.useLayoutEffect(() => {
    ref.current?.animate(
      [
        { opacity: 0, transform: 'translateY(4px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 200, easing: EASE_FIRME },
    )
  }, [chave])
  return ref
}

/**
 * Cascata da PRIMEIRA renderização de uma lista de cards. Devolve `true` só na
 * janela inicial depois que os dados chegam; o contêiner recebe a classe
 * `cascata` enquanto for `true` (o atraso por índice está no index.css, teto de
 * 300ms). Depois a classe sai e refetch, polling, filtro ou realtime não
 * re-animam nada.
 */
export function useCascataInicial(pronto: boolean): boolean {
  const [encerrada, setEncerrada] = React.useState(false)
  React.useEffect(() => {
    if (!pronto || encerrada) return
    // 300ms de atraso máximo + 200ms de animação + folga.
    const t = window.setTimeout(() => setEncerrada(true), 600)
    return () => window.clearTimeout(t)
  }, [pronto, encerrada])
  return pronto && !encerrada
}

/** Shake horizontal curto (erro de credencial). Re-disparável a cada chamada. */
export function tremer(el: HTMLElement | null) {
  el?.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-6px)' },
      { transform: 'translateX(6px)' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(3px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 300, easing: 'ease-in-out' },
  )
}

/**
 * Conta de `de` (0 na montagem; depois, o valor anterior) até `alvo` em
 * `duracao` ms com requestAnimationFrame. Só anima quando `alvo` muda de fato —
 * refetch com o mesmo número não mexe na tela.
 */
export function useContagem(alvo: number, duracao = 600): number {
  const [atual, setAtual] = React.useState(0)
  const atualRef = React.useRef(0)
  React.useEffect(() => {
    const de = atualRef.current
    if (de === alvo) return
    const t0 = performance.now()
    let raf = 0
    const passo = (agora: number) => {
      const p = Math.max(0, Math.min(1, (agora - t0) / duracao))
      const v = p >= 1 ? alvo : de + (alvo - de) * (1 - Math.pow(1 - p, 3))
      atualRef.current = v
      setAtual(v)
      if (p < 1) raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [alvo, duracao])
  return atual
}
