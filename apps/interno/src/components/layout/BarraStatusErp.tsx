import * as React from 'react'
import { SISLOG_VERSAO } from '@sislog/shared/versao'
import { useAuth } from '@/hooks/useAuth'
import { useNovaSolicitacao } from '@/features/solicitacoes/NovaSolicitacaoProvider'
import type { RealtimeStatus } from '@/features/realtime/useRealtimeSubscriptions'

const PERFIL_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  supervisor: 'Supervisor',
  analista: 'Analista',
  assistente: 'Assistente',
}

// Mesma regra do selo de ambiente da tela de login.
const AMBIENTE =
  (import.meta.env.VITE_ENV_LABEL as string | undefined) ??
  (import.meta.env.PROD ? 'Produção' : 'Desenvolvimento')

const CONEXAO: Record<RealtimeStatus, string> = {
  live: 'Ao vivo',
  connecting: 'Conectando…',
  error: 'Sem conexão em tempo real',
}

/**
 * Barra de status do modo ERP (fase 1): quem está logado, em que ambiente, a
 * conexão e os atalhos — o que um ERP mostra no rodapé o tempo todo.
 */
export function BarraStatusErp({ realtimeStatus }: { realtimeStatus: RealtimeStatus }) {
  const { profile } = useAuth()
  return (
    <footer className="flex min-h-[28px] shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-t bg-background px-4 py-1 text-[12px] text-muted-foreground print:hidden">
      <span>
        {profile?.nome_completo ?? 'Usuário'} · {PERFIL_LABELS[profile?.perfil ?? ''] ?? '—'}
      </span>
      <span>Ambiente: {AMBIENTE}</span>
      <span>{CONEXAO[realtimeStatus]}</span>
      <span className="hidden md:inline">
        <Atalho tecla="F2" /> nova solicitação · <Atalho tecla="F3" /> buscar na tela ·{' '}
        <Atalho tecla="Ctrl K" /> buscar em tudo
      </span>
      <span className="ml-auto tabular-nums">SisLog v{SISLOG_VERSAO} · modo ERP (beta)</span>
    </footer>
  )
}

function Atalho({ tecla }: { tecla: string }) {
  return (
    <kbd className="rounded-sm border bg-muted px-1 py-px font-sans text-[11px] text-foreground">{tecla}</kbd>
  )
}

/**
 * Atalhos de função do modo ERP. Fica dentro do NovaSolicitacaoProvider para
 * abrir o diálogo; o Ctrl+K e o "/" continuam no AppLayout, valendo para
 * todos os layouts.
 */
export function AtalhosErp() {
  const { open } = useNovaSolicitacao()

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'F2') {
        e.preventDefault()
        open()
        return
      }
      if (e.key === 'F3') {
        // F3 é "localizar" do navegador; aqui ele foca o filtro da tela, que
        // é o que a pessoa quer quando está numa lista.
        const busca = document.querySelector<HTMLInputElement>(
          '[data-page-search] input, input[data-page-search]',
        )
        if (busca) {
          e.preventDefault()
          busca.focus()
          busca.select()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  return null
}
