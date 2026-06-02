import * as React from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeft, X, AlertCircle, Check, Undo2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { StatusBadge } from '@/components/solicitacoes/StatusBadge'
import { AnexosCard } from '@/features/anexos/AnexosCard'
import { cn } from '@/lib/utils'
import { formatNumeroOC, formatarPamcardParaExibicao } from '@/lib/utils'
import { podeCancelar } from '@/features/solicitacoes/status'
import {
  useSolicitacaoPortal,
  useCancelarSolicitacao,
  useMotoristasBase,
  useVeiculosBase,
  useCarretasBase,
  useSubcontratadasBase,
  useClientesPublicos,
  type PortalSolicitacao,
} from '@/features/solicitacoes/useSolicitacoes'
import { usePendenciaAberta, useResolverPendencia } from '@/features/solicitacoes/usePendencias'
import type { Tables, SolicitacaoStatus } from '@sislog/shared/types'

function fmtDataHora(iso: string | null): string {
  return iso ? format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—'
}

export default function SolicitacaoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const detalhe = useSolicitacaoPortal(id)
  const cancelar = useCancelarSolicitacao()
  const pendencia = usePendenciaAberta(id)
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const motoristas = useMotoristasBase()
  const veiculos = useVeiculosBase()
  const carretas = useCarretasBase()
  const subcontratadas = useSubcontratadasBase()
  const clientes = useClientesPublicos()
  const usuarios = useQuery({
    queryKey: ['parceiro-usuarios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parceiro_usuarios')
        .select('*')
        .order('nome_completo', { ascending: true })
      if (error) throw error
      return (data ?? []) as Tables<'parceiro_usuarios'>[]
    },
  })

  const sol = detalhe.data
  const carregando =
    detalhe.isLoading || motoristas.isLoading || veiculos.isLoading ||
    carretas.isLoading || subcontratadas.isLoading || clientes.isLoading || usuarios.isLoading

  const back = (
    <Link
      to="/solicitacoes"
      className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Voltar para solicitações
    </Link>
  )

  if (carregando) {
    return (
      <div className="mx-auto w-full max-w-[720px]">
        {back}
        <Skeleton className="mb-4 h-9 w-64" />
        <Skeleton className="mb-3 h-[320px] rounded-lg" />
        <Skeleton className="h-[200px] rounded-lg" />
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

  const motorista = motoristas.data?.find((m) => m.id === sol.parceiro_motorista_id) ?? null
  const veiculo = veiculos.data?.find((v) => v.id === sol.parceiro_veiculo_id) ?? null
  const carreta = carretas.data?.find((c) => c.id === sol.parceiro_carreta_id) ?? null
  const primeiraCarreta = carretas.data?.find((c) => c.id === sol.parceiro_primeira_carreta_id) ?? null
  const dolly = carretas.data?.find((c) => c.id === sol.parceiro_dolly_id) ?? null
  const subcontratada =
    subcontratadas.data?.find((s) => s.id === sol.parceiro_subcontratada_id) ?? null
  const cliente = clientes.data?.find((c) => c.id === sol.cliente_id) ?? null
  const solicitante =
    usuarios.data?.find((u) => u.id === sol.parceiro_usuario_id)?.nome_completo ?? '—'

  const placaTipo = (placa: string | undefined, tipo: string | null | undefined) =>
    placa ? (tipo ? `${placa} · ${tipo}` : placa) : '—'

  const pamcard =
    sol.pamcard_status === 'tem_cartao'
      ? `Tem cartão${sol.pamcard_numero ? ` — ${formatarPamcardParaExibicao(sol.pamcard_numero)}` : ''}`
      : 'Não tem cartão (solicitado à LHG)'

  return (
    <div className="mx-auto w-full max-w-[720px]">
      {back}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            Solicitação {sol.numero_interno != null ? formatNumeroOC(sol.numero_interno) : ''}
          </h1>
          <StatusBadge status={sol.status} variant="full" />
        </div>
        {podeCancelar(sol.status) && (
          <Button variant="outline" onClick={() => setConfirmOpen(true)}>
            <X className="h-4 w-4" />
            Cancelar solicitação
          </Button>
        )}
      </div>

      {pendencia.data && (
        <PendenciaBanner
          pendencia={pendencia.data}
        />
      )}

      <section className="mt-4 rounded-lg border bg-background p-5">
        <h2 className="text-[15px] font-semibold text-foreground">Dados da solicitação</h2>
        <dl className="mt-4 grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
          <DataRow label="Solicitante" value={solicitante} />
          <DataRow label="Cliente" value={cliente?.razao_social ?? 'Não identificado'} />
          <DataRow
            label="Motorista"
            value={motorista ? `${motorista.nome_completo} — ${motorista.cpf}` : 'Não identificado'}
          />
          <DataRow label="Cavalo" value={placaTipo(veiculo?.placa, veiculo?.tipo)} />
          <DataRow
            label="1ª Carreta"
            value={primeiraCarreta ? placaTipo(primeiraCarreta.placa, primeiraCarreta.tipo) : 'Sem 1ª carreta'}
          />
          <DataRow
            label="Dolly"
            value={dolly ? placaTipo(dolly.placa, dolly.tipo) : 'Sem dolly'}
          />
          <DataRow
            label="Última Carreta"
            value={carreta ? placaTipo(carreta.placa, carreta.tipo) : 'Sem carreta'}
          />
          <DataRow
            label="Subcontratada"
            value={subcontratada?.razao_social ?? 'Sem subcontratada'}
          />
          <DataRow label="Pamcard" value={pamcard} />
        </dl>
        <div className="mt-4 border-t pt-4">
          <dt className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
            Observações
          </dt>
          <dd className="mt-1 whitespace-pre-wrap text-[13px] text-foreground">
            {sol.observacoes?.trim() || 'Nenhuma observação.'}
          </dd>
        </div>
      </section>

      <section className="mt-3 rounded-lg border bg-background p-5">
        <h2 className="text-[15px] font-semibold text-foreground">Linha do tempo</h2>
        <Timeline sol={sol} solicitante={solicitante} />
      </section>

      <div className="mt-3">
        <AnexosCard
          solicitacaoId={sol.id as string}
          editable={sol.status !== 'finalizada' && sol.status !== 'cancelada'}
        />
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Cancelar solicitação?"
        description="A solicitação será cancelada e a equipe da LHG não vai processá-la. Essa ação não pode ser desfeita pelo portal."
        confirmLabel="Sim, cancelar"
        cancelLabel="Voltar"
        destructive
        onConfirm={async () => {
          await cancelar.mutateAsync(sol.id as string)
          navigate('/solicitacoes')
        }}
      />
    </div>
  )
}

// Banner de pendência: a equipe da LHG devolveu a solicitação pedindo uma ação
// (ex.: documento do veículo). O parceiro lê o motivo e responde ao resolver.
function PendenciaBanner({
  pendencia,
}: {
  pendencia: { id: string; motivo: string; created_at: string }
}) {
  const resolver = useResolverPendencia()
  const [resposta, setResposta] = React.useState('')

  return (
    <section className="mt-4 rounded-lg border border-orange-300 bg-orange-50 p-5 dark:border-orange-900/60 dark:bg-orange-950/40">
      <div className="flex items-start gap-2.5">
        <Undo2 className="mt-0.5 h-5 w-5 shrink-0 text-orange-600 dark:text-orange-400" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-orange-900 dark:text-orange-200">
            Ação necessária
          </h2>
          <p className="mt-0.5 text-[12px] text-orange-800 dark:text-orange-300">
            A equipe da LHG devolveu esta solicitação{' '}
            {format(new Date(pendencia.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}. Resolva
            para a equipe continuar.
          </p>
          <p className="mt-3 whitespace-pre-wrap rounded-md bg-background/70 px-3 py-2 text-[13px] text-foreground">
            {pendencia.motivo}
          </p>

          <div className="mt-3 space-y-2">
            <Textarea
              rows={3}
              value={resposta}
              onChange={(e) => setResposta(e.target.value)}
              placeholder="Descreva como resolveu (opcional). Se precisar enviar um documento, anexe abaixo antes de resolver."
              className="bg-background"
            />
            <div className="flex justify-end">
              <Button
                onClick={async () => {
                  await resolver.mutateAsync({ id: pendencia.id, resposta: resposta.trim() })
                }}
                disabled={resolver.isPending}
                className="bg-orange-600 text-white hover:bg-orange-700"
              >
                {resolver.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Marcar como resolvido
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-[13px] text-foreground">{value}</dd>
    </div>
  )
}

interface TimelineStep {
  label: string
  at: string | null
  done: boolean
}

function buildTimeline(sol: PortalSolicitacao): TimelineStep[] {
  const status = sol.status as SolicitacaoStatus | null
  if (status === 'cancelada') {
    return [
      { label: 'Solicitação enviada', at: sol.created_at, done: true },
      { label: 'Solicitação cancelada', at: null, done: true },
    ]
  }
  const emProcesso = (['em_cadastro', 'instrucao_emitida', 'oc_gerada', 'oc_enviada', 'finalizada'] as const)
    .includes(status as never)
  const ocPronta = (['oc_gerada', 'oc_enviada', 'finalizada'] as const).includes(status as never)
  const concluida = status === 'finalizada'
  return [
    { label: 'Solicitação enviada', at: sol.created_at, done: true },
    { label: 'Em processamento pela LHG', at: null, done: emProcesso },
    { label: 'OC pronta — enviada por WhatsApp/e-mail', at: sol.enviada_em, done: ocPronta },
    { label: 'Concluída', at: sol.finalizada_em, done: concluida },
  ]
}

function Timeline({ sol, solicitante }: { sol: PortalSolicitacao; solicitante: string }) {
  const steps = buildTimeline(sol)
  return (
    <ol className="mt-4 space-y-0">
      {steps.map((step, i) => {
        const last = i === steps.length - 1
        return (
          <li key={step.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                  step.done
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-muted text-muted-foreground',
                )}
              >
                {step.done ? <Check className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </span>
              {!last && (
                <span className={cn('w-px flex-1', step.done ? 'bg-primary/40' : 'bg-border')} />
              )}
            </div>
            <div className={cn('pb-5', last && 'pb-0')}>
              <p
                className={cn(
                  'text-[13px] font-medium',
                  step.done ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </p>
              {i === 0 && (
                <p className="text-[12px] text-muted-foreground">por {solicitante}</p>
              )}
              {step.done && step.at && (
                <p className="text-[12px] text-muted-foreground">{fmtDataHora(step.at)}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
