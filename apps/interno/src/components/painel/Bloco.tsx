import * as React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface BlocoProps {
  titulo: string
  subtitulo?: React.ReactNode
  acao?: React.ReactNode
  className?: string
  /** Estado da consulta que alimenta o bloco: esqueleto e erro com retry por bloco (§3.1). */
  carregando?: boolean
  erro?: boolean
  onRetry?: () => void
  alturaEsqueleto?: number
  children: React.ReactNode
}

/** Seção do Painel/Relatórios: superfície plana, hairline, título 14px. */
export function Bloco({ titulo, subtitulo, acao, className, carregando, erro, onRetry, alturaEsqueleto = 200, children }: BlocoProps) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-lg border bg-card', className)}>
      <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-body-lg font-medium text-foreground">{titulo}</h2>
          {subtitulo && <p className="text-meta text-muted-foreground">{subtitulo}</p>}
        </div>
        {acao}
      </header>
      <div className="min-w-0 flex-1 p-4">
        {carregando ? (
          <Skeleton className="w-full" style={{ height: alturaEsqueleto }} />
        ) : erro ? (
          <BlocoErro onRetry={onRetry} altura={alturaEsqueleto} />
        ) : (
          children
        )}
      </div>
    </section>
  )
}

export function BlocoErro({ onRetry, altura = 160 }: { onRetry?: () => void; altura?: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-center" style={{ minHeight: altura }}>
      <AlertTriangle className="h-5 w-5 text-danger" aria-hidden />
      <p className="text-body font-medium text-foreground">Não foi possível carregar</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 text-body-sm font-medium text-primary-strong hover:underline"
        >
          <RefreshCw className="h-3 w-3" aria-hidden /> Tentar novamente
        </button>
      )}
    </div>
  )
}

export function Vazio({ children, altura = 120 }: { children: React.ReactNode; altura?: number }) {
  return (
    <div className="flex items-center justify-center px-4 text-center text-body text-muted-foreground" style={{ minHeight: altura }}>
      {children}
    </div>
  )
}
