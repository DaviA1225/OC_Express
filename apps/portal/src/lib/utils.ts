import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Os formatadores de apresentação (formatCpf, formatTelefone, etc.) vivem em
// @sislog/shared/formatters — importe de lá nas telas do portal.
export * from '@sislog/shared/formatters'
