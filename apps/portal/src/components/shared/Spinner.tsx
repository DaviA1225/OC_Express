import { cn } from '@/lib/utils'

interface SpinnerProps {
  /** 16px (padrão, dentro de botão/linha) ou 20px (bloco). */
  size?: 'sm' | 'md'
  /** Texto para leitor de tela; omita quando o rótulo visível já diz "Salvando…". */
  label?: string
  className?: string
}

/**
 * Indicador de carregamento único do sistema — substitui o ícone giratório do
 * lucide. Anel fino na cor do texto atual (herda de botão, linha
 * etc.), sem acento: carregar não é ação.
 */
export function Spinner({ size = 'sm', label, className }: SpinnerProps) {
  const px = size === 'md' ? 20 : 16
  return (
    <svg
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      width={px}
      height={px}
      viewBox="0 0 16 16"
      fill="none"
      className={cn('shrink-0 animate-spin', className)}
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.75" />
      <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}
