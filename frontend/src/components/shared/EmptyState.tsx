import * as React from 'react'

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  title: string
  description?: string
  action?: React.ReactNode
  size?: 'sm' | 'md'
}

export function EmptyState({ icon: Icon, title, description, action, size = 'md' }: EmptyStateProps) {
  const isCompact = size === 'sm'
  return (
    <div className={isCompact ? 'flex flex-col items-center justify-center py-8 text-center' : 'flex flex-col items-center justify-center py-16 text-center'}>
      <div
        aria-hidden
        className={
          isCompact
            ? 'mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/5 ring-1 ring-primary/15'
            : 'mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/5 ring-1 ring-primary/15'
        }
      >
        <Icon
          className={isCompact ? 'h-6 w-6 text-primary/60' : 'h-9 w-9 text-primary/60'}
          strokeWidth={1.5}
        />
      </div>
      <p className={isCompact ? 'text-[14px] font-semibold text-foreground' : 'text-[15px] font-semibold tracking-tight text-foreground'}>
        {title}
      </p>
      {description && (
        <p className={isCompact ? 'mt-1 max-w-xs text-[12px] leading-relaxed text-muted-foreground' : 'mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground'}>
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
