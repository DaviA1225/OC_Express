import { cn } from '@/lib/utils'
import { statusInfo } from '@/features/solicitacoes/status'
import type { SolicitacaoStatus } from '@sislog/shared/types'

interface StatusBadgeProps {
  status: SolicitacaoStatus | null
  /** `full` usa o rótulo completo; `short` usa o texto curto do badge. */
  variant?: 'full' | 'short'
  className?: string
}

export function StatusBadge({ status, variant = 'short', className }: StatusBadgeProps) {
  const info = statusInfo(status)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium',
        info.className,
        className,
      )}
    >
      {variant === 'full' ? info.label : info.badge}
    </span>
  )
}
