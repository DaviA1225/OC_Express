import * as React from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Combobox, type ComboboxOption } from '@/components/shared/Combobox'
import {
  QuickCreateMotorista,
  QuickCreateVeiculo,
  QuickCreateCarreta,
  QuickCreateSubcontratada,
  QuickCreatePamcard,
} from '@/components/solicitacoes/QuickCreate'
import {
  useMotoristasBase,
  useVeiculosBase,
  useCarretasBase,
  useSubcontratadasBase,
  usePamcardsBase,
  useClientesPublicos,
} from '@/features/solicitacoes/useSolicitacoes'
import { formatarPamcardParaExibicao } from '@sislog/shared/formatters'
import type { PamcardStatus } from '@sislog/shared/types'

import { solicitacaoSchema, type SolicitacaoFormValues } from './solicitacaoForm.schema'

// Reexportado por conveniência para quem já importa o tipo daqui. Reexport de
// *tipo* não viola a regra react-refresh/only-export-components (só valores).
export type { SolicitacaoFormValues } from './solicitacaoForm.schema'

interface SolicitacaoFormProps {
  /** Valores iniciais do formulário (criar = vazios; editar = solicitação atual). */
  defaultValues: SolicitacaoFormValues
  /** id do parceiro logado — usado pelos diálogos de cadastro rápido. */
  parceiroId: string | null
  /** Handler do envio. Recebe os valores já validados. */
  onSubmit: (values: SolicitacaoFormValues) => Promise<void> | void
  /** Texto do botão de envio (idle). */
  submitLabel: string
  /** Texto do botão enquanto envia. */
  submittingLabel?: string
  /** true enquanto a mutation/anexos estão em andamento. */
  submitting: boolean
  /** Destino do botão "Cancelar". */
  cancelTo: string
  /** Slot extra renderizado antes dos botões (ex.: anexos na criação). */
  children?: React.ReactNode
}

/** Formulário compartilhado entre criar e editar uma solicitação do portal.
 *  Mantém os campos, validação e diálogos de cadastro rápido; a página define
 *  o que fazer no envio (insert vs update) e os anexos via `children`. */
export function SolicitacaoForm({
  defaultValues,
  parceiroId,
  onSubmit,
  submitLabel,
  submittingLabel,
  submitting,
  cancelTo,
  children,
}: SolicitacaoFormProps) {
  const motoristas = useMotoristasBase()
  const veiculos = useVeiculosBase()
  const carretas = useCarretasBase()
  const subcontratadas = useSubcontratadasBase()
  const pamcards = usePamcardsBase()
  const clientes = useClientesPublicos()

  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SolicitacaoFormValues>({
    resolver: zodResolver(solicitacaoSchema),
    defaultValues,
  })

  // Estado dos diálogos de cadastro rápido. `null` = fechado; string = texto
  // digitado na busca do combobox que dispara a abertura.
  const [qcMotorista, setQcMotorista] = React.useState<string | null>(null)
  const [qcVeiculo, setQcVeiculo] = React.useState<string | null>(null)
  const [qcCarreta, setQcCarreta] = React.useState<string | null>(null)
  const [qcPrimeiraCarreta, setQcPrimeiraCarreta] = React.useState<string | null>(null)
  const [qcDolly, setQcDolly] = React.useState<string | null>(null)
  const [qcSubcontratada, setQcSubcontratada] = React.useState<string | null>(null)
  const [qcPamcard, setQcPamcard] = React.useState<string | null>(null)

  // Bases podem trazer registros inativos; uma solicitação antiga pode apontar
  // para um já desativado, então mantemos no combobox o id atualmente
  // selecionado mesmo que inativo (não some da edição).
  const visiveis = <T extends { id: string; ativo: boolean }>(
    rows: T[] | undefined,
    selectedId: string,
  ) => (rows ?? []).filter((r) => r.ativo || r.id === selectedId)

  const motoristaOptions: ComboboxOption[] = visiveis(
    motoristas.data,
    watch('parceiro_motorista_id'),
  ).map((m) => ({ value: m.id, label: m.nome_completo, hint: m.cpf }))

  const veiculoOptions: ComboboxOption[] = visiveis(
    veiculos.data,
    watch('parceiro_veiculo_id'),
  ).map((v) => ({ value: v.id, label: v.placa, hint: v.tipo ?? undefined }))

  // Carretas alimentam 3 campos (última, 1ª, dolly); mostra qualquer um já
  // selecionado mesmo se inativo.
  const carretaSelecionadas = [
    watch('parceiro_carreta_id'),
    watch('parceiro_primeira_carreta_id'),
    watch('parceiro_dolly_id'),
  ]
  const carretaOptions: ComboboxOption[] = (carretas.data ?? [])
    .filter((c) => c.ativo || carretaSelecionadas.includes(c.id))
    .map((c) => ({ value: c.id, label: c.placa, hint: c.tipo ?? undefined }))

  const subcontratadaOptions: ComboboxOption[] = visiveis(
    subcontratadas.data,
    watch('parceiro_subcontratada_id'),
  ).map((s) => ({ value: s.id, label: s.razao_social, hint: s.documento ?? undefined }))

  const pamcardOptions: ComboboxOption[] = (pamcards.data ?? [])
    .filter((p) => p.ativo || p.numero === watch('pamcard_numero'))
    .map((p) => ({
      // O valor é o próprio número — é ele que a solicitação grava em pamcard_numero.
      value: p.numero,
      label: p.apelido || formatarPamcardParaExibicao(p.numero),
      hint: p.apelido ? formatarPamcardParaExibicao(p.numero) : undefined,
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
    | 'parceiro_primeira_carreta_id'
    | 'parceiro_dolly_id'
    | 'parceiro_subcontratada_id'
    | 'cliente_id'
  const set = (field: IdField, value: string) =>
    setValue(field, value, { shouldValidate: true })

  const submit = handleSubmit(async (v) => {
    await onSubmit(v)
  })

  return (
    <form onSubmit={submit} className="mt-6 space-y-6" noValidate>
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
            label="Última Carreta *"
            placeholder="Selecionar carreta"
            options={carretaOptions}
            loading={carretas.isLoading}
            value={watch('parceiro_carreta_id')}
            onChange={(val) => set('parceiro_carreta_id', val ?? '')}
            onCreateNew={(s) => setQcCarreta(s)}
            createNewLabel="Cadastrar nova carreta"
            error={errors.parceiro_carreta_id?.message}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ComboField
            label="1ª Carreta"
            placeholder="Selecionar carreta (opcional)"
            options={carretaOptions}
            loading={carretas.isLoading}
            value={watch('parceiro_primeira_carreta_id')}
            onChange={(val) => set('parceiro_primeira_carreta_id', val ?? '')}
            onCreateNew={(s) => setQcPrimeiraCarreta(s)}
            createNewLabel="Cadastrar nova carreta"
          />
          <ComboField
            label="Dolly"
            placeholder="Selecionar dolly (opcional)"
            options={carretaOptions}
            loading={carretas.isLoading}
            value={watch('parceiro_dolly_id')}
            onChange={(val) => set('parceiro_dolly_id', val ?? '')}
            onCreateNew={(s) => setQcDolly(s)}
            createNewLabel="Cadastrar novo dolly"
          />
        </div>
        <p className="text-[12px] text-muted-foreground">
          Preencha 1ª Carreta e Dolly apenas quando a composição tiver esses
          implementos (exigência ANTT). Em branco, a OC traz só cavalo e última carreta.
        </p>
        <ComboField
          label="Subcontratada *"
          placeholder="Selecionar subcontratada"
          options={subcontratadaOptions}
          loading={subcontratadas.isLoading}
          value={watch('parceiro_subcontratada_id')}
          onChange={(val) => set('parceiro_subcontratada_id', val ?? '')}
          onCreateNew={(s) => setQcSubcontratada(s)}
          createNewLabel="Cadastrar nova subcontratada"
          error={errors.parceiro_subcontratada_id?.message}
        />
      </Section>

      <Section title="Destino" description="O cliente é escolhido entre os atendidos pela LHG.">
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
                if (next !== 'tem_cartao') {
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
              <label className="flex items-center gap-2 text-[13px]">
                <RadioGroupItem value="nao_necessario" />
                Não necessário (pagamento por outro meio)
              </label>
            </RadioGroup>
          </div>
          <div className="space-y-1.5">
            <Label>Número do cartão</Label>
            {pamcardStatus === 'tem_cartao' ? (
              <>
                <Combobox
                  options={pamcardOptions}
                  value={pamcardNumero || null}
                  onChange={(val) =>
                    setValue('pamcard_numero', val ?? '', { shouldValidate: true })
                  }
                  placeholder="Selecionar cartão"
                  loading={pamcards.isLoading}
                  onCreateNew={(s) => setQcPamcard(s)}
                  createNewLabel="Cadastrar novo cartão"
                  emptyMessage="Nenhum cartão na sua base."
                />
                {errors.pamcard_numero && (
                  <p className="text-[11px] text-destructive">{errors.pamcard_numero.message}</p>
                )}
              </>
            ) : (
              <p className="pt-2 text-[12px] text-muted-foreground">
                Não se aplica a esta opção.
              </p>
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

      {children}

      <div className="flex items-center justify-end gap-3 border-t pt-5">
        <Button type="button" variant="outline" asChild>
          <Link to={cancelTo}>Cancelar</Link>
        </Button>
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {submitting && submittingLabel ? submittingLabel : submitLabel}
        </Button>
      </div>

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
      <QuickCreateCarreta
        open={qcPrimeiraCarreta !== null}
        onOpenChange={(o) => !o && setQcPrimeiraCarreta(null)}
        parceiroId={parceiroId}
        defaultValue={qcPrimeiraCarreta ?? ''}
        onCreated={(id) => {
          set('parceiro_primeira_carreta_id', id)
          setQcPrimeiraCarreta(null)
        }}
      />
      <QuickCreateCarreta
        open={qcDolly !== null}
        onOpenChange={(o) => !o && setQcDolly(null)}
        parceiroId={parceiroId}
        defaultValue={qcDolly ?? ''}
        onCreated={(id) => {
          set('parceiro_dolly_id', id)
          setQcDolly(null)
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
      <QuickCreatePamcard
        open={qcPamcard !== null}
        onOpenChange={(o) => !o && setQcPamcard(null)}
        parceiroId={parceiroId}
        defaultValue={qcPamcard ?? ''}
        onCreated={(numero) => {
          // QuickCreatePamcard devolve o número (não o id) — é o valor do combobox.
          setValue('pamcard_numero', numero, { shouldValidate: true })
          setQcPamcard(null)
        }}
      />
    </form>
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
