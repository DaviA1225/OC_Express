import * as React from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Loader2, Pencil, X } from 'lucide-react'
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
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { SolicitacaoStatusBadge } from '@/components/shared/SolicitacaoStatusBadge'
import { useSolicitacao, useUpdateSolicitacao, useTransitStatus } from '@/features/solicitacoes/useSolicitacoes'
import { canCancel, isEditable } from '@/features/solicitacoes/status'
import { useCrudOptions } from '@/features/crud/useCrudOptions'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
const GerarOCDialog = React.lazy(() =>
  import('@/features/pdf-generator/GerarOCDialog').then((m) => ({ default: m.GerarOCDialog })),
)
const WhatsAppEnvioDialog = React.lazy(() =>
  import('@/features/whatsapp/WhatsAppEnvioDialog').then((m) => ({ default: m.WhatsAppEnvioDialog })),
)
import { formatNumeroOC, formatTelefone } from '@/lib/utils'
import { isValidTelefone } from '@/lib/validators'
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
  const detail = useSolicitacao(id)
  const update = useUpdateSolicitacao()
  const transit = useTransitStatus()

  const [confirmCancel, setConfirmCancel] = React.useState(false)
  const [instrInput, setInstrInput] = React.useState('')
  const [showInstrForm, setShowInstrForm] = React.useState(false)
  const [openGerarOC, setOpenGerarOC] = React.useState(false)
  const [openWhats, setOpenWhats] = React.useState(false)

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
  const editable = isEditable(s.status)

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1 text-[12px] text-muted-foreground">
        <Link to="/solicitacoes" className="hover:text-foreground">Solicitações</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground">{formatNumeroOC(s.numero_interno)}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-medium text-foreground">{formatNumeroOC(s.numero_interno)}</h1>
            <SolicitacaoStatusBadge status={s.status} />
            <span className="text-[12px] uppercase tracking-[0.5px] text-muted-foreground">{s.tipo}</span>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Criada em {format(new Date(s.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusActions
            status={s.status}
            hasInstrucao={!!s.numero_instrucao}
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
            onGerarOC={() => setOpenGerarOC(true)}
            onEnviarWhats={() => setOpenWhats(true)}
            disabled={transit.isPending}
          />
          {canCancel(s.status) && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(true)} className="text-destructive hover:text-destructive">
              <X className="h-4 w-4" />
              Cancelar
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
        </div>

        <div className="space-y-4">
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
  onAdvanceInstrucao: () => void
  onAdvanceFinalizar: () => void
  onMarcarEmCadastro: () => void
  onGerarOC: () => void
  onEnviarWhats: () => void
  disabled: boolean
}

function StatusActions({ status, hasInstrucao, onAdvanceInstrucao, onAdvanceFinalizar, onMarcarEmCadastro, onGerarOC, onEnviarWhats, disabled }: ActionsProps) {
  if (status === 'recebida') {
    return (
      <Button size="sm" variant="outline" onClick={onMarcarEmCadastro} disabled={disabled}>
        Marcar em emissão
      </Button>
    )
  }
  if (status === 'em_cadastro') {
    return (
      <Button size="sm" onClick={onAdvanceInstrucao} disabled={disabled}>
        + Adicionar instrução
      </Button>
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
  if (!hasInstrucao && status !== 'cancelada' && status !== 'finalizada') {
    return (
      <Button size="sm" onClick={onAdvanceInstrucao} disabled={disabled}>
        + Adicionar instrução
      </Button>
    )
  }
  return null
}

function CardShell({
  title, editable, isEditing, onEdit, onCancel, children,
}: {
  title: string
  editable: boolean
  isEditing: boolean
  onEdit: () => void
  onCancel: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border bg-background">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="text-[14px] font-medium text-foreground">{title}</h2>
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
    <CardShell title="Solicitante" editable={editable} isEditing={editing} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)}>
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
        subcontratada_id: subcontratada,
      })
      setEditing(false)
    } finally { setSaving(false) }
  }

  return (
    <CardShell title="Motorista e veículo" editable={editable} isEditing={editing} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)}>
      {!editing ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
          <Field label="Motorista" value={solicitacao.motorista?.nome_completo} />
          <Field label="Subcontratada" value={solicitacao.subcontratada?.razao_social} />
          <Field label="Cavalo" value={solicitacao.veiculo?.placa} />
          <Field label="Carreta" value={solicitacao.carreta?.placa} />
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
              <Label>Carreta</Label>
              <Combobox options={carOpts} value={carreta} onChange={setCarreta}
                placeholder="Opcional" loading={carretas.isLoading} />
            </div>
          </div>
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
    <CardShell title="Destino e material" editable={editable} isEditing={editing} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)}>
      {!editing ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
          <Field label="Cliente" value={solicitacao.cliente?.razao_social} />
          <Field label="Material" value={materialDisplay} />
          <Field label="Local de carregamento" value={solicitacao.local_carregamento ?? solicitacao.material?.origem_padrao ?? null} />
          <Field label="Validade da OC" value={validadeDisplay} />
        </dl>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Combobox options={cliOpts} value={cliente} onChange={setCliente}
              placeholder="Selecionar cliente" loading={clientes.isLoading} />
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
            <Select value={localCarreg || undefined} onValueChange={setLocalCarreg}>
              <SelectTrigger><SelectValue placeholder="Selecionar local" /></SelectTrigger>
              <SelectContent>
                {LOCAIS_CARREGAMENTO.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
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
  return (
    <CardShell title="Instrução e PDF" editable={false} isEditing={false} onEdit={() => {}} onCancel={() => {}}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
        <Field label="Nº Instrução" value={solicitacao.numero_instrucao} />
        <div>
          <dt className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground">PDF</dt>
          <dd>
            {solicitacao.pdf_url ? (
              <a href={solicitacao.pdf_url} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
                Abrir PDF
              </a>
            ) : (
              <span className="text-muted-foreground">— (geração na Fase 5)</span>
            )}
          </dd>
        </div>
      </dl>
    </CardShell>
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
    <CardShell title="Observações" editable={editable} isEditing={editing} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)}>
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

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value ?? '—'}</dd>
    </div>
  )
}
