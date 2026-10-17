import * as React from 'react'

/**
 * Relógio local: devolve `Date.now()` e re-renderiza a cada `intervaloMs`.
 * Entre buscas, os minutos na etapa e o "dado de há Xs" avançam por aqui.
 */
export function useAgora(intervaloMs = 1000): number {
  const [agora, setAgora] = React.useState(() => Date.now())
  React.useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), intervaloMs)
    return () => window.clearInterval(t)
  }, [intervaloMs])
  return agora
}
