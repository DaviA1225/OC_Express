import * as React from 'react'

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="mb-3 h-12 w-12 text-muted-foreground/60" strokeWidth={1.4} />
      <p className="text-[14px] font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-[12px] text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
