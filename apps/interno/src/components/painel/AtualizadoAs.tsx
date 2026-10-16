import { RefreshCw } from 'lucide-react'
import { Spinner } from '@/components/shared/Spinner'
import { fmtHoraMin } from '@/features/metricas/rotulos'
import { cn } from '@/lib/utils'

interface Props {
  /** `dataUpdatedAt` da consulta (0 = ainda sem dado). */
  atualizadoEm: number
  atualizando: boolean
  erro: boolean
  onAtualizar: () => void
}

/** P15 — "Atualizado às 14:37 · ao vivo" + botão de atualizar. */
export function AtualizadoAs({ atualizadoEm, atualizando, erro, onAtualizar }: Props) {
  return (
    <div className="flex items-center gap-2 text-body-sm text-muted-foreground" aria-live="polite">
      {atualizadoEm > 0 && <span className="tabular-nums">Atualizado às {fmtHoraMin(atualizadoEm)}</span>}
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={cn('h-1.5 w-1.5 rounded-full', erro ? 'bg-danger' : 'bg-success')}
        />
        {erro ? 'sem conexão' : 'ao vivo'}
      </span>
      <button
        type="button"
        onClick={onAtualizar}
        disabled={atualizando}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-tertiary"
        aria-label="Atualizar agora"
        title="Atualizar agora"
      >
        {atualizando ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
      </button>
    </div>
  )
}
