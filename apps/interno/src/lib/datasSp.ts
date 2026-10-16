// Datas no fuso da operação (America/Sao_Paulo), independentes do relógio do
// navegador. Use para "hoje" de filtros e drill-downs: as RPCs cortam o dia
// em São Paulo, e uma estação com fuso errado não pode deslocar o recorte.

const FUSO = 'America/Sao_Paulo'

// en-CA formata como yyyy-mm-dd.
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })

/** `yyyy-mm-dd` do instante `d` em São Paulo. */
export function diaSP(d: Date | number = new Date()): string {
  return fmtDia.format(new Date(d))
}

/** `yyyy-mm-dd` de hoje em São Paulo. */
export function hojeSP(): string {
  return diaSP(new Date())
}

/** Soma `n` dias a uma data `yyyy-mm-dd` (aritmética de calendário, sem fuso). */
export function somarDiasIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

const fmtPartes = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/**
 * O "relógio de parede" de São Paulo no instante `d`, devolvido como Date
 * LOCAL com esses mesmos campos (ano, mês, dia, hora, minuto). Serve para
 * rotular baldes/horas do servidor certo numa estação em outro fuso (ex.:
 * Cuiabá, −4): `getDate()`/`getHours()` do resultado são os de SP.
 */
export function relogioSP(d: Date | number | string): Date {
  const p = Object.fromEntries(fmtPartes.formatToParts(new Date(d)).map((x) => [x.type, x.value]))
  return new Date(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute))
}
