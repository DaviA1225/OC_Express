import * as React from 'react'

/**
 * Diz se um cabeçalho `sticky` já grudou no topo, para só então ganhar borda e
 * sombra. Observa uma sentinela de altura zero logo acima dele: quando ela
 * sai da área visível (o <main> rola e a recorta), o cabeçalho está fixo.
 * Ref por callback porque a sentinela só monta depois que os dados carregam.
 */
export function useCabecalhoFixo(): [(el: HTMLDivElement | null) => void, boolean] {
  const [sentinela, setSentinela] = React.useState<HTMLDivElement | null>(null)
  const [fixo, setFixo] = React.useState(false)
  React.useEffect(() => {
    if (!sentinela) return
    const obs = new IntersectionObserver(([e]) => setFixo(!e.isIntersecting))
    obs.observe(sentinela)
    return () => obs.disconnect()
  }, [sentinela])
  return [setSentinela, fixo]
}
