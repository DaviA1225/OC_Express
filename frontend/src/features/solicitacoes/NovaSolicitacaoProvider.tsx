import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { NovaSolicitacaoDialog } from '@/pages/solicitacoes/NovaSolicitacaoDialog'

interface Ctx {
  open: () => void
}

const NovaSolicitacaoContext = React.createContext<Ctx | null>(null)

export function NovaSolicitacaoProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(false)
  const navigate = useNavigate()

  const open = React.useCallback(() => setIsOpen(true), [])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        setIsOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <NovaSolicitacaoContext.Provider value={{ open }}>
      {children}
      <NovaSolicitacaoDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        onCreated={(id) => navigate(`/solicitacoes/${id}`)}
      />
    </NovaSolicitacaoContext.Provider>
  )
}

export function useNovaSolicitacao(): Ctx {
  const ctx = React.useContext(NovaSolicitacaoContext)
  if (!ctx) throw new Error('useNovaSolicitacao deve ser usado dentro de <NovaSolicitacaoProvider>')
  return ctx
}
