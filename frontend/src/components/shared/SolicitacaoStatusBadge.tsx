import { cn } from '@/lib/utils'
import { STATUS_CLASSES, STATUS_LABELS } from '@/features/solicitacoes/status'
import type { SolicitacaoStatus } from '@/types/database.types'

interface Props {
  status: SolicitacaoStatus
  className?: string
}

export function SolicitacaoStatusBadge({ status, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        STATUS_CLASSES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
