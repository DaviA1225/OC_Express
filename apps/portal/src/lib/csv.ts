export interface CsvColumn<T> {
  header: string
  accessor: (row: T) => string | number | boolean | null | undefined
}

const DELIM = ';'

function escape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'boolean' ? (value ? 'Sim' : 'Não') : String(value)
  // Excel pt-BR usa ; como separador. Aspas internas são escapadas duplicando.
  if (/["\r\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Constrói uma string CSV (com BOM UTF-8 e CRLF) compatível com Excel pt-BR. */
export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines: string[] = []
  lines.push(columns.map((c) => escape(c.header)).join(DELIM))
  for (const row of rows) {
    lines.push(columns.map((c) => escape(c.accessor(row))).join(DELIM))
  }
  return '﻿' + lines.join('\r\n')
}

/** Dispara o download de um arquivo CSV no navegador. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
