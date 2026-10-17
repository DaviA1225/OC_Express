import * as React from 'react'

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  title: string
  description?: string
  action?: React.ReactNode
  size?: 'sm' | 'md'
}

/**
 * Estado vazio sóbrio: ícone 24px solto em texto 3 (sem círculo/caixa), título
 * e uma linha do que fazer. Texto no guia de voz: "Nenhuma solicitação
 * registrada.", não "Que tal criar a primeira?".
 */
export function EmptyState({ icon: Icon, title, description, action, size = 'md' }: EmptyStateProps) {
  const compacto = size === 'sm'
  return (
    <div className={compacto ? 'flex flex-col items-center justify-center py-8 text-center' : 'flex flex-col items-center justify-center py-12 text-center'}>
      <Icon aria-hidden className="mb-3 h-6 w-6 text-tertiary" strokeWidth={1.75} />
      <p className={compacto ? 'text-body font-medium text-foreground' : 'text-body-lg font-medium text-foreground'}>{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-body-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
