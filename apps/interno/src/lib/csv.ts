import { registrarAcesso } from '@/lib/acesso'

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

/**
 * Dispara o download de um arquivo CSV no navegador.
 *
 * Registra o acesso (LGPD art. 37) daqui, e não em cada tela: esta é a saída
 * única de TODA exportação do app (motoristas, subcontratadas, solicitações,
 * conferência, relatórios, auditoria). Instrumentar aqui significa que uma
 * tela de exportação nova já nasce auditada, sem ninguém precisar lembrar.
 *
 * O nome do recurso sai do prefixo do arquivo — os chamadores já seguem o
 * padrão `<recurso>_<AAAAMMDD>_<HHMM>.csv`. A contagem de linhas sai do próprio
 * conteúdo (menos o cabeçalho). Nenhum dado pessoal vai para o log: só o nome
 * do recurso e quantas linhas saíram.
 */
export function downloadCsv(filename: string, content: string): void {
  const recurso = filename.replace(/\.csv$/i, '').replace(/_\d{8}_\d{4}$/, '')
  const linhas = Math.max(0, content.split('\r\n').length - 1)
  registrarAcesso('export_csv', recurso, { linhas, arquivo: filename })

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
