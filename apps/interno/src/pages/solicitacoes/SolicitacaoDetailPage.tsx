import * as React from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Copy, CreditCard, Loader2, Mail, MessageCircle, Pencil, RotateCcw, Undo2, X } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Combobox, type ComboboxOption } from '@/components/shared/Combobox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { SolicitacaoStatusBadge } from '@/components/shared/SolicitacaoStatusBadge'
import {
  useSolicitacao,
  useUpdateSolicitacao,
  useTransitStatus,
  useDuplicateSolicitacao,
} from '@/features/solicitacoes/useSolicitacoes'
import { canCancel, isEditable } from '@/features/solicitacoes/status'
import { useAuth } from '@/hooks/useAuth'
import { canEditSolicitacoes } from '@/features/auth/permissions'
import { useCrudOptions } from '@/features/crud/useCrudOptions'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { AnexosCard } from '@/features/anexos/AnexosCard'
import { HistoricoCard } from '@/features/solicitacoes/HistoricoCard'
import { usePendencias, useDevolverParceiro, useMarcarPendenciaVista, type Pendencia } from '@/features/solicitacoes/usePendencias'
const GerarOCDialog = React.lazy(() =>
  import('@/features/pdf-generator/GerarOCDialog').then((m) => ({ default: m.GerarOCDialog })),
)
const WhatsAppEnvioDialog = React.lazy(() =>
  import('@/features/whatsapp/WhatsAppEnvioDialog').then((m) => ({ default: m.WhatsAppEnvioDialog })),
)
import { formatNumeroOC, formatTelefone, formatarPamcardParaExibicao, cn } from '@/lib/utils'
import { isValidTelefone } from '@/lib/validators'
import { normalizeWhatsAppPhone, buildWhatsAppLink, formatOCWhatsAppMessage } from '@/features/whatsapp/whatsapp'
import { getOcPdfSignedUrl } from '@/features/pdf-generator/ocPdf'
import type { MaterialSubtipo, Tables } from '@/types/database.types'
import { isMineralMaterial } from '@/features/solicitacoes/material'

type MotoristaOpt = Pick<Tables<'motoristas'>, 'id' | 'nome_completo' | 'cpf'>
type VeiculoOpt = Pick<Tables<'veiculos'>, 'id' | 'placa' | 'subcontratada_id'>
type CarretaOpt = Pick<Tables<'carretas'>, 'id' | 'placa'>
type SubcontratadaOpt = Pick<Tables<'subcontratadas'>, 'id' | 'razao_social' | 'documento'>
type ClienteOpt = Pick<Tables<'clientes'>, 'id' | 'razao_social'>
type MaterialOpt = Pick<Tables<'materiais'>, 'id' | 'nome' | 'filial' | 'origem_padrao'>

const SUBTIPOS: MaterialSubtipo[] = ['SINTER', 'HEMATITA', 'LUMP']
const LOCAIS_CARREGAMENTO = ['TUPACERY', 'URUCUM'] as const

export function SolicitacaoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canEdit = canEditSolicitacoes(profile)
  const detail = useSolicitacao(id)
  const update = useUpdateSolicitacao()
  const transit = useTransitStatus()
  const duplicate = useDuplicateSolicitacao()

  const [confirmCancel, setConfirmCancel] = React.useState(false)
  const [confirmDuplicate, setConfirmDuplicate] = React.useState(false)
  const [confirmReabrir, setConfirmReabrir] = React.useState(false)
  const [confirmReativar, setConfirmReativar] = React.useState(false)
  const [instrInput, setInstrInput] = React.useState('')
  const [showInstrForm, setShowInstrForm] = React.useState(false)
  const [openGerarOC, setOpenGerarOC] = React.useState(false)
  const [openWhats, setOpenWhats] = React.useState(false)
  const [openDevolver, setOpenDevolver] = React.useState(false)

  const pendencias = usePendencias(id)
  const devolver = useDevolverParceiro()
  const pendenciaAberta = pendencias.data?.find((p) => p.status === 'aberta') ?? null

  const materialDetalhe = useQuery({
    enabled: !!detail.data?.material_id,
    queryKey: ['material-detalhe', detail.data?.material_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materiais')
        .select('cnpj_filial, filial, origem_padrao, observacoes_padrao')
        .eq('id', detail.data!.material_id!)
        .single()
      if (error) throw error
      return data as Pick<Tables<'materiais'>, 'cnpj_filial' | 'filial' | 'origem_padrao' | 'observacoes_padrao'>
    },
  })

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!detail.data) {
    return (
      <div className="rounded-lg border bg-background p-6 text-center text-[13px] text-muted-foreground">
        Solicitação não encontrada.
        <div className="mt-3">
          <Button variant="outline" onClick={() => navigate('/solicitacoes')}>
            Voltar para Solicitações
          </Button>
        </div>
      </div>
    )
  }

  const s = detail.data
  const editable = isEditable(s.status) && canEdit
  // Solicitação de parceiro chega sem material definido; ele é obrigatório para
  // sair de "recebida" (constraint solicitacoes_material_obrigatorio_apos_cadastro).
  const materialPendente = s.origem === 'parceiro' && !s.material_id && s.tipo !== 'retorno'
  // "Devolver ao parceiro" só faz sentido em solicitação de parceiro ainda em
  // andamento e sem outra pendência aberta.
  const podeDevolver =
    canEdit && s.origem === 'parceiro' && s.status !== 'finalizada' &&
    s.status !== 'cancelada' && !pendenciaAberta

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1 text-[12px] text-muted-foreground">
        <Link to="/solicitacoes" className="hover:text-foreground">Solicitações</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground">{formatNumeroOC(s.numero_interno)}</span>
      </nav>

      {s.status === 'cancelada' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-start gap-2 text-[13px] text-red-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div>
              <p className="font-medium">Esta solicitação está cancelada.</p>
              <p className="text-[12px] text-red-800">
                Você ainda pode editar os dados, mas ela não aparece no fluxo ativo. Reative para voltar ao status "Recebida".
              </p>
            </div>
          </div>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmReativar(true)}
              disabled={transit.isPending}
              className="border-red-300 bg-background hover:bg-red-100"
            >
              <RotateCcw className="h-4 w-4" />
              Reativar
            </Button>
          )}
        </div>
      )}

      {materialPendente && s.status === 'recebida' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/40">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-[13px] text-amber-900 dark:text-amber-200">
            <p className="font-medium">Material ainda não definido.</p>
            <p className="text-[12px] text-amber-800 dark:text-amber-300">
              Esta solicitação veio do parceiro sem material. Defina o material no
              card "Destino e material" antes de avançar para emissão.
            </p>
          </div>
        </div>
      )}

      {pendenciaAberta && (
        <div className="flex items-start gap-2 rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 dark:border-orange-900/60 dark:bg-orange-950/40">
          <Undo2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
          <div className="text-[13px] text-orange-900 dark:text-orange-200">
            <p className="font-medium">
              Devolvida ao parceiro — aguardando resolução
              <span className="font-normal text-orange-800 dark:text-orange-300">
                {' · desde '}
                {format(new Date(pendenciaAberta.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
              </span>
            </p>
            <p className="mt-0.5 text-[12px] text-orange-800 dark:text-orange-300">
              Motivo: {pendenciaAberta.motivo}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{formatNumeroOC(s.numero_interno)}</h1>
            <SolicitacaoStatusBadge status={s.status} />
            <span className="text-[12px] uppercase tracking-[0.5px] text-muted-foreground">{s.tipo}</span>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Criada em {format(new Date(s.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <StatusActions
              status={s.status}
              hasInstrucao={!!s.numero_instrucao}
              requerInstrucao={s.material?.requer_instrucao ?? true}
              onAdvanceInstrucao={() => {
                setInstrInput(s.numero_instrucao ?? '')
                setShowInstrForm(true)
              }}
              onAdvanceFinalizar={() => {
                if (id) transit.mutate({
                  id,
                  status: 'finalizada',
                  extra: { finalizada_em: new Date().toISOString() },
                })
              }}
              onMarcarEmCadastro={() => {
                if (id) transit.mutate({ id, status: 'em_cadastro' })
              }}
              onVoltarRecebida={() => {
                if (id) transit.mutate({ id, status: 'recebida' })
              }}
              onGerarOC={() => setOpenGerarOC(true)}
              onEnviarWhats={() => setOpenWhats(true)}
              onMarcarEnviada={() => {
                if (id) transit.mutate({
                  id,
                  status: 'oc_enviada',
                  extra: { enviada_em: new Date().toISOString() },
                })
              }}
              disabled={transit.isPending}
              bloquearAvanco={materialPendente}
            />
          )}
          {podeDevolver && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpenDevolver(true)}
              disabled={devolver.isPending}
              title="Devolver ao parceiro para resolver uma pendência (ex.: documento do veículo)"
              className="border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-900/60 dark:text-orange-300 dark:hover:bg-orange-950/40"
            >
              <Undo2 className="h-4 w-4" />
              Devolver ao parceiro
            </Button>
          )}
          {canEdit && canCancel(s.status) && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(true)} className="text-destructive hover:text-destructive">
              <X className="h-4 w-4" />
              Cancelar
            </Button>
          )}
          {canEdit && s.status === 'finalizada' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmReabrir(true)}
              disabled={transit.isPending}
              title="Voltar status para 'Em emissão' para corrigir dados"
            >
              <RotateCcw className="h-4 w-4" />
              Reabrir para correção
            </Button>
          )}
          {canEdit && s.status === 'cancelada' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmReativar(true)}
              disabled={transit.isPending}
              title="Voltar status para 'Recebida' para retomar o fluxo"
            >
              <RotateCcw className="h-4 w-4" />
              Reativar
            </Button>
          )}
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDuplicate(true)}
              disabled={duplicate.isPending}
              title="Duplicar solicitação"
            >
              {duplicate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              Duplicar
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate('/solicitacoes')}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SolicitanteCard solicitacao={s} editable={editable} onSave={(values) => update.mutateAsync({ id: s.id, values })} />
          <MotoristaVeiculoCard solicitacao={s} editable={editable} onSave={(values) => update.mutateAsync({ id: s.id, values })} />
          <DestinoMaterialCard solicitacao={s} editable={editable} onSave={(values) => update.mutateAsync({ id: s.id, values })} />
          {/* Pamcard só aparece nas solicitações vindas do portal de parceiros —
              no fluxo interno o cartão é gerenciado fora da solicitação. */}
          {s.origem === 'parceiro' && (
            <PamcardCard solicitacao={s} editable={editable} onSave={(values) => update.mutateAsync({ id: s.id, values })} />
          )}
          {showInstrForm && (
            <InstrucaoForm
              initial={s.numero_instrucao ?? instrInput}
              onCancel={() => setShowInstrForm(false)}
              onSave={async (numero) => {
                await transit.mutateAsync({
                  id: s.id,
                  status: 'instrucao_emitida',
                  extra: { numero_instrucao: numero },
                })
                setShowInstrForm(false)
              }}
            />
          )}
          <InstrucaoPdfCard solicitacao={s} />
          <AnexosCard solicitacaoId={s.id} editable={editable} />
        </div>

        <div className="space-y-4">
          {s.origem === 'parceiro' && (s.status === 'oc_gerada' || s.status === 'oc_enviada') && (
            <AvisarParceiroCard solicitacao={s} />
          )}
          {s.origem === 'parceiro' && (pendencias.data?.length ?? 0) > 0 && (
            <PendenciasCard pendencias={pendencias.data ?? []} />
          )}
          <HistoricoCard
            solicitacaoId={s.id}
            motoristaId={s.motorista_id}
            veiculoId={s.veiculo_id}
            clienteId={s.cliente_id}
            motoristaNome={s.motorista?.nome_completo ?? null}
            veiculoPlaca={s.veiculo?.placa ?? null}
          />
          <ObservacoesCard solicitacao={s} editable={editable} onSave={(values) => update.mutateAsync({ id: s.id, values })} />
          <TimelineCard solicitacao={s} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancelar solicitação?"
        description={`A solicitação ${formatNumeroOC(s.numero_interno)} será marcada como cancelada. Você pode duplicá-la depois caso precise refazer.`}
        confirmLabel="Sim, cancelar"
        destructive
        onConfirm={async () => {
          await transit.mutateAsync({ id: s.id, status: 'cancelada' })
          setConfirmCancel(false)
        }}
      />

      <ConfirmDialog
        open={confirmReabrir}
        onOpenChange={setConfirmReabrir}
        title="Reabrir solicitação para correção?"
        description={`A solicitação ${formatNumeroOC(s.numero_interno)} volta para o status "Em emissão" para permitir ajustes. O PDF e o número da instrução ficam preservados. Após corrigir, finalize novamente.`}
        confirmLabel="Sim, reabrir"
        onConfirm={async () => {
          await transit.mutateAsync({
            id: s.id,
            status: 'em_cadastro',
            extra: { finalizada_em: null },
          })
          setConfirmReabrir(false)
          toast.success('Solicitação reaberta. Faça as correções e finalize novamente.')
        }}
      />

      <ConfirmDialog
        open={confirmReativar}
        onOpenChange={setConfirmReativar}
        title="Reativar solicitação?"
        description={`A solicitação ${formatNumeroOC(s.numero_interno)} volta para o status "Recebida" e retorna ao fluxo normal.`}
        confirmLabel="Sim, reativar"
        onConfirm={async () => {
          await transit.mutateAsync({ id: s.id, status: 'recebida' })
          setConfirmReativar(false)
          toast.success('Solicitação reativada.')
        }}
      />

      <ConfirmDialog
        open={confirmDuplicate}
        onOpenChange={setConfirmDuplicate}
        title="Duplicar solicitação?"
        description={`Será criada uma nova solicitação com os mesmos dados de ${formatNumeroOC(s.numero_interno)} (motorista, veículo, cliente, material e observações). O status volta para "Recebida" e o número da instrução, PDF e datas de envio são limpos.`}
        confirmLabel="Sim, duplicar"
        onConfirm={async () => {
          const created = await duplicate.mutateAsync({ sourceId: s.id })
          setConfirmDuplicate(false)
          navigate(`/solicitacoes/${created.id}`)
        }}
      />

      <DevolverParceiroDialog
        open={openDevolver}
        onOpenChange={setOpenDevolver}
        numero={formatNumeroOC(s.numero_interno)}
        saving={devolver.isPending}
        onConfirm={async (motivo) => {
          await devolver.mutateAsync({ solicitacaoId: s.id, motivo })
          setOpenDevolver(false)
        }}
      />

      {openGerarOC && (
        <React.Suspense fallback={null}>
          <GerarOCDialog
            open={openGerarOC}
            onOpenChange={setOpenGerarOC}
            solicitacao={s}
            material={materialDetalhe.data ?? null}
            onSaved={() => {
              toast.success('OC salva no Storage', {
                action: {
                  label: 'Enviar WhatsApp',
                  onClick: () => setOpenWhats(true),
                },
              })
            }}
          />
        </React.Suspense>
      )}

      {openWhats && (
        <React.Suspense fallback={null}>
          <WhatsAppEnvioDialog
            open={openWhats}
            onOpenChange={setOpenWhats}
            solicitacao={s}
          />
        </React.Suspense>
      )}
    </div>
  )
}

interface ActionsProps {
  status: Tables<'solicitacoes'>['status']
  hasInstrucao: boolean
  requerInstrucao: boolean
  onAdvanceInstrucao: () => void
  onAdvanceFinalizar: () => void
  onMarcarEmCadastro: () => void
  onVoltarRecebida: () => void
  onGerarOC: () => void
  onEnviarWhats: () => void
  onMarcarEnviada: () => void
  disabled: boolean
  bloquearAvanco: boolean
}

function StatusActions({ status, hasInstrucao, requerInstrucao, onAdvanceInstrucao, onAdvanceFinalizar, onMarcarEmCadastro, onVoltarRecebida, onGerarOC, onEnviarWhats, onMarcarEnviada, disabled, bloquearAvanco }: ActionsProps) {
  if (status === 'recebida') {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={onMarcarEmCadastro}
        disabled={disabled || bloquearAvanco}
        title={bloquearAvanco ? 'Defina o material antes de avançar para emissão' : undefined}
      >
        Marcar em emissão
      </Button>
    )
  }
  if (status === 'em_cadastro') {
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onVoltarRecebida} disabled={disabled} title="Voltar status para 'Recebida'">
          <ChevronLeft className="h-4 w-4" />
          Voltar para Recebida
        </Button>
        {requerInstrucao ? (
          <Button size="sm" onClick={onAdvanceInstrucao} disabled={disabled}>
            + Adicionar instrução
          </Button>
        ) : (
          <Button size="sm" onClick={onGerarOC} disabled={disabled} title="Material dispensa nº de instrução">
            Gerar OC
          </Button>
        )}
      </div>
    )
  }
  if (status === 'instrucao_emitida') {
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onAdvanceInstrucao} disabled={disabled}>
          Editar instrução
        </Button>
        <Button size="sm" onClick={onGerarOC} disabled={disabled}>
          Gerar OC
        </Button>
      </div>
    )
  }
  if (status === 'oc_gerada') {
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onGerarOC} disabled={disabled}>
          Regerar OC
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onMarcarEnviada}
          disabled={disabled}
          title="Marcar como enviada sem abrir o WhatsApp (ex.: enviou por outro meio)"
        >
          Marcar como enviada
        </Button>
        <Button size="sm" onClick={onEnviarWhats} disabled={disabled}>
          Enviar WhatsApp
        </Button>
      </div>
    )
  }
  if (status === 'oc_enviada') {
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onEnviarWhats} disabled={disabled}>
          Reenviar WhatsApp
        </Button>
        <Button size="sm" onClick={onAdvanceFinalizar} disabled={disabled}>
          Finalizar
        </Button>
      </div>
    )
  }
  if (!hasInstrucao && requerInstrucao && status !== 'cancelada' && status !== 'finalizada') {
    return (
      <Button size="sm" onClick={onAdvanceInstrucao} disabled={disabled}>
        + Adicionar instrução
      </Button>
    )
  }
  return null
}

function CardShell({
  title, editable, isEditing, onEdit, onCancel, saving, children,
}: {
  title: string
  editable: boolean
  isEditing: boolean
  onEdit: () => void
  onCancel: () => void
  saving?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border bg-background">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-medium text-foreground">{title}</h2>
          {saving && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Salvando…
            </span>
          )}
        </div>
        {editable && !isEditing && (
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Editar ${title}`}>
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        {isEditing && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

interface CardProps {
  solicitacao: ReturnType<typeof useSolicitacao>['data'] extends infer T ? NonNullable<T> : never
  editable: boolean
  onSave: (values: Partial<Tables<'solicitacoes'>>) => Promise<unknown>
}

function SolicitanteCard({ solicitacao, editable, onSave }: CardProps) {
  const [editing, setEditing] = React.useState(false)
  const [nome, setNome] = React.useState(solicitacao.solicitante_nome ?? '')
  const [tel, setTel] = React.useState(solicitacao.solicitante_telefone ?? '')
  const [saving, setSaving] = React.useState(false)
  const [erroTel, setErroTel] = React.useState<string | null>(null)

  const [lastSync, setLastSync] = React.useState({ solicitacao, editing })
  if (lastSync.solicitacao !== solicitacao || lastSync.editing !== editing) {
    setLastSync({ solicitacao, editing })
    if (!editing) {
      setNome(solicitacao.solicitante_nome ?? '')
      setTel(solicitacao.solicitante_telefone ?? '')
      if (erroTel !== null) setErroTel(null)
    }
  }

  const submit = async () => {
    if (tel && !isValidTelefone(tel)) { setErroTel('Telefone inválido'); return }
    setErroTel(null)
    setSaving(true)
    try {
      await onSave({
        solicitante_nome: nome || null,
        solicitante_telefone: tel ? formatTelefone(tel) : null,
      })
      setEditing(false)
    } finally { setSaving(false) }
  }

  return (
    <CardShell title="Solicitante" editable={editable} isEditing={editing} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)} saving={saving}>
      {!editing ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
          <Field label="Nome" value={solicitacao.solicitante_nome} />
          <Field label="Telefone" value={solicitacao.solicitante_telefone} />
        </dl>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-[1.4fr_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-sol-nome">Nome</Label>
              <Input id="d-sol-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-sol-tel">Telefone</Label>
              <Input
                id="d-sol-tel"
                value={tel}
                onChange={(e) => setTel(formatTelefone(e.target.value))}
                placeholder="(00) 00000-0000"
              />
              {erroTel && <p className="text-[11px] text-destructive">{erroTel}</p>}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </CardShell>
  )
}

function MotoristaVeiculoCard({ solicitacao, editable, onSave }: CardProps) {
  const [editing, setEditing] = React.useState(false)
  const [motorista, setMotorista] = React.useState<string | null>(solicitacao.motorista_id)
  const [veiculo, setVeiculo] = React.useState<string | null>(solicitacao.veiculo_id)
  const [carreta, setCarreta] = React.useState<string | null>(solicitacao.carreta_id)
  const [primeiraCarreta, setPrimeiraCarreta] = React.useState<string | null>(solicitacao.primeira_carreta_id)
  const [dolly, setDolly] = React.useState<string | null>(solicitacao.dolly_id)
  const [subcontratada, setSubcontratada] = React.useState<string | null>(solicitacao.subcontratada_id)
  const [saving, setSaving] = React.useState(false)

  const motoristas = useCrudOptions<MotoristaOpt>({ table: 'motoristas', selectColumns: 'id, nome_completo, cpf', orderBy: 'nome_completo' })
  const veiculos = useCrudOptions<VeiculoOpt>({ table: 'veiculos', selectColumns: 'id, placa, subcontratada_id', orderBy: 'placa' })
  const carretas = useCrudOptions<CarretaOpt>({ table: 'carretas', selectColumns: 'id, placa', orderBy: 'placa' })
  const subcontratadas = useCrudOptions<SubcontratadaOpt>({ table: 'subcontratadas', selectColumns: 'id, razao_social, documento', orderBy: 'razao_social' })

  const [lastTransporteSync, setLastTransporteSync] = React.useState({ solicitacao, editing })
  if (lastTransporteSync.solicitacao !== solicitacao || lastTransporteSync.editing !== editing) {
    setLastTransporteSync({ solicitacao, editing })
    if (!editing) {
      setMotorista(solicitacao.motorista_id)
      setVeiculo(solicitacao.veiculo_id)
      setCarreta(solicitacao.carreta_id)
      setPrimeiraCarreta(solicitacao.primeira_carreta_id)
      setDolly(solicitacao.dolly_id)
      setSubcontratada(solicitacao.subcontratada_id)
    }
  }

  const veiculoSubAuto = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!editing) return
    const veic = (veiculos.data ?? []).find((v) => v.id === veiculo)
    const auto = veic?.subcontratada_id ?? null
    if (!auto) return
    if (!subcontratada || subcontratada === veiculoSubAuto.current) {
      setSubcontratada(auto)
      veiculoSubAuto.current = auto
    }
  }, [editing, veiculo, veiculos.data, subcontratada])

  const motOpts: ComboboxOption[] = (motoristas.data ?? []).map((m) => ({ value: m.id, label: m.nome_completo, hint: m.cpf }))
  const veicOpts: ComboboxOption[] = (veiculos.data ?? []).map((v) => ({ value: v.id, label: v.placa }))
  const carOpts: ComboboxOption[] = (carretas.data ?? []).map((c) => ({ value: c.id, label: c.placa }))
  const subOpts: ComboboxOption[] = (subcontratadas.data ?? []).map((s) => ({ value: s.id, label: s.razao_social, hint: s.documento ?? undefined }))

  const submit = async () => {
    setSaving(true)
    try {
      await onSave({
        motorista_id: motorista,
        veiculo_id: veiculo,
        carreta_id: carreta,
        primeira_carreta_id: primeiraCarreta,
        dolly_id: dolly,
        subcontratada_id: subcontratada,
      })
      setEditing(false)
    } finally { setSaving(false) }
  }

  return (
    <CardShell title="Motorista e veículo" editable={editable} isEditing={editing} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)} saving={saving}>
      {!editing ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
          <Field
            label="Motorista"
            value={solicitacao.motorista?.nome_completo}
            extra={solicitacao.motorista?.cpf}
          />
          <Field
            label="Subcontratada"
            value={solicitacao.subcontratada?.razao_social}
            extra={solicitacao.subcontratada?.documento}
          />
          <Field label="Cavalo" value={solicitacao.veiculo?.placa} />
          <Field label="1ª Carreta" value={solicitacao.primeira_carreta?.placa} />
          <Field label="Dolly" value={solicitacao.dolly?.placa} />
          <Field label="Última Carreta" value={solicitacao.carreta?.placa} />
        </dl>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Motorista</Label>
            <Combobox options={motOpts} value={motorista} onChange={setMotorista}
              placeholder="Selecionar" loading={motoristas.isLoading} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cavalo</Label>
              <Combobox options={veicOpts} value={veiculo} onChange={setVeiculo}
                placeholder="Selecionar" loading={veiculos.isLoading} />
            </div>
            <div className="space-y-1.5">
              <Label>Última Carreta</Label>
              <Combobox options={carOpts} value={carreta} onChange={setCarreta}
                placeholder="Opcional" loading={carretas.isLoading} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>1ª Carreta</Label>
              <Combobox options={carOpts} value={primeiraCarreta} onChange={setPrimeiraCarreta}
                placeholder="Opcional" loading={carretas.isLoading} />
            </div>
            <div className="space-y-1.5">
              <Label>Dolly</Label>
              <Combobox options={carOpts} value={dolly} onChange={setDolly}
                placeholder="Opcional" loading={carretas.isLoading} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            1ª Carreta e Dolly são opcionais — preencha conforme a composição (ANTT).
          </p>
          <div className="space-y-1.5">
            <Label>Subcontratada</Label>
            <Combobox options={subOpts} value={subcontratada} onChange={setSubcontratada}
              placeholder="Pré-preenchida pelo cavalo" loading={subcontratadas.isLoading} />
            <p className="text-[11px] text-muted-foreground">Por padrão usa a subcontratada do cavalo.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </CardShell>
  )
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function DestinoMaterialCard({ solicitacao, editable, onSave }: CardProps) {
  const [editing, setEditing] = React.useState(false)
  const [cliente, setCliente] = React.useState<string | null>(solicitacao.cliente_id)
  const [material, setMaterial] = React.useState<string>(solicitacao.material_id ?? '')
  const [subtipo, setSubtipo] = React.useState<MaterialSubtipo | null>(solicitacao.material_subtipo)
  const [localCarreg, setLocalCarreg] = React.useState<string>(solicitacao.local_carregamento ?? '')
  const [valIni, setValIni] = React.useState<string>(solicitacao.validade_inicio ?? todayISO())
  const [valFim, setValFim] = React.useState<string>(
    solicitacao.validade_fim ?? addDaysISO(solicitacao.validade_inicio ?? todayISO(), 1),
  )
  const [saving, setSaving] = React.useState(false)

  const clientes = useCrudOptions<ClienteOpt>({ table: 'clientes', selectColumns: 'id, razao_social', orderBy: 'razao_social' })
  const materiais = useCrudOptions<MaterialOpt>({ table: 'materiais', selectColumns: 'id, nome, filial, origem_padrao', orderBy: 'nome' })

  const [lastDestinoSync, setLastDestinoSync] = React.useState({ solicitacao, editing })
  if (lastDestinoSync.solicitacao !== solicitacao || lastDestinoSync.editing !== editing) {
    setLastDestinoSync({ solicitacao, editing })
    if (!editing) {
      setCliente(solicitacao.cliente_id)
      setMaterial(solicitacao.material_id ?? '')
      setSubtipo(solicitacao.material_subtipo)
      setLocalCarreg(solicitacao.local_carregamento ?? '')
      setValIni(solicitacao.validade_inicio ?? todayISO())
      setValFim(
        solicitacao.validade_fim ?? addDaysISO(solicitacao.validade_inicio ?? todayISO(), 1),
      )
    }
  }

  const cliOpts: ComboboxOption[] = (clientes.data ?? []).map((c) => ({ value: c.id, label: c.razao_social }))
  const materialAtual = (materiais.data ?? []).find((m) => m.id === material) ?? null
  const exigeSubtipo = isMineralMaterial(materialAtual?.nome)
  const isRetorno = solicitacao.tipo === 'retorno'

  if (editing && !exigeSubtipo && subtipo) {
    setSubtipo(null)
  }

  const datasInvalidas = !valIni || !valFim || valFim < valIni

  const submit = async () => {
    if (datasInvalidas) return
    setSaving(true)
    try {
      await onSave({
        cliente_id: cliente,
        material_id: material || null,
        material_subtipo: exigeSubtipo ? subtipo : null,
        local_carregamento: localCarreg || null,
        validade_inicio: valIni,
        validade_fim: valFim,
      })
      setEditing(false)
    } finally { setSaving(false) }
  }

  const materialDisplay = solicitacao.material?.nome
    ? solicitacao.material_subtipo
      ? `${solicitacao.material.nome} - ${solicitacao.material_subtipo}`
      : solicitacao.material.nome
    : null

  const validadeDisplay =
    solicitacao.validade_inicio && solicitacao.validade_fim
      ? `${formatDateBR(solicitacao.validade_inicio)} a ${formatDateBR(solicitacao.validade_fim)}`
      : null

  return (
    <CardShell title="Destino e material" editable={editable} isEditing={editing} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)} saving={saving}>
      {!editing ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
          <Field label="Cliente" value={solicitacao.cliente?.razao_social} />
          {solicitacao.origem === 'parceiro' && !solicitacao.material_id && !isRetorno ? (
            <div>
              <dt className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground">Material</dt>
              <dd className="font-medium text-amber-700 dark:text-amber-400">Material a definir</dd>
            </div>
          ) : (
            <Field label="Material" value={materialDisplay} />
          )}
          <Field label="Local de carregamento" value={solicitacao.local_carregamento ?? solicitacao.material?.origem_padrao ?? null} />
          <Field label="Validade da OC" value={validadeDisplay} />
        </dl>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Combobox options={cliOpts} value={cliente} onChange={setCliente}
              placeholder="Selecionar cliente" loading={clientes.isLoading}
              disabled={isRetorno} />
            {isRetorno && (
              <p className="text-[11px] text-muted-foreground">
                Definido pela carga de retorno — não pode ser alterado aqui.
              </p>
            )}
          </div>
          <div className={`grid gap-3 ${exigeSubtipo ? 'grid-cols-[1.4fr_1fr]' : 'grid-cols-1'}`}>
            <div className="space-y-1.5">
              <Label>Material</Label>
              <Select value={material || undefined} onValueChange={setMaterial}>
                <SelectTrigger><SelectValue placeholder="Selecionar material" /></SelectTrigger>
                <SelectContent>
                  {(materiais.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.nome} <span className="text-muted-foreground">· {m.filial}</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {exigeSubtipo && (
              <div className="space-y-1.5">
                <Label>Tipo de minério</Label>
                <Select value={subtipo ?? undefined} onValueChange={(v) => setSubtipo(v as MaterialSubtipo)}>
                  <SelectTrigger><SelectValue placeholder="SINTER · HEMATITA · LUMP" /></SelectTrigger>
                  <SelectContent>
                    {SUBTIPOS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Local de carregamento</Label>
            <Select
              value={localCarreg || undefined}
              onValueChange={setLocalCarreg}
              disabled={isRetorno}
            >
              <SelectTrigger>
                <SelectValue placeholder={isRetorno ? '—' : 'Selecionar local'} />
              </SelectTrigger>
              <SelectContent>
                {LOCAIS_CARREGAMENTO.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            {isRetorno && (
              <p className="text-[11px] text-muted-foreground">
                Definido pela carga de retorno — não pode ser alterado aqui.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-val-ini">Validade início</Label>
              <Input
                id="d-val-ini"
                type="date"
                value={valIni}
                onChange={(e) => {
                  const v = e.target.value
                  setValIni(v)
                  if (v && valFim && valFim < v) setValFim(addDaysISO(v, 1))
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-val-fim">Validade fim</Label>
              <Input
                id="d-val-fim"
                type="date"
                value={valFim}
                min={valIni}
                onChange={(e) => setValFim(e.target.value)}
              />
            </div>
          </div>
          {datasInvalidas && (
            <p className="text-[11px] text-destructive">Validade fim deve ser igual ou posterior ao início.</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={submit} disabled={saving || datasInvalidas}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </CardShell>
  )
}

function InstrucaoPdfCard({ solicitacao }: { solicitacao: CardProps['solicitacao'] }) {
  const dispensa = solicitacao.material?.requer_instrucao === false
  const instrucaoValor = solicitacao.numero_instrucao ?? (dispensa ? 'Não exigido' : null)
  return (
    <CardShell title="Instrução e PDF" editable={false} isEditing={false} onEdit={() => {}} onCancel={() => {}}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
        <Field label="Nº Instrução" value={instrucaoValor} />
        <div>
          <dt className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground">PDF</dt>
          <dd>
            {solicitacao.pdf_url ? (
              <AbrirPdfLink stored={solicitacao.pdf_url} />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
        </div>
      </dl>
    </CardShell>
  )
}

/** Abre o PDF da OC gerando uma signed URL na hora (bucket privado, 0026). */
function AbrirPdfLink({ stored }: { stored: string }) {
  const [loading, setLoading] = React.useState(false)
  const abrir = async () => {
    setLoading(true)
    try {
      const url = await getOcPdfSignedUrl(stored)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('Não foi possível abrir o PDF')
    } finally {
      setLoading(false)
    }
  }
  return (
    <button
      type="button"
      onClick={abrir}
      disabled={loading}
      className="text-primary hover:underline disabled:opacity-60"
    >
      {loading ? 'Abrindo…' : 'Abrir PDF'}
    </button>
  )
}

function InstrucaoForm({ initial, onCancel, onSave }: { initial: string; onCancel: () => void; onSave: (numero: string) => Promise<void> }) {
  const [valor, setValor] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)
  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <h2 className="mb-2 text-[14px] font-medium text-amber-900">Adicionar número de instrução</h2>
      <p className="mb-3 text-[12px] text-amber-800">
        Cole aqui o número da instrução emitida no ERP. Ao salvar, o status muda para "Instrução emitida".
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px] space-y-1.5">
          <Label htmlFor="instr">Nº Instrução</Label>
          <Input id="instr" autoFocus value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancelar</Button>
          <Button
            size="sm"
            disabled={saving || valor.trim().length === 0}
            onClick={async () => { setSaving(true); try { await onSave(valor.trim()) } finally { setSaving(false) } }}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar instrução
          </Button>
        </div>
      </div>
    </section>
  )
}

function PamcardNumeroDialog({
  open,
  onOpenChange,
  title,
  description,
  initialNumero,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description: string
  initialNumero: string
  onConfirm: (numero: string) => Promise<void>
}) {
  // `key={initialNumero}` quando aberto remonta o form e o useState abaixo
  // captura o novo valor inicial — evita useEffect+setState (regra do
  // React Compiler) e preserva animação de fechamento.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <PamcardNumeroForm
            key={initialNumero}
            title={title}
            description={description}
            initialNumero={initialNumero}
            onCancel={() => onOpenChange(false)}
            onConfirm={async (n) => {
              await onConfirm(n)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PamcardNumeroForm({
  title,
  description,
  initialNumero,
  onCancel,
  onConfirm,
}: {
  title: string
  description: string
  initialNumero: string
  onCancel: () => void
  onConfirm: (numero: string) => Promise<void>
}) {
  const [numero, setNumero] = React.useState(initialNumero)
  const [erro, setErro] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const validar = (v: string): string | null => {
    if (!/^[0-9]+$/.test(v)) return 'O Pamcard deve conter apenas números'
    if (v.length < 10) return 'O Pamcard deve ter no mínimo 10 dígitos'
    if (v.length > 16) return 'O Pamcard deve ter no máximo 16 dígitos'
    return null
  }

  const submit = async () => {
    const e = validar(numero)
    if (e) {
      setErro(e)
      return
    }
    setSaving(true)
    try {
      await onConfirm(numero)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-1.5">
        <Label htmlFor="pamcard-dlg">Número do cartão *</Label>
        <Input
          id="pamcard-dlg"
          autoFocus
          value={numero}
          onChange={(e) => {
            setNumero(e.target.value.replace(/\D/g, '').slice(0, 16))
            setErro(null)
          }}
          onBlur={() => setErro(validar(numero))}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={16}
          placeholder="Ex: 441781209999"
        />
        {erro && <p className="text-[11px] text-destructive">{erro}</p>}
      </DialogBody>
      <DialogFooter>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

function PamcardCard({ solicitacao, editable, onSave }: CardProps) {
  const { profile } = useAuth()
  const temCartao = solicitacao.pamcard_status === 'tem_cartao'
  const naoNecessario = solicitacao.pamcard_status === 'nao_necessario'
  const providenciado = !!solicitacao.pamcard_providenciado_em
  const podeAlterar = editable && solicitacao.status !== 'cancelada'
  const [editarOpen, setEditarOpen] = React.useState(false)
  const [providenciarOpen, setProvidenciarOpen] = React.useState(false)

  const providenciadoPor = useQuery({
    enabled: !!solicitacao.pamcard_providenciado_por,
    queryKey: ['perfil-nome', solicitacao.pamcard_providenciado_por],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('perfis_usuarios')
        .select('nome_completo')
        .eq('user_id', solicitacao.pamcard_providenciado_por!)
        .maybeSingle()
      if (error) throw error
      return (data as Pick<Tables<'perfis_usuarios'>, 'nome_completo'> | null)?.nome_completo ?? null
    },
  })

  return (
    <section className="rounded-lg border bg-background">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[14px] font-medium text-foreground">Pamcard</h2>
        </div>
        {temCartao && !providenciado && podeAlterar && (
          <Button variant="ghost" size="sm" onClick={() => setEditarOpen(true)} aria-label="Editar Pamcard">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </header>
      <div className="p-4">
        {temCartao && !providenciado && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground">Status</dt>
              <dd className="font-medium text-green-700 dark:text-green-400">Informado pelo solicitante</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground">Número</dt>
              <dd className="text-foreground">{formatarPamcardParaExibicao(solicitacao.pamcard_numero) || '—'}</dd>
            </div>
          </dl>
        )}

        {naoNecessario && (
          <div>
            <dt className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground">Status</dt>
            <dd className="font-medium text-muted-foreground">
              Não necessário — pagamento por outro meio
            </dd>
          </div>
        )}

        {!temCartao && !naoNecessario && !providenciado && (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
              Aguardando providência da equipe interna.
            </div>
            {podeAlterar && (
              <Button className="w-full" onClick={() => setProvidenciarOpen(true)}>
                Cartão providenciado
              </Button>
            )}
          </div>
        )}

        {temCartao && providenciado && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground">Status</dt>
              <dd className="font-medium text-blue-700 dark:text-blue-400">Providenciado pela equipe</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground">Número</dt>
              <dd className="text-foreground">{formatarPamcardParaExibicao(solicitacao.pamcard_numero) || '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground">Providenciado por</dt>
              <dd className="text-foreground">
                {providenciadoPor.data ?? '—'}
                {solicitacao.pamcard_providenciado_em && (
                  <span className="text-muted-foreground">
                    {' · '}
                    {format(new Date(solicitacao.pamcard_providenciado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        )}
      </div>

      <PamcardNumeroDialog
        open={editarOpen}
        onOpenChange={setEditarOpen}
        title="Editar número do Pamcard"
        description="Atualize o número do cartão informado pelo solicitante."
        initialNumero={solicitacao.pamcard_numero ?? ''}
        onConfirm={async (numero) => {
          await onSave({ pamcard_numero: numero })
          toast.success('Número do Pamcard atualizado')
        }}
      />
      <PamcardNumeroDialog
        open={providenciarOpen}
        onOpenChange={setProvidenciarOpen}
        title="Registrar cartão providenciado"
        description="Informe o número do cartão Pamcard providenciado para esta solicitação."
        initialNumero=""
        onConfirm={async (numero) => {
          await onSave({
            pamcard_status: 'tem_cartao',
            pamcard_numero: numero,
            pamcard_providenciado_por: profile?.user_id ?? null,
            pamcard_providenciado_em: new Date().toISOString(),
          })
          toast.success('Cartão registrado com sucesso')
        }}
      />
    </section>
  )
}

function ObservacoesCard({ solicitacao, editable, onSave }: CardProps) {
  const [editing, setEditing] = React.useState(false)
  const [valor, setValor] = React.useState(solicitacao.observacoes ?? '')
  const [saving, setSaving] = React.useState(false)

  const [lastObsSync, setLastObsSync] = React.useState({ solicitacao, editing })
  if (lastObsSync.solicitacao !== solicitacao || lastObsSync.editing !== editing) {
    setLastObsSync({ solicitacao, editing })
    if (!editing) setValor(solicitacao.observacoes ?? '')
  }

  return (
    <CardShell title="Observações" editable={editable} isEditing={editing} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)} saving={saving}>
      {!editing ? (
        <p className="whitespace-pre-wrap text-[13px] text-foreground">
          {solicitacao.observacoes ?? <span className="text-muted-foreground">Sem observações.</span>}
        </p>
      ) : (
        <div className="space-y-3">
          <Textarea rows={4} value={valor} onChange={(e) => setValor(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
            <Button
              size="sm"
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                try {
                  await onSave({ observacoes: valor || null })
                  setEditing(false)
                } finally { setSaving(false) }
              }}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </CardShell>
  )
}

function TimelineCard({ solicitacao }: { solicitacao: CardProps['solicitacao'] }) {
  const items: { when: string | null; label: string }[] = [
    { when: solicitacao.created_at, label: 'Solicitação recebida' },
  ]
  if (solicitacao.numero_instrucao) items.push({ when: solicitacao.updated_at, label: `Instrução ${solicitacao.numero_instrucao}` })
  if (solicitacao.pdf_url) items.push({ when: solicitacao.updated_at, label: 'OC gerada (PDF)' })
  if (solicitacao.enviada_em) items.push({ when: solicitacao.enviada_em, label: 'OC enviada' })
  if (solicitacao.finalizada_em) items.push({ when: solicitacao.finalizada_em, label: 'Finalizada' })
  if (solicitacao.status === 'cancelada') items.push({ when: solicitacao.updated_at, label: 'Cancelada' })

  return (
    <section className="rounded-lg border bg-background">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="text-[14px] font-medium text-foreground">Linha do tempo</h2>
      </header>
      <ol className="space-y-3 p-4 text-[12px]">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <div className="leading-tight">
              <p className="text-foreground">{it.label}</p>
              <p className="text-muted-foreground">
                {it.when ? format(new Date(it.when), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—'}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

// Diálogo para devolver a solicitação ao parceiro com um motivo. Cria uma
// pendência aberta (migration 0035) que o parceiro vê e resolve no portal.
function DevolverParceiroDialog({
  open, onOpenChange, numero, saving, onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  numero: string
  saving: boolean
  onConfirm: (motivo: string) => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <DevolverParceiroForm
            numero={numero}
            saving={saving}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DevolverParceiroForm({
  numero, saving, onCancel, onConfirm,
}: {
  numero: string
  saving: boolean
  onCancel: () => void
  onConfirm: (motivo: string) => Promise<void>
}) {
  const [motivo, setMotivo] = React.useState('')
  return (
    <>
      <DialogHeader>
        <DialogTitle>Devolver {numero} ao parceiro</DialogTitle>
        <DialogDescription>
          Descreva a pendência que impede a finalização. O parceiro recebe um
          aviso no portal e responde quando resolver — você é notificado de volta.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-1.5">
        <Label htmlFor="devolver-motivo">Motivo da pendência *</Label>
        <Textarea
          id="devolver-motivo"
          autoFocus
          rows={4}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: CRLV do cavalo está vencido. Envie o documento atualizado nos anexos."
        />
      </DialogBody>
      <DialogFooter>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
          <Button
            onClick={() => onConfirm(motivo.trim())}
            disabled={saving || motivo.trim().length === 0}
            className="bg-orange-600 text-white hover:bg-orange-700"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            <Undo2 className="h-4 w-4" />
            Devolver ao parceiro
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

// Histórico de pendências da solicitação: o que foi devolvido, o status e a
// resposta do parceiro quando resolvida.
function PendenciasCard({ pendencias }: { pendencias: Pendencia[] }) {
  const marcarVista = useMarcarPendenciaVista()
  return (
    <section className="rounded-lg border bg-background">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="text-[14px] font-medium text-foreground">Pendências com o parceiro</h2>
      </header>
      <ul className="divide-y">
        {pendencias.map((p) => {
          const aberta = p.status === 'aberta'
          const respondidaNaoVista = !aberta && !p.vista_equipe_em
          return (
            <li
              key={p.id}
              className={cn(
                'space-y-1.5 px-4 py-3',
                respondidaNaoVista && 'bg-emerald-50/60 dark:bg-emerald-950/20',
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                    aberta
                      ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
                  )}
                >
                  {aberta ? <Undo2 className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                  {aberta ? 'Aguardando parceiro' : 'Resolvida'}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {format(new Date(p.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
              <p className="text-[12px] text-foreground">
                <span className="text-muted-foreground">Motivo: </span>{p.motivo}
              </p>
              {p.resposta_parceiro && (
                <p className="rounded-md bg-muted/60 px-2.5 py-1.5 text-[12px] text-foreground">
                  <span className="text-muted-foreground">Resposta do parceiro: </span>
                  {p.resposta_parceiro}
                </p>
              )}
              {!aberta && p.resolvida_em && (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Resolvida em {format(new Date(p.resolvida_em), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </p>
              )}
              {respondidaNaoVista && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-1 h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                  disabled={marcarVista.isPending}
                  onClick={() => marcarVista.mutate(p.id)}
                  title="Marca a resposta como vista — remove o aviso do card para toda a equipe"
                >
                  {marcarVista.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Marcar como visto
                </Button>
              )}
              {!aberta && p.vista_equipe_em && (
                <p className="text-[11px] text-muted-foreground">
                  Visto pela equipe em {format(new Date(p.vista_equipe_em), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// Card de comunicação com o parceiro. Aparece no detalhe de solicitações de
// origem parceiro quando a OC já foi gerada — atalhos para avisar a
// transportadora parceira pelos contatos cadastrados em /cadastros/parceiros.
function AvisarParceiroCard({ solicitacao }: { solicitacao: CardProps['solicitacao'] }) {
  const parceiro = solicitacao.parceiro
  const fone = normalizeWhatsAppPhone(parceiro?.contato_principal_telefone)
  const email = parceiro?.contato_principal_email ?? null
  const mensagem = formatOCWhatsAppMessage(solicitacao)

  const abrirWhatsApp = () => {
    // Mesma aba do WhatsApp a cada envio (ver WhatsAppEnvioDialog.handleAbrir).
    window.open(buildWhatsAppLink(fone, mensagem), 'sislog_whatsapp')
  }
  const abrirEmail = () => {
    if (!email) return
    const assunto = `Ordem de Carregamento ${formatNumeroOC(solicitacao.numero_interno)}`
    window.location.href =
      `mailto:${email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(mensagem)}`
  }

  return (
    <section className="rounded-lg border bg-background">
      <header className="border-b px-4 py-2">
        <h2 className="text-[14px] font-medium text-foreground">Avisar o parceiro</h2>
      </header>
      <div className="space-y-3 p-4">
        <p className="text-[12px] text-muted-foreground">
          A OC já foi gerada. Avise {parceiro?.razao_social ?? 'o parceiro'} de que a
          ordem está disponível.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={abrirWhatsApp}
            disabled={!fone}
            title={fone ? undefined : 'Parceiro sem telefone de contato cadastrado'}
          >
            <MessageCircle className="h-4 w-4" />
            Enviar WhatsApp ao parceiro
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={abrirEmail}
            disabled={!email}
            title={email ? undefined : 'Parceiro sem e-mail de contato cadastrado'}
          >
            <Mail className="h-4 w-4" />
            Enviar e-mail ao parceiro
          </Button>
        </div>
      </div>
    </section>
  )
}

function Field({
  label,
  value,
  extra,
}: {
  label: string
  value: string | null | undefined
  extra?: string | null | undefined
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground">{label}</dt>
      <dd className="text-foreground">
        {value ?? '—'}
        {value && extra ? (
          <span className="text-muted-foreground"> · {extra}</span>
        ) : null}
      </dd>
    </div>
  )
}
