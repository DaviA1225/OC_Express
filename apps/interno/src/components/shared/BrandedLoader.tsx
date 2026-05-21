/**
 * Loader visual com identidade LHG — usado em transições autenticadas
 * (após o splash inicial do index.html já ter terminado).
 */
export function BrandedLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando"
      className="flex min-h-full flex-col items-center justify-center gap-4 bg-background"
    >
      <img src="/favicon.svg" alt="" aria-hidden className="h-12 w-12" />
      <div className="flex items-center gap-1.5" aria-hidden>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
      </div>
    </div>
  )
}
