// Formatação numérica de apresentação em pt-BR (Intl). Substitui `toFixed`,
// `toLocaleString()` sem locale e concatenações como "2.5h" — o sistema mostra
// "2,5", "93,4%" e "3 h 40 min".

const VAZIO = '—'

const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

function ok(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/** Inteiro com separador de milhar: 1234 → "1.234". */
export function fmtInt(n: number | null | undefined): string {
  return ok(n) ? inteiro.format(n) : VAZIO
}

/**
 * Decimal com casas fixas: fmtDec(2.5) → "2,5"; fmtDec(2, 2) → "2,00".
 * Use `minimo` menor que `casas` para cortar zeros à direita.
 */
export function fmtDec(n: number | null | undefined, casas = 1, minimo = casas): string {
  if (!ok(n)) return VAZIO
  return n.toLocaleString('pt-BR', { minimumFractionDigits: minimo, maximumFractionDigits: casas })
}

/**
 * Percentual. Por padrão recebe a FRAÇÃO (0.934 → "93,4%"); passe
 * `{ escala: 100 }` quando o valor já vier em pontos percentuais (93.4).
 */
export function fmtPct(
  n: number | null | undefined,
  { casas = 1, escala = 1 }: { casas?: number; escala?: 1 | 100 } = {},
): string {
  if (!ok(n)) return VAZIO
  const fracao = escala === 100 ? n / 100 : n
  return fracao.toLocaleString('pt-BR', {
    style: 'percent',
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

/**
 * Duração legível a partir de MINUTOS: 220 → "3 h 40 min"; 45 → "45 min";
 * 1500 → "1 d 1 h". Valores negativos ou inválidos viram "—".
 */
export function fmtDur(minutos: number | null | undefined): string {
  if (!ok(minutos) || minutos < 0) return VAZIO
  const total = Math.round(minutos)
  if (total < 60) return `${total} min`
  const d = Math.floor(total / 1440)
  const h = Math.floor((total % 1440) / 60)
  const m = total % 60
  if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`
  return m > 0 ? `${h} h ${m} min` : `${h} h`
}

/** Atalho para durações que chegam em HORAS (ex.: médias de TMA). */
export function fmtDurHoras(horas: number | null | undefined): string {
  return ok(horas) ? fmtDur(horas * 60) : VAZIO
}

/** Variação com sinal explícito: 0.12 → "+12,0%"; fmtDelta(-3, 'int') → "−3". */
export function fmtDelta(n: number | null | undefined, tipo: 'pct' | 'int' = 'pct'): string {
  if (!ok(n)) return VAZIO
  const sinal = n > 0 ? '+' : n < 0 ? '−' : ''
  const abs = Math.abs(n)
  return sinal + (tipo === 'pct' ? fmtPct(abs) : fmtInt(abs))
}
