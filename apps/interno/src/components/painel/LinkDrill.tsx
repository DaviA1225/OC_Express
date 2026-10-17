import * as React from 'react'
import { Link } from 'react-router-dom'

interface Props {
  to: string
  className?: string
  children: React.ReactNode
  'aria-label'?: string
  tabIndex?: number
}

/**
 * Link de drill-down para a lista de Solicitações: o número do Painel/Relatórios
 * abre a lista com o mesmo recorte (recorteLista.ts).
 */
export function LinkDrill({ to, className, children, ...rest }: Props) {
  return (
    <Link to={to} className={className} {...rest}>
      {children}
    </Link>
  )
}
