import * as React from 'react'
import { Link } from 'react-router-dom'
import { DRILL_ATIVO, MSG_DRILL_INATIVO } from '@/features/metricas/links'

interface Props {
  to: string
  className?: string
  children: React.ReactNode
  'aria-label'?: string
  tabIndex?: number
}

// Sem o link, o elemento não pode parecer clicável: saem hover, transição e foco.
function semInteracao(className?: string): string | undefined {
  return className
    ?.split(/\s+/)
    .filter((c) => !/^(hover:|group-hover:|focus-visible:|transition|duration-|ease-)/.test(c))
    .join(' ')
}

/**
 * Link de drill-down para a lista de Solicitações. Com os dados simulados
 * (DRILL_ATIVO falso) vira texto, com a explicação no `title`.
 */
export function LinkDrill({ to, className, children, ...rest }: Props) {
  if (DRILL_ATIVO) {
    return (
      <Link to={to} className={className} {...rest}>
        {children}
      </Link>
    )
  }
  return (
    <span className={semInteracao(className)} title={MSG_DRILL_INATIVO}>
      {children}
    </span>
  )
}
