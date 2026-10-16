import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUpsertParceiroRow, type ParceiroCrudTable } from '@/features/cadastros/useParceiroCrud'
import { isValidCpf, isValidDocumento, isValidPlaca, isValidTelefone, tipoPessoa } from '@sislog/shared/validators'
import { formatCpf, formatDocumento, formatPlaca, formatTelefone } from '@/lib/utils'
import { Spinner } from '@/components/shared/Spinner'
import { CadastroField } from '@/components/forms/CadastroField'
import { useDescartarAlteracoes } from '@/features/cadastros/useDescartarAlteracoes'

// Listas de tipo replicadas dos cadastros completos (VeiculosPage/CarretasPage).
const TIPOS_VEICULO = ['Cavalo Trucado 3 Eixos', 'Cavalo Trucado 4 Eixos'] as const
const TIPOS_CARRETA = [
  'Caçamba 3 Eixos',
  'Caçamba 4 Eixos',
  'Bi-Trem Caçamba',
  '8 Eixos Caçamba',
  'Rodo-Trem Caçamba',
  'Graneleiro LS 3 Eixos',
  'Graneleiro LS 4 Eixos',
  'Bi-Trem Graneleiro',
  '8 Eixos Graneleiro',
  'Rodo-Trem Graneleiro',
  'Dolly',
] as const

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
  open, onOpenChange, title, description, isSubmitting, alterado, onSubmit, children,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description: string
  isSubmitting: boolean
  /** Formulário editado: fechar pede "Descartar alterações?". */
  alterado: boolean
  onSubmit: () => void
  children: React.ReactNode
}) {
  const guarda = useDescartarAlteracoes(alterado, onOpenChange, isSubmitting)
  return (
    <>
    <Dialog open={open} onOpenChange={guarda.onOpenChange}>
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
          <DialogFooter className="justify-end">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => guarda.onOpenChange(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner />}
                Cadastrar
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {guarda.dialog}
    </>
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
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isDirty } } =
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
      description="Cadastro rápido. Os demais dados podem ser completados depois em Motoristas."
      isSubmitting={upsert.isPending}
      alterado={isDirty}
      onSubmit={submit}
    >
      <CadastroField label="Nome completo" required error={errors.nome_completo?.message}>
        <Input autoFocus {...register('nome_completo')} />
      </CadastroField>
      <div className="grid grid-cols-2 gap-3">
        <CadastroField label="CPF" required error={errors.cpf?.message}>
          <Input
            value={cpf}
            onChange={(e) => setValue('cpf', formatCpf(e.target.value), { shouldValidate: true, shouldDirty: true })}
            placeholder="000.000.000-00"
            inputMode="numeric"
          />
        </CadastroField>
        <CadastroField label="Telefone" error={errors.telefone?.message}>
          <Input
            value={tel}
            onChange={(e) => setValue('telefone', formatTelefone(e.target.value), { shouldValidate: true, shouldDirty: true })}
            placeholder="(00) 00000-0000"
          />
        </CadastroField>
      </div>
    </QuickShell>
  )
}

// --- Veículo / Carreta (mesma estrutura: placa + tipo via Select) -----------

const placaSchema = z.object({
  placa: z.string().min(1, 'Informe a placa').refine(isValidPlaca, 'Placa inválida'),
  tipo: z.string().optional(),
})
type PlacaValues = z.infer<typeof placaSchema>

function QuickCreatePlaca({
  open, onOpenChange, parceiroId, defaultValue, onCreated,
  table, friendlyName, title, tipoOptions,
}: QuickCreateProps & {
  table: Extract<ParceiroCrudTable, 'parceiro_veiculos' | 'parceiro_carretas'>
  friendlyName: string
  title: string
  tipoOptions: readonly string[]
}) {
  const upsert = useUpsertParceiroRow(table, friendlyName, parceiroId)
  const { handleSubmit, reset, setValue, watch, formState: { errors, isDirty } } =
    useForm<PlacaValues>({ resolver: zodResolver(placaSchema) })

  React.useEffect(() => {
    if (open) reset({ placa: defaultValue ? formatPlaca(defaultValue) : '', tipo: '' })
  }, [open, defaultValue, reset])

  const placa = watch('placa') ?? ''
  const tipo = watch('tipo') ?? ''

  const submit = handleSubmit(async (values) => {
    const row = await upsert.mutateAsync({
      values: {
        placa: formatPlaca(values.placa),
        tipo: values.tipo || null,
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
      description="Cadastro rápido. Os demais dados podem ser completados depois."
      isSubmitting={upsert.isPending}
      alterado={isDirty}
      onSubmit={submit}
    >
      <CadastroField label="Placa" required error={errors.placa?.message}>
        <Input
          autoFocus
          value={placa}
          onChange={(e) => setValue('placa', formatPlaca(e.target.value), { shouldValidate: true, shouldDirty: true })}
          placeholder="ABC1D23"
        />
      </CadastroField>
      <CadastroField label="Tipo">
        {(a11y) => (
        <Select
          value={tipo || undefined}
          onValueChange={(v) => setValue('tipo', v, { shouldValidate: true, shouldDirty: true })}
        >
          <SelectTrigger {...a11y}>
            <SelectValue placeholder="Selecionar tipo" />
          </SelectTrigger>
          <SelectContent>
            {tipoOptions.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        )}
      </CadastroField>
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
      tipoOptions={TIPOS_VEICULO}
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
      tipoOptions={TIPOS_CARRETA}
    />
  )
}

// --- Pamcard (numero + apelido) ---------------------------------------------
// Diferente dos demais quick-creates: `onCreated` devolve o NÚMERO do cartão
// (e não o id), porque a solicitação grava o número em `pamcard_numero` — não
// há FK para o cartão. O combobox da Nova Solicitação usa o número como valor.

const pamcardSchema = z.object({
  numero: z
    .string()
    .min(1, 'Informe o número do cartão')
    .refine((v) => /^\d+$/.test(v), 'O Pamcard deve conter apenas números')
    .refine((v) => v.length >= 10, 'O Pamcard deve ter no mínimo 10 dígitos')
    .refine((v) => v.length <= 16, 'O Pamcard deve ter no máximo 16 dígitos'),
  apelido: z.string().optional(),
})
type PamcardValues = z.infer<typeof pamcardSchema>

export function QuickCreatePamcard({ open, onOpenChange, parceiroId, defaultValue, onCreated }: QuickCreateProps) {
  const upsert = useUpsertParceiroRow('parceiro_pamcards', 'Cartão', parceiroId)
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isDirty } } =
    useForm<PamcardValues>({ resolver: zodResolver(pamcardSchema) })

  React.useEffect(() => {
    if (open) reset({ numero: (defaultValue ?? '').replace(/\D/g, '').slice(0, 16), apelido: '' })
  }, [open, defaultValue, reset])

  const numero = watch('numero') ?? ''

  const submit = handleSubmit(async (values) => {
    await upsert.mutateAsync({
      values: {
        numero: values.numero,
        apelido: values.apelido?.trim() || null,
      },
    })
    onCreated(values.numero)
    onOpenChange(false)
  })

  return (
    <QuickShell
      open={open}
      onOpenChange={onOpenChange}
      title="Novo cartão Pamcard"
      description="Cadastro rápido. Os demais dados podem ser completados depois em Cartões Pamcard."
      isSubmitting={upsert.isPending}
      alterado={isDirty}
      onSubmit={submit}
    >
      <CadastroField label="Número do cartão" required error={errors.numero?.message}>
        <Input
          autoFocus
          value={numero}
          onChange={(e) => setValue('numero', e.target.value.replace(/\D/g, '').slice(0, 16), { shouldValidate: true, shouldDirty: true })}
          placeholder="Ex.: 441781209999"
          inputMode="numeric"
          maxLength={16}
        />
      </CadastroField>
      <CadastroField label="Apelido">
        <Input {...register('apelido')} placeholder="Opcional, ex.: Cartão João" />
      </CadastroField>
    </QuickShell>
  )
}

// --- Subcontratada (PF/PJ via documento unificado) --------------------------

const subSchema = z.object({
  razao_social: z.string().min(2, 'Informe a razão social ou nome'),
  documento: z
    .string()
    .min(1, 'Informe o CPF ou CNPJ')
    .refine(isValidDocumento, 'CPF ou CNPJ inválido'),
})
type SubValues = z.infer<typeof subSchema>

export function QuickCreateSubcontratada({ open, onOpenChange, parceiroId, defaultValue, onCreated }: QuickCreateProps) {
  const upsert = useUpsertParceiroRow('parceiro_subcontratadas', 'Subcontratada', parceiroId)
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isDirty } } =
    useForm<SubValues>({ resolver: zodResolver(subSchema) })

  React.useEffect(() => {
    if (open) reset({ razao_social: defaultValue ?? '', documento: '' })
  }, [open, defaultValue, reset])

  const documento = watch('documento') ?? ''

  const submit = handleSubmit(async (values) => {
    const row = await upsert.mutateAsync({
      values: {
        razao_social: values.razao_social.trim(),
        documento: formatDocumento(values.documento),
        tipo_pessoa: tipoPessoa(values.documento),
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
      description="Cadastro rápido (PF ou PJ). Os demais dados podem ser completados depois."
      isSubmitting={upsert.isPending}
      alterado={isDirty}
      onSubmit={submit}
    >
      <CadastroField label="Razão social ou nome" required error={errors.razao_social?.message}>
        <Input autoFocus {...register('razao_social')} />
      </CadastroField>
      <CadastroField label="CPF ou CNPJ" required error={errors.documento?.message}>
        <Input
          value={documento}
          onChange={(e) => setValue('documento', formatDocumento(e.target.value), { shouldValidate: true, shouldDirty: true })}
          placeholder="CPF ou CNPJ"
          inputMode="numeric"
        />
      </CadastroField>
    </QuickShell>
  )
}
