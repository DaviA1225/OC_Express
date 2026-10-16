// Datas no fuso da operação (America/Campo_Grande), independentes do relógio do
// navegador. Use para "hoje" de filtros e drill-downs: as RPCs cortam o dia
// em Mato Grosso do Sul, e uma estação com fuso errado não pode deslocar o recorte.

const FUSO = 'America/Campo_Grande'

// en-CA formata como yyyy-mm-dd.
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })

/** `yyyy-mm-dd` do instante `d` em Mato Grosso do Sul. */
export function diaOperacao(d: Date | number = new Date()): string {
  return fmtDia.format(new Date(d))
}

/** `yyyy-mm-dd` de hoje em Mato Grosso do Sul (ou do instante `agora`). */
export function hojeOperacao(agora: Date = new Date()): string {
  return diaOperacao(agora)
}

/**
 * Início (00:00) do dia `yyyy-mm-dd` em MS, como ISO em UTC — limite dos
 * filtros De/Até da lista. MS é UTC−4 fixo (sem horário de verão desde 2019).
 * Retorna null se a data for inválida (ex.: 2026-02-30).
 */
export function inicioDoDiaOperacao(dia: string, somarDias = 0): string | null {
  const [y, m, d] = dia.split('-').map(Number)
  if (!y || !m || !d || m > 12) return null
  const base = new Date(Date.UTC(y, m - 1, d))
  if (base.getUTCMonth() !== m - 1 || base.getUTCDate() !== d) return null
  // 00:00 em MS = 04:00 UTC; Date.UTC normaliza a virada de mês/ano.
  return new Date(Date.UTC(y, m - 1, d + somarDias, 4, 0, 0, 0)).toISOString()
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
 * O "relógio de parede" de Mato Grosso do Sul no instante `d`, devolvido como Date
 * LOCAL com esses mesmos campos (ano, mês, dia, hora, minuto). Serve para
 * rotular baldes/horas do servidor certo numa estação em outro fuso (ex.:
 * Recife, −3): `getDate()`/`getHours()` do resultado são os de MS.
 */
export function relogioOperacao(d: Date | number | string): Date {
  const p = Object.fromEntries(fmtPartes.formatToParts(new Date(d)).map((x) => [x.type, x.value]))
  return new Date(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute))
}
