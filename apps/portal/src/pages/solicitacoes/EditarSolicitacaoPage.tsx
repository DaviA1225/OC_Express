import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import {
  SolicitacaoForm,
  type SolicitacaoFormValues,
} from '@/components/solicitacoes/SolicitacaoForm'
import { useAuth } from '@/hooks/useAuth'
import {
  useSolicitacaoPortal,
  useEditarSolicitacao,
} from '@/features/solicitacoes/useSolicitacoes'
import { podeEditar } from '@/features/solicitacoes/status'
import { formatNumeroOC } from '@/lib/utils'
import type { PamcardStatus } from '@sislog/shared/types'

export default function EditarSolicitacaoPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { parceiro } = useAuth()
  const detalhe = useSolicitacaoPortal(id)
  const editar = useEditarSolicitacao()

  const sol = detalhe.data

  const back = (
    <Link
      to={id ? `/solicitacoes/${id}` : '/solicitacoes'}
      className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Voltar para a solicitação
    </Link>
  )

  if (detalhe.isLoading) {
    return (
      <div className="mx-auto w-full max-w-[720px]">
        {back}
        <Skeleton className="mb-4 h-9 w-64" />
        <Skeleton className="h-[420px] rounded-lg" />
      </div>
    )
  }

  if (!sol) {
    return (
      <div className="mx-auto w-full max-w-[720px]">
        {back}
        <div className="rounded-lg border bg-background">
          <EmptyState
            icon={AlertCircle}
            title="Solicitação não encontrada"
            description="Ela pode ter sido removida ou o link está incorreto."
          />
        </div>
      </div>
    )
  }

  // Só dá para editar enquanto 'recebida'. Se a LHG já começou a processar,
  // volta ao detalhe (o botão Editar de lá já fica escondido nesse caso).
  if (!podeEditar(sol.status)) {
    return <Navigate to={`/solicitacoes/${sol.id}`} replace />
  }

  const defaultValues: SolicitacaoFormValues = {
    parceiro_motorista_id: sol.parceiro_motorista_id ?? '',
    parceiro_veiculo_id: sol.parceiro_veiculo_id ?? '',
    parceiro_carreta_id: sol.parceiro_carreta_id ?? '',
    parceiro_primeira_carreta_id: sol.parceiro_primeira_carreta_id ?? '',
    parceiro_dolly_id: sol.parceiro_dolly_id ?? '',
    parceiro_subcontratada_id: sol.parceiro_subcontratada_id ?? '',
    cliente_id: sol.cliente_id ?? '',
    pamcard_status: (sol.pamcard_status as PamcardStatus | null) ?? 'tem_cartao',
    pamcard_numero: sol.pamcard_numero ?? '',
    observacoes: sol.observacoes ?? '',
  }

  const onSubmit = async (v: SolicitacaoFormValues) => {
    try {
      await editar.mutateAsync({
        id: sol.id as string,
        parceiro_motorista_id: v.parceiro_motorista_id,
        parceiro_veiculo_id: v.parceiro_veiculo_id,
        parceiro_carreta_id: v.parceiro_carreta_id || null,
        parceiro_primeira_carreta_id: v.parceiro_primeira_carreta_id || null,
        parceiro_dolly_id: v.parceiro_dolly_id || null,
        parceiro_subcontratada_id: v.parceiro_subcontratada_id || null,
        cliente_id: v.cliente_id,
        pamcard_status: v.pamcard_status,
        pamcard_numero:
          v.pamcard_status === 'tem_cartao' ? (v.pamcard_numero ?? '').trim() : null,
        observacoes: v.observacoes?.trim() || null,
      })
    } catch {
      // o toast de erro é exibido pelo onError da mutation
      return
    }
    navigate(`/solicitacoes/${sol.id}`, { replace: true })
  }

  return (
    <div className="mx-auto w-full max-w-[720px]">
      {back}

      <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
        Editar solicitação {sol.numero_interno != null ? formatNumeroOC(sol.numero_interno) : ''}
      </h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Corrija os dados antes de a equipe da LHG processar. A posição na fila é
        mantida.
      </p>

      <SolicitacaoForm
        defaultValues={defaultValues}
        parceiroId={parceiro?.id ?? null}
        onSubmit={onSubmit}
        submitLabel="Salvar alterações"
        submittingLabel="Salvando…"
        submitting={editar.isPending}
        cancelTo={`/solicitacoes/${sol.id}`}
      />
    </div>
  )
}
