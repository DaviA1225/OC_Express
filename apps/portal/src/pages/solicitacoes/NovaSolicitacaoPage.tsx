import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Combobox, type ComboboxOption } from '@/components/shared/Combobox'
import {
  QuickCreateMotorista,
  QuickCreateVeiculo,
  QuickCreateCarreta,
  QuickCreateSubcontratada,
} from '@/components/solicitacoes/QuickCreate'
import { useAuth } from '@/hooks/useAuth'
import {
  useMotoristasBase,
  useVeiculosBase,
  useCarretasBase,
  useSubcontratadasBase,
  useClientesPublicos,
  useCriarSolicitacao,
} from '@/features/solicitacoes/useSolicitacoes'
import type { PamcardStatus } from '@sislog/shared/types'

const schema = z
  .object({
    parceiro_motorista_id: z.string().min(1, 'Selecione o motorista'),
    parceiro_veiculo_id: z.string().min(1, 'Selecione o cavalo'),
    parceiro_carreta_id: z.string(),
    parceiro_subcontratada_id: z.string(),
    cliente_id: z.string().min(1, 'Selecione o cliente'),
    pamcard_status: z.enum(['tem_cartao', 'nao_tem_cartao']),
    pamcard_numero: z.string().optional(),
    observacoes: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.pamcard_status !== 'tem_cartao') return
    const num = (v.pamcard_numero ?? '').trim()
    if (!num) {
      ctx.addIssue({ code: 'custom', path: ['pamcard_numero'], message: 'Informe o número do cartão' })
    } else if (!/^\d+$/.test(num)) {
      ctx.addIssue({ code: 'custom', path: ['pamcard_numero'], message: 'O Pamcard deve conter apenas números' })
    } else if (num.length < 10) {
      ctx.addIssue({ code: 'custom', path: ['pamcard_numero'], message: 'O Pamcard deve ter no mínimo 10 dígitos' })
    } else if (num.length > 16) {
      ctx.addIssue({ code: 'custom', path: ['pamcard_numero'], message: 'O Pamcard deve ter no máximo 16 dígitos' })
    }
  })

type FormValues = z.infer<typeof schema>

export default function NovaSolicitacaoPage() {
  const navigate = useNavigate()
  const { parceiro } = useAuth()
  const parceiroId = parceiro?.id ?? null

  const motoristas = useMotoristasBase()
  const veiculos = useVeiculosBase()
  const carretas = useCarretasBase()
  const subcontratadas = useSubcontratadasBase()
  const clientes = useClientesPublicos()
  const criar = useCriarSolicitacao()

  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      parceiro_motorista_id: '',
      parceiro_veiculo_id: '',
      parceiro_carreta_id: '',
      parceiro_subcontratada_id: '',
      cliente_id: '',
      pamcard_status: 'tem_cartao',
      pamcard_numero: '',
      observacoes: '',
    },
  })

  // Estado dos diálogos de cadastro rápido. `null` = fechado; string = texto
  // digitado na busca do combobox que dispara a abertura.
  const [qcMotorista, setQcMotorista] = React.useState<string | null>(null)
  const [qcVeiculo, setQcVeiculo] = React.useState<string | null>(null)
  const [qcCarreta, setQcCarreta] = React.useState<string | null>(null)
  const [qcSubcontratada, setQcSubcontratada] = React.useState<string | null>(null)

  const ativos = <T extends { id: string; ativo: boolean }>(rows: T[] | undefined) =>
    (rows ?? []).filter((r) => r.ativo)

  const motoristaOptions: ComboboxOption[] = ativos(motoristas.data).map((m) => ({
    value: m.id,
    label: m.nome_completo,
    hint: m.cpf,
  }))
  const veiculoOptions: ComboboxOption[] = ativos(veiculos.data).map((v) => ({
    value: v.id,
    label: v.placa,
    hint: v.tipo ?? undefined,
  }))
  const carretaOptions: ComboboxOption[] = ativos(carretas.data).map((c) => ({
    value: c.id,
    label: c.placa,
    hint: c.tipo ?? undefined,
  }))
  const subcontratadaOptions: ComboboxOption[] = ativos(subcontratadas.data).map((s) => ({
    value: s.id,
    label: s.razao_social,
    hint: s.documento ?? undefined,
  }))
  const clienteOptions: ComboboxOption[] = (clientes.data ?? [])
    .filter((c): c is typeof c & { id: string } => !!c.id)
    .map((c) => ({
      value: c.id,
      label: c.razao_social ?? 'Cliente',
      hint: [c.cidade, c.uf].filter(Boolean).join(' / ') || undefined,
    }))

  const pamcardStatus = watch('pamcard_status')
  const pamcardNumero = watch('pamcard_numero') ?? ''

  // Campos de seleção (combobox) — todos guardam o id como string.
  type IdField =
    | 'parceiro_motorista_id'
    | 'parceiro_veiculo_id'
    | 'parceiro_carreta_id'
    | 'parceiro_subcontratada_id'
    | 'cliente_id'
  const set = (field: IdField, value: string) =>
    setValue(field, value, { shouldValidate: true })

  const onSubmit = handleSubmit(async (v) => {
    let novoId: string | null = null
    try {
      novoId = await criar.mutateAsync({
        parceiro_motorista_id: v.parceiro_motorista_id,
        parceiro_veiculo_id: v.parceiro_veiculo_id,
        parceiro_carreta_id: v.parceiro_carreta_id || null,
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
    toast.success(
      'Solicitação enviada. A equipe LHG processará em breve — você receberá a OC pelo WhatsApp/e-mail.',
    )
    navigate(`/solicitacoes/${novoId}`, { replace: true })
  })

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <Link
        to="/solicitacoes"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para solicitações
      </Link>

      <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
        Nova solicitação
      </h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Preencha os dados do carregamento. A equipe da LHG define o material e
        processa a solicitação.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-6" noValidate>
        <Section
          title="Motorista e veículo"
          description="Selecione da sua frota cadastrada. Não achou? Cadastre na hora."
        >
          <ComboField
            label="Motorista *"
            placeholder="Selecionar motorista"
            options={motoristaOptions}
            loading={motoristas.isLoading}
            value={watch('parceiro_motorista_id')}
            onChange={(val) => set('parceiro_motorista_id', val ?? '')}
            onCreateNew={(s) => setQcMotorista(s)}
            createNewLabel="Cadastrar novo motorista"
            error={errors.parceiro_motorista_id?.message}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <ComboField
              label="Cavalo *"
              placeholder="Selecionar cavalo"
              options={veiculoOptions}
              loading={veiculos.isLoading}
              value={watch('parceiro_veiculo_id')}
              onChange={(val) => set('parceiro_veiculo_id', val ?? '')}
              onCreateNew={(s) => setQcVeiculo(s)}
              createNewLabel="Cadastrar novo veículo"
              error={errors.parceiro_veiculo_id?.message}
            />
            <ComboField
              label="Carreta"
              placeholder="Selecionar carreta (opcional)"
              options={carretaOptions}
              loading={carretas.isLoading}
              value={watch('parceiro_carreta_id')}
              onChange={(val) => set('parceiro_carreta_id', val ?? '')}
              onCreateNew={(s) => setQcCarreta(s)}
              createNewLabel="Cadastrar nova carreta"
            />
          </div>
          <ComboField
            label="Subcontratada"
            placeholder="Selecionar subcontratada (opcional)"
            options={subcontratadaOptions}
            loading={subcontratadas.isLoading}
            value={watch('parceiro_subcontratada_id')}
            onChange={(val) => set('parceiro_subcontratada_id', val ?? '')}
            onCreateNew={(s) => setQcSubcontratada(s)}
            createNewLabel="Cadastrar nova subcontratada"
          />
        </Section>

        <Section
          title="Destino"
          description="O cliente é escolhido entre os atendidos pela LHG."
        >
          <ComboField
            label="Cliente *"
            placeholder="Selecionar cliente"
            options={clienteOptions}
            loading={clientes.isLoading}
            value={watch('cliente_id')}
            onChange={(val) => set('cliente_id', val ?? '')}
            error={errors.cliente_id?.message}
          />
        </Section>

        <Section
          title="Pagamento (Pamcard)"
          description="O motorista tem cartão Pamcard para esta viagem?"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cartão *</Label>
              <RadioGroup
                value={pamcardStatus}
                onValueChange={(v) => {
                  const next = v as PamcardStatus
                  setValue('pamcard_status', next, { shouldValidate: true })
                  if (next === 'nao_tem_cartao') {
                    setValue('pamcard_numero', '', { shouldValidate: true })
                  }
                }}
                className="flex flex-col gap-2 pt-1"
              >
                <label className="flex items-center gap-2 text-[13px]">
                  <RadioGroupItem value="tem_cartao" />
                  Tem cartão
                </label>
                <label className="flex items-center gap-2 text-[13px]">
                  <RadioGroupItem value="nao_tem_cartao" />
                  Não tem cartão (solicitar)
                </label>
              </RadioGroup>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pamcard_numero">Número do cartão</Label>
              <Input
                id="pamcard_numero"
                value={pamcardNumero}
                onChange={(e) =>
                  setValue('pamcard_numero', e.target.value.replace(/\D/g, '').slice(0, 16), {
                    shouldValidate: true,
                  })
                }
                disabled={pamcardStatus !== 'tem_cartao'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={16}
                placeholder="Ex.: 441781209999"
              />
              {errors.pamcard_numero && (
                <p className="text-[11px] text-destructive">{errors.pamcard_numero.message}</p>
              )}
            </div>
          </div>
        </Section>

        <Section
          title="Observações"
          description="Instruções específicas para a equipe da LHG (opcional)."
        >
          <Textarea
            rows={3}
            value={watch('observacoes') ?? ''}
            onChange={(e) => setValue('observacoes', e.target.value)}
            placeholder="Ex.: motorista chega na mina às 14h; carreta nova, primeira viagem…"
          />
        </Section>

        <div className="flex items-center justify-end gap-3 border-t pt-5">
          <Button type="button" variant="outline" asChild>
            <Link to="/solicitacoes">Cancelar</Link>
          </Button>
          <Button type="submit" size="lg" disabled={criar.isPending}>
            {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar solicitação
          </Button>
        </div>
      </form>

      <QuickCreateMotorista
        open={qcMotorista !== null}
        onOpenChange={(o) => !o && setQcMotorista(null)}
        parceiroId={parceiroId}
        defaultValue={qcMotorista ?? ''}
        onCreated={(id) => {
          set('parceiro_motorista_id', id)
          setQcMotorista(null)
        }}
      />
      <QuickCreateVeiculo
        open={qcVeiculo !== null}
        onOpenChange={(o) => !o && setQcVeiculo(null)}
        parceiroId={parceiroId}
        defaultValue={qcVeiculo ?? ''}
        onCreated={(id) => {
          set('parceiro_veiculo_id', id)
          setQcVeiculo(null)
        }}
      />
      <QuickCreateCarreta
        open={qcCarreta !== null}
        onOpenChange={(o) => !o && setQcCarreta(null)}
        parceiroId={parceiroId}
        defaultValue={qcCarreta ?? ''}
        onCreated={(id) => {
          set('parceiro_carreta_id', id)
          setQcCarreta(null)
        }}
      />
      <QuickCreateSubcontratada
        open={qcSubcontratada !== null}
        onOpenChange={(o) => !o && setQcSubcontratada(null)}
        parceiroId={parceiroId}
        defaultValue={qcSubcontratada ?? ''}
        onCreated={(id) => {
          set('parceiro_subcontratada_id', id)
          setQcSubcontratada(null)
        }}
      />
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border bg-background p-5">
      <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function ComboField({
  label,
  placeholder,
  options,
  loading,
  value,
  onChange,
  onCreateNew,
  createNewLabel,
  error,
}: {
  label: string
  placeholder: string
  options: ComboboxOption[]
  loading?: boolean
  value: string
  onChange: (value: string | null) => void
  onCreateNew?: (search: string) => void
  createNewLabel?: string
  error?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Combobox
        options={options}
        value={value || null}
        onChange={onChange}
        placeholder={placeholder}
        loading={loading}
        onCreateNew={onCreateNew}
        createNewLabel={createNewLabel}
        emptyMessage="Nenhum registro na sua base."
      />
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  )
}
