import { cn } from '@/lib/utils'
import { STATUS_CLASSES, STATUS_LABELS } from '@/features/solicitacoes/status'
import type { SolicitacaoStatus } from '@/types/database.types'

interface Props {
  status: SolicitacaoStatus
  className?: string
}

/**
 * Badge de status (Carbon tag): retângulo raio 2px + ponto 8px + rótulo.
 * Cada etapa tem matiz próprio (tokens --st-*); "Em emissão" usa ponto VAZADO
 * (etapa em andamento na mão da equipe).
 */
export function SolicitacaoStatusBadge({ status, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[2px] px-1.5 py-0.5 text-meta font-medium transition-colors duration-200',
        STATUS_CLASSES[status],
        className,
      )}
    >
      <StatusDot status={status} />
      {STATUS_LABELS[status]}
    </span>
  )
}

export function StatusDot({ status, className }: Props) {
  const vazado = status === 'em_cadastro'
  const cor = `var(--st-${status}-dot)`
  return (
    <span
      aria-hidden
      className={cn('h-2 w-2 shrink-0 rounded-full transition-colors duration-200', vazado && 'border-2 bg-transparent', className)}
      style={vazado ? { borderColor: cor } : { backgroundColor: cor }}
    />
  )
}
