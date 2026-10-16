import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// A escala tipográfica do tailwind.config (text-meta, text-body…) e as durações
// próprias precisam ser declaradas aqui; sem isso o twMerge toma `text-body`
// por COR e o descarta ao lado de `text-foreground`.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['2xs', 'meta', 'body-sm', 'body', 'body-lg', 'title-sm', 'title', 'page', 'kpi'] }],
      duration: [{ duration: ['fast'] }],
      rounded: [{ rounded: ['control', 'surface'] }],
      shadow: [{ shadow: ['overlay'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Os formatadores de apresentação (formatCpf, formatTelefone, etc.) vivem em
// @sislog/shared/formatters — importe de lá nas telas do portal.
export * from '@sislog/shared/formatters'
