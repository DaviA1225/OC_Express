import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSystemStatus } from '@sislog/shared/supabase'
import { supabase } from '@/lib/supabase'

/**
 * Gate de manutenção do Portal de Parceiros.
 *
 * Lê a flag `system_status.maintenance` (tabela de linha única, migration 0045)
 * no boot e a cada 30s, para congelar o acesso durante um deploy sem revelar que
 * é upgrade — a tela é neutra ("temporariamente indisponível"), não uma falsa
 * queda. Sessões já abertas caem no bloqueio no próximo poll.
 *
 * FAIL-OPEN: `fetchSystemStatus` volta `maintenance: false` em caso de erro de
 * rede, então um soluço do Supabase não derruba o portal sozinho.
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  // Em desenvolvimento (dev server Vite) o gate é ignorado: a equipe precisa
  // trabalhar mesmo com a manutenção ligada em produção. No build de produção
  // `import.meta.env.DEV` é false, então o bloqueio continua valendo normalmente.
  const isDev = import.meta.env.DEV

  const { data, isLoading } = useQuery({
    queryKey: ['system-status'],
    queryFn: () => fetchSystemStatus(supabase),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: 0,
    enabled: !isDev,
  })

  if (isDev) {
    return <>{children}</>
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" />
      </div>
    )
  }

  if (data?.maintenance) {
    return <MaintenanceScreen />
  }

  return <>{children}</>
}

function MaintenanceScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md text-center">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          Sistema indisponível
        </h1>
      </div>
    </div>
  )
}
