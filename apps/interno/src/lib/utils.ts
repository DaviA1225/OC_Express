import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Os formatadores de apresentação (formatCpf, formatTelefone, formatNumeroOC,
// formatarPamcardParaExibicao, etc.) agora vivem em @sislog/shared, junto com
// os validadores e os tipos do banco. São re-exportados aqui para os imports
// `@/lib/utils` já existentes continuarem funcionando sem alteração.
export * from '@sislog/shared/formatters'
