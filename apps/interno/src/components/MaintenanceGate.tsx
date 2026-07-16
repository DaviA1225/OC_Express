import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock } from 'lucide-react'
import { fetchSystemStatus } from '@sislog/shared/supabase'
import { supabase } from '@/lib/supabase'

/**
 * Gate de manutenção do sistema interno.
 *
 * Lê a flag `system_status.maintenance` (tabela de linha única, migration 0045)
 * no boot e a cada 30s, para congelar o acesso durante um deploy sem revelar que
 * é upgrade — a tela é neutra ("temporariamente indisponível"), não uma falsa
 * queda. Sessões já abertas caem no bloqueio no próximo poll.
 *
 * FAIL-OPEN: `fetchSystemStatus` volta `maintenance: false` em caso de erro de
 * rede, então um soluço do Supabase não derruba o app sozinho.
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ['system-status'],
    queryFn: () => fetchSystemStatus(supabase),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: 0,
  })

  // Enquanto a primeira leitura não resolve, um loader neutro (parece boot
  // normal) — evita piscar o app antes de bloquear quando a manutenção está on.
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" />
      </div>
    )
  }

  if (data?.maintenance) {
    return <MaintenanceScreen message={data.message} />
  }

  return <>{children}</>
}

function MaintenanceScreen({ message }: { message: string | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border text-muted-foreground">
          <Clock className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-[22px] font-semibold tracking-tight text-foreground">
          Sistema temporariamente indisponível
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
          {message ??
            'Estamos concluindo um ajuste técnico. O acesso volta em instantes — tente novamente daqui a pouco.'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-7 inline-flex h-9 items-center rounded-md border border-border px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  )
}
