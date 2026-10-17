import { cn } from '@/lib/utils'
import { statusInfo } from '@/features/solicitacoes/status'
import type { SolicitacaoStatus } from '@sislog/shared/types'

interface StatusBadgeProps {
  status: SolicitacaoStatus | null
  /** `full` usa o rótulo completo; `short` usa o texto curto do badge. */
  variant?: 'full' | 'short'
  className?: string
}

/** Badge retangular (raio 2px) + ponto 8px + rótulo — mesmo desenho do interno. */
export function StatusBadge({ status, variant = 'short', className }: StatusBadgeProps) {
  const info = statusInfo(status)
  return (
    <span
      className={cn(
        'status-badge inline-flex items-center gap-1.5 whitespace-nowrap rounded-[2px] px-1.5 py-0.5 text-meta font-medium transition-colors duration-200',
        info.className,
        className,
      )}
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full transition-colors duration-200" style={{ backgroundColor: 'var(--pst-dot)' }} />
      {variant === 'full' ? info.label : info.badge}
    </span>
  )
}
