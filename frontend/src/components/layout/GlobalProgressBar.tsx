import { useIsMutating, useIsFetching } from '@tanstack/react-query'

/**
 * Barra fina no topo da app que aparece sempre que houver
 * uma mutation em andamento (ou um fetch inicial). Inspirada no nprogress
 * mas sem estado local — reage ao react-query.
 */
export function GlobalProgressBar() {
  const mutating = useIsMutating()
  const fetching = useIsFetching()
  const active = mutating > 0 || fetching > 0

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5"
      aria-hidden={!active}
    >
      <div
        className={
          active
            ? 'h-full w-1/3 origin-left animate-progress bg-primary shadow-[0_0_8px_var(--color-primary,_#3b82f6)]'
            : 'h-full w-0 bg-transparent'
        }
      />
    </div>
  )
}
