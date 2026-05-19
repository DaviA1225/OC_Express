import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUpsertParceiroRow, type ParceiroCrudTable } from '@/features/cadastros/useParceiroCrud'
import { isValidCpf, isValidCnpj, isValidPlaca, isValidTelefone } from '@sislog/shared/validators'
import { formatCpf, formatCnpj, formatPlaca, formatTelefone } from '@/lib/utils'

interface QuickCreateProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  parceiroId: string | null
  /** Texto digitado na busca do combobox — pré-preenche o campo principal. */
  defaultValue?: string
  /** Recebe o id do registro recém-criado para o combobox já selecioná-lo. */
  onCreated: (id: string) => void
}

/** Casca comum dos diálogos de cadastro rápido. */
function QuickShell({
  open, onOpenChange, title, description, isSubmitting, onSubmit, children,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description: string
  isSubmitting: boolean
  onSubmit: () => void
  children: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px]">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">{children}</DialogBody>
          <DialogFooter>
            <span className="text-[11px] text-muted-foreground/80">Cadastro rápido</span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Cadastrar
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, htmlFor, error, children }: {
  label: string
  htmlFor: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  )
}

function newId(row: unknown): string {
  return (row as { id: string }).id
}

// --- Motorista ---------------------------------------------------------------

const motoristaSchema = z.object({
  nome_completo: z.string().min(2, 'Informe o nome completo'),
  cpf: z.string().min(1, 'Informe o CPF').refine(isValidCpf, 'CPF inválido'),
  telefone: z.string().optional().refine((v) => !v || isValidTelefone(v), 'Telefone inválido'),
})
type MotoristaValues = z.infer<typeof motoristaSchema>

export function QuickCreateMotorista({ open, onOpenChange, parceiroId, defaultValue, onCreated }: QuickCreateProps) {
  const upsert = useUpsertParceiroRow('parceiro_motoristas', 'Motorista', parceiroId)
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } =
    useForm<MotoristaValues>({ resolver: zodResolver(motoristaSchema) })

  React.useEffect(() => {
    if (open) reset({ nome_completo: defaultValue ?? '', cpf: '', telefone: '' })
  }, [open, defaultValue, reset])

  const cpf = watch('cpf') ?? ''
  const tel = watch('telefone') ?? ''

  const submit = handleSubmit(async (values) => {
    const row = await upsert.mutateAsync({
      values: {
        nome_completo: values.nome_completo.trim(),
        cpf: formatCpf(values.cpf),
        telefone: values.telefone ? formatTelefone(values.telefone) : null,
      },
    })
    onCreated(newId(row))
    onOpenChange(false)
  })

  return (
    <QuickShell
      open={open}
      onOpenChange={onOpenChange}
      title="Novo motorista"
      description="Cadastro rápido — você pode completar os dados depois em Motoristas."
      isSubmitting={upsert.isPending}
      onSubmit={submit}
    >
      <Field label="Nome completo *" htmlFor="qc-mot-nome" error={errors.nome_completo?.message}>
        <Input id="qc-mot-nome" autoFocus {...register('nome_completo')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="CPF *" htmlFor="qc-mot-cpf" error={errors.cpf?.message}>
          <Input
            id="qc-mot-cpf"
            value={cpf}
            onChange={(e) => setValue('cpf', formatCpf(e.target.value), { shouldValidate: true })}
            placeholder="000.000.000-00"
            inputMode="numeric"
          />
        </Field>
        <Field label="Telefone" htmlFor="qc-mot-tel" error={errors.telefone?.message}>
          <Input
            id="qc-mot-tel"
            value={tel}
            onChange={(e) => setValue('telefone', formatTelefone(e.target.value), { shouldValidate: true })}
            placeholder="(00) 00000-0000"
          />
        </Field>
      </div>
    </QuickShell>
  )
}

// --- Veículo / Carreta (mesma estrutura: placa + tipo) -----------------------

const placaSchema = z.object({
  placa: z.string().min(1, 'Informe a placa').refine(isValidPlaca, 'Placa inválida'),
  tipo: z.string().optional(),
})
type PlacaValues = z.infer<typeof placaSchema>

function QuickCreatePlaca({
  open, onOpenChange, parceiroId, defaultValue, onCreated,
  table, friendlyName, title, tipoPlaceholder,
}: QuickCreateProps & {
  table: Extract<ParceiroCrudTable, 'parceiro_veiculos' | 'parceiro_carretas'>
  friendlyName: string
  title: string
  tipoPlaceholder: string
}) {
  const upsert = useUpsertParceiroRow(table, friendlyName, parceiroId)
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } =
    useForm<PlacaValues>({ resolver: zodResolver(placaSchema) })

  React.useEffect(() => {
    if (open) reset({ placa: defaultValue ? formatPlaca(defaultValue) : '', tipo: '' })
  }, [open, defaultValue, reset])

  const placa = watch('placa') ?? ''

  const submit = handleSubmit(async (values) => {
    const row = await upsert.mutateAsync({
      values: {
        placa: formatPlaca(values.placa),
        tipo: values.tipo?.trim() || null,
      },
    })
    onCreated(newId(row))
    onOpenChange(false)
  })

  return (
    <QuickShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Cadastro rápido — você pode completar os dados depois."
      isSubmitting={upsert.isPending}
      onSubmit={submit}
    >
      <Field label="Placa *" htmlFor="qc-placa" error={errors.placa?.message}>
        <Input
          id="qc-placa"
          autoFocus
          value={placa}
          onChange={(e) => setValue('placa', formatPlaca(e.target.value), { shouldValidate: true })}
          placeholder="ABC1D23"
        />
      </Field>
      <Field label="Tipo" htmlFor="qc-tipo" error={errors.tipo?.message}>
        <Input id="qc-tipo" {...register('tipo')} placeholder={tipoPlaceholder} />
      </Field>
    </QuickShell>
  )
}

export function QuickCreateVeiculo(props: QuickCreateProps) {
  return (
    <QuickCreatePlaca
      {...props}
      table="parceiro_veiculos"
      friendlyName="Veículo"
      title="Novo veículo"
      tipoPlaceholder="Ex.: Carreta, Truck, Toco"
    />
  )
}

export function QuickCreateCarreta(props: QuickCreateProps) {
  return (
    <QuickCreatePlaca
      {...props}
      table="parceiro_carretas"
      friendlyName="Carreta"
      title="Nova carreta"
      tipoPlaceholder="Ex.: Graneleiro, Caçamba"
    />
  )
}

// --- Subcontratada -----------------------------------------------------------

const subSchema = z.object({
  razao_social: z.string().min(2, 'Informe a razão social'),
  cnpj: z.string().optional().refine((v) => !v || isValidCnpj(v), 'CNPJ inválido'),
})
type SubValues = z.infer<typeof subSchema>

export function QuickCreateSubcontratada({ open, onOpenChange, parceiroId, defaultValue, onCreated }: QuickCreateProps) {
  const upsert = useUpsertParceiroRow('parceiro_subcontratadas', 'Subcontratada', parceiroId)
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } =
    useForm<SubValues>({ resolver: zodResolver(subSchema) })

  React.useEffect(() => {
    if (open) reset({ razao_social: defaultValue ?? '', cnpj: '' })
  }, [open, defaultValue, reset])

  const cnpj = watch('cnpj') ?? ''

  const submit = handleSubmit(async (values) => {
    const row = await upsert.mutateAsync({
      values: {
        razao_social: values.razao_social.trim(),
        cnpj: values.cnpj ? formatCnpj(values.cnpj) : null,
      },
    })
    onCreated(newId(row))
    onOpenChange(false)
  })

  return (
    <QuickShell
      open={open}
      onOpenChange={onOpenChange}
      title="Nova subcontratada"
      description="Cadastro rápido — você pode completar os dados depois."
      isSubmitting={upsert.isPending}
      onSubmit={submit}
    >
      <Field label="Razão social *" htmlFor="qc-sub-razao" error={errors.razao_social?.message}>
        <Input id="qc-sub-razao" autoFocus {...register('razao_social')} />
      </Field>
      <Field label="CNPJ" htmlFor="qc-sub-cnpj" error={errors.cnpj?.message}>
        <Input
          id="qc-sub-cnpj"
          value={cnpj}
          onChange={(e) => setValue('cnpj', formatCnpj(e.target.value), { shouldValidate: true })}
          placeholder="00.000.000/0000-00"
          inputMode="numeric"
        />
      </Field>
    </QuickShell>
  )
}
