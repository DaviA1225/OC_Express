import { ClipboardList } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'

// Placeholder da tela de Solicitações. A lista, a tela "Nova solicitação" e o
// detalhe vêm na Fase 8.4 (Bloco 5).
export default function SolicitacoesPlaceholder() {
  return (
    <div className="mx-auto max-w-3xl rounded-lg border bg-background py-4">
      <EmptyState
        icon={ClipboardList}
        title="Minhas solicitações"
        description="A criação e o acompanhamento de solicitações de carregamento chegam na próxima entrega do portal (Fase 8.4)."
      />
    </div>
  )
}
