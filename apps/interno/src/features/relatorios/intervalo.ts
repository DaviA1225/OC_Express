// Intervalo De/Até das telas de análise (Relatórios e Produtividade). As datas
// são `yyyy-mm-dd`, como o `<input type="date">` usa, e chegam inteiras às
// RPCs (`p_de`, `p_ate`, inclusivas, cortadas no fuso de São Paulo no servidor).

/** `yyyy-mm-dd` de uma data local. */
export function paraInputDate(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/** Intervalo inicial das telas: os últimos N dias terminando hoje. */
export function intervaloPadrao(dias: number): { de: string; ate: string } {
  const hoje = new Date()
  const de = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (dias - 1))
  return { de: paraInputDate(de), ate: paraInputDate(hoje) }
}

/** Dias corridos do intervalo, para a tela avisar quando ele fica muito longo. */
export function diasDoIntervalo(de: string, ate: string): number {
  const [y1, m1, d1] = de.split('-').map(Number)
  const [y2, m2, d2] = ate.split('-').map(Number)
  if (!y1 || !y2) return 0
  const ini = new Date(y1, m1 - 1, d1).getTime()
  const fim = new Date(y2, m2 - 1, d2).getTime()
  return Math.max(0, Math.round((fim - ini) / 86_400_000) + 1)
}

/** "27/08/2026" ou "01/08/2026 a 27/08/2026" (um dia só não repete a data). */
export function rotuloIntervalo(de: string, ate: string): string {
  const fmt = (s: string) => s.split('-').reverse().join('/')
  return de === ate ? fmt(de) : `${fmt(de)} a ${fmt(ate)}`
}

/** Carimbo `AAAAMMDD_HHMM` do nome dos CSVs (o registro de acesso da LGPD lê esse padrão). */
export function carimboArquivo(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}
