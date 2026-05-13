import * as React from 'react'

export type Density = 'compact' | 'comfortable'

const STORAGE_KEY = 'sislog.density'

interface DensityContextValue {
  density: Density
  setDensity: (d: Density) => void
  toggle: () => void
}

const DensityContext = React.createContext<DensityContextValue | undefined>(undefined)

function readInitial(): Density {
  if (typeof window === 'undefined') return 'comfortable'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'compact' ? 'compact' : 'comfortable'
}

export function DensityProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensityState] = React.useState<Density>(readInitial)

  React.useEffect(() => {
    const root = document.body
    root.classList.toggle('density-compact', density === 'compact')
    root.classList.toggle('density-comfortable', density === 'comfortable')
    window.localStorage.setItem(STORAGE_KEY, density)
  }, [density])

  const value = React.useMemo<DensityContextValue>(
    () => ({
      density,
      setDensity: setDensityState,
      toggle: () => setDensityState((d) => (d === 'compact' ? 'comfortable' : 'compact')),
    }),
    [density],
  )

  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
}

export function useDensity(): DensityContextValue {
  const ctx = React.useContext(DensityContext)
  if (!ctx) throw new Error('useDensity precisa ser usado dentro de DensityProvider')
  return ctx
}
