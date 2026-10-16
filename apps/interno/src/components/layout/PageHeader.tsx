import * as React from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Breadcrumb {
  label: string
  /** Sem `to`, o item é texto (a página atual ou um nível sem rota). */
  to?: string
}

interface PageHeaderProps {
  title: React.ReactNode
  /** Uma linha de contexto abaixo do título — não repetir o óbvio. */
  description?: React.ReactNode
  breadcrumb?: Breadcrumb[]
  /** Ações da página (botão primário por último, à direita). */
  actions?: React.ReactNode
  /** Conteúdo ao lado do título (contagem, selo "Somente leitura"). */
  meta?: React.ReactNode
  className?: string
}

/**
 * Cabeçalho único de página: h1 em Kanit 500 22px, breadcrumb opcional,
 * descrição e slot de ações. Substitui os h1 soltos (22/18/15px) das telas.
 */
export function PageHeader({ title, description, breadcrumb, actions, meta, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Trilha" className="mb-1">
            <ol className="flex flex-wrap items-center gap-1 text-body-sm text-muted-foreground">
              {breadcrumb.map((b, i) => (
                <li key={`${b.label}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-tertiary" aria-hidden />}
                  {b.to ? (
                    <Link
                      to={b.to}
                      className="rounded-sm transition-colors duration-fast hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {b.label}
                    </Link>
                  ) : (
                    <span aria-current={i === breadcrumb.length - 1 ? 'page' : undefined}>{b.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-display text-page font-medium text-foreground">{title}</h1>
          {meta}
        </div>
        {description && <p className="mt-1 max-w-[75ch] text-body text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
