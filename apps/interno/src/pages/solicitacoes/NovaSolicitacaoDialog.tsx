import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Combobox, type ComboboxOption } from '@/components/shared/Combobox'
import { useCrudOptions } from '@/features/crud/useCrudOptions'
import {
  useCreateSolicitacao,
  findPossibleDuplicate,
  type PossibleDuplicate,
} from '@/features/solicitacoes/useSolicitacoes'
import { STATUS_LABELS } from '@/features/solicitacoes/status'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from 'sonner'
import { formatNumeroOC } from '@/lib/utils'
import { formatDistanceToNowStrict } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { isValidTelefone } from '@/lib/validators'
import { formatTelefone } from '@/lib/utils'
import { QuickCreateMotorista } from '@/components/forms/QuickCreateMotorista'
import { QuickCreateVeiculo } from '@/components/forms/QuickCreateVeiculo'
import { QuickCreateCarreta } from '@/components/forms/QuickCreateCarreta'
import { QuickCreateCliente } from '@/components/forms/QuickCreateCliente'
import type { MaterialSubtipo, SolicitacaoTipo, Tables } from '@/types/database.types'
import { isMineralMaterial } from '@/features/solicitacoes/material'
import { useAuth } from '@/hooks/useAuth'
import { canEditClientes } from '@/features/auth/permissions'
import { useCargasRetorno } from '@/features/cargas-retorno/useCargasRetorno'

type MotoristaOpt = Pick<Tables<'motoristas'>, 'id' | 'nome_completo' | 'cpf'>
type VeiculoOpt = Pick<Tables<'veiculos'>, 'id' | 'placa' | 'tipo' | 'subcontratada_id'>
type CarretaOpt = Pick<Tables<'carretas'>, 'id' | 'placa' | 'tipo'>
type SubcontratadaOpt = Pick<Tables<'subcontratadas'>, 'id' | 'razao_social' | 'documento'>
type ClienteOpt = Pick<Tables<'clientes'>, 'id' | 'razao_social' | 'cidade' | 'uf'>
type MaterialOpt = Pick<Tables<'materiais'>, 'id' | 'nome' | 'filial' | 'origem_padrao'>

const SUBTIPOS: MaterialSubtipo[] = ['SINTER', 'HEMATITA', 'LUMP']
const LOCAIS_CARREGAMENTO = ['TUPACERY', 'URUCUM'] as const

const schema = z
  .object({
    tipo: z.enum(['carregamento', 'retorno']),
    solicitante_nome: z.string().min(2, 'Informe o nome do solicitante'),
    solicitante_telefone: z.string().optional(),
    motorista_id: z.string().min(1, 'Motorista é obrigatório'),
    veiculo_id: z.string().min(1, 'Cavalo é obrigatório'),
    carreta_id: z.string().nullable().optional(),
    primeira_carreta_id: z.string().nullable().optional(),
    dolly_id: z.string().nullable().optional(),
    subcontratada_id: z.string().nullable().optional(),
    cliente_id: z.string().min(1, 'Cliente é obrigatório'),
    material_id: z.string().nullable().optional(),
    material_subtipo: z.enum(['SINTER', 'HEMATITA', 'LUMP']).nullable().optional(),
    local_carregamento: z.string().optional(),
    carga_retorno_id: z.string().nullable().optional(),
    observacoes: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    // Última carreta e subcontratada são obrigatórias na composição (vale para
    // ambos os tipos): a OC precisa da placa da última carreta e de quem é a
    // transportadora subcontratada.
    if (!v.carreta_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['carreta_id'],
        message: 'Última carreta é obrigatória',
      })
    }
    if (!v.subcontratada_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subcontratada_id'],
        message: 'Subcontratada é obrigatória',
      })
    }
    if (v.tipo === 'carregamento') {
      if (!v.solicitante_telefone || !isValidTelefone(v.solicitante_telefone)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['solicitante_telefone'],
          message: 'Telefone obrigatório para Minério',
        })
      }
      if (!v.material_subtipo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['material_subtipo'],
          message: 'Selecione o tipo de minério',
        })
      }
      if (!v.local_carregamento) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['local_carregamento'],
          message: 'Selecione o local de carregamento',
        })
      }
    } else {
      if (v.solicitante_telefone && !isValidTelefone(v.solicitante_telefone)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['solicitante_telefone'],
          message: 'Telefone inválido',
        })
      }
      if (!v.carga_retorno_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['carga_retorno_id'],
          message: 'Selecione a carga de retorno',
        })
      }
    }
  })

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated?: (id: string) => void
}

export function NovaSolicitacaoDialog({ open, onOpenChange, onCreated }: Props) {
  const create = useCreateSolicitacao()
  const { profile } = useAuth()
  // Assistente não pode escrever em clientes (RLS 0025): esconde o atalho de
  // cadastrar cliente novo. Ele escolhe um cliente já cadastrado.
  const podeCriarCliente = canEditClientes(profile)

  const motoristas = useCrudOptions<MotoristaOpt>({
    table: 'motoristas', selectColumns: 'id, nome_completo, cpf', orderBy: 'nome_completo',
  })
  const veiculos = useCrudOptions<VeiculoOpt>({
    table: 'veiculos', selectColumns: 'id, placa, tipo, subcontratada_id', orderBy: 'placa',
  })
  const carretas = useCrudOptions<CarretaOpt>({
    table: 'carretas', selectColumns: 'id, placa, tipo', orderBy: 'placa',
  })
  const subcontratadas = useCrudOptions<SubcontratadaOpt>({
    table: 'subcontratadas', selectColumns: 'id, razao_social, documento', orderBy: 'razao_social',
  })
  const clientes = useCrudOptions<ClienteOpt>({
    table: 'clientes', selectColumns: 'id, razao_social, cidade, uf', orderBy: 'razao_social',
    equals: { cliente_minerio: true },
  })
  const materiais = useCrudOptions<MaterialOpt>({
    table: 'materiais', selectColumns: 'id, nome, filial, origem_padrao', orderBy: 'nome',
  })
  const cargasRetorno = useCargasRetorno()

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (open) {
      reset({
        tipo: 'carregamento',
        solicitante_nome: '',
        solicitante_telefone: '',
        motorista_id: '',
        veiculo_id: '',
        carreta_id: null,
        primeira_carreta_id: null,
        dolly_id: null,
        subcontratada_id: null,
        cliente_id: '',
        material_id: null,
        material_subtipo: null,
        local_carregamento: '',
        carga_retorno_id: null,
        observacoes: '',
      })
    }
  }, [open, reset])

  const tipo = watch('tipo')
  const tel = watch('solicitante_telefone') ?? ''
  const motoristaId = watch('motorista_id')
  const veiculoId = watch('veiculo_id')
  const carretaId = watch('carreta_id') ?? null
  const primeiraCarretaId = watch('primeira_carreta_id') ?? null
  const dollyId = watch('dolly_id') ?? null
  const subcontratadaId = watch('subcontratada_id') ?? null
  const materialSubtipo = watch('material_subtipo') ?? null
  const localCarregamento = watch('local_carregamento') ?? ''
  const cargaRetornoId = watch('carga_retorno_id') ?? null

  const materialMinerio = React.useMemo(
    () => (materiais.data ?? []).find((m) => isMineralMaterial(m.nome)) ?? null,
    [materiais.data],
  )

  React.useEffect(() => {
    if (tipo === 'carregamento' && materialMinerio) {
      setValue('material_id', materialMinerio.id, { shouldValidate: false })
    } else if (tipo === 'retorno') {
      setValue('material_id', null, { shouldValidate: false })
      setValue('material_subtipo', null, { shouldValidate: false })
    }
  }, [tipo, materialMinerio, setValue])

  React.useEffect(() => {
    if (tipo !== 'retorno') return
    const carga = (cargasRetorno.data ?? []).find((c) => c.id === cargaRetornoId)
    if (carga) {
      setValue('cliente_id', carga.cliente_id, { shouldValidate: true })
      setValue('local_carregamento', carga.local_carregamento, { shouldValidate: true })
    }
  }, [tipo, cargaRetornoId, cargasRetorno.data, setValue])

  const veiculoSubAuto = React.useRef<string | null>(null)
  React.useEffect(() => {
    const veic = (veiculos.data ?? []).find((v) => v.id === veiculoId)
    const auto = veic?.subcontratada_id ?? null
    if (!auto) return
    if (!subcontratadaId || subcontratadaId === veiculoSubAuto.current) {
      setValue('subcontratada_id', auto, { shouldValidate: true })
      veiculoSubAuto.current = auto
    }
  }, [veiculoId, veiculos.data, subcontratadaId, setValue])

  const [qcMot, setQcMot] = React.useState<{ open: boolean; nome: string }>({ open: false, nome: '' })
  const [qcVeic, setQcVeic] = React.useState<{ open: boolean; placa: string }>({ open: false, placa: '' })
  const [qcCar, setQcCar] = React.useState<{ open: boolean; placa: string }>({ open: false, placa: '' })
  const [qcPrimCar, setQcPrimCar] = React.useState<{ open: boolean; placa: string }>({ open: false, placa: '' })
  const [qcDolly, setQcDolly] = React.useState<{ open: boolean; placa: string }>({ open: false, placa: '' })
  const [qcCli, setQcCli] = React.useState<{ open: boolean; nome: string }>({ open: false, nome: '' })
  const [pendingDup, setPendingDup] = React.useState<{ values: FormValues; dup: PossibleDuplicate } | null>(null)

  React.useEffect(() => {
    if (!open) setPendingDup(null)
  }, [open])

  const motoristaOptions: ComboboxOption[] = (motoristas.data ?? []).map((m) => ({
    value: m.id, label: m.nome_completo, hint: m.cpf,
  }))
  const veiculoOptions: ComboboxOption[] = (veiculos.data ?? []).map((v) => ({
    value: v.id, label: v.placa, hint: v.tipo ?? undefined,
  }))
  const carretaOptions: ComboboxOption[] = (carretas.data ?? []).map((c) => ({
    value: c.id, label: c.placa, hint: c.tipo ?? undefined,
  }))
  const subcontratadaOptions: ComboboxOption[] = (subcontratadas.data ?? []).map((s) => ({
    value: s.id, label: s.razao_social, hint: s.documento ?? undefined,
  }))
  const clienteOptions: ComboboxOption[] = (clientes.data ?? []).map((c) => ({
    value: c.id,
    label: c.razao_social,
    hint: c.cidade && c.uf ? `${c.cidade}/${c.uf}` : c.cidade ?? c.uf ?? undefined,
  }))
  const cargaRetornoOptions: ComboboxOption[] = (cargasRetorno.data ?? []).map((c) => ({
    value: c.id,
    label: c.cliente?.razao_social ?? '—',
    hint: [c.local_carregamento, c.cliente?.cidade && c.cliente?.uf ? `${c.cliente.cidade}/${c.cliente.uf}` : null]
      .filter(Boolean).join(' · '),
  }))

  const persistSolicitacao = async (values: FormValues) => {
    const isMinerio = values.tipo === 'carregamento'
    let resolvedMaterialId: string | null = isMinerio
      ? values.material_id ?? materialMinerio?.id ?? null
      : null
    if (isMinerio && !resolvedMaterialId) {
      const refetched = await materiais.refetch()
      const found = (refetched.data ?? []).find((m) => isMineralMaterial(m.nome))
      if (!found) {
        toast.error('Material "MINÉRIO" não encontrado no cadastro. Cadastre o material antes de continuar.')
        return
      }
      resolvedMaterialId = found.id
    }
    const created = await create.mutateAsync({
      tipo: values.tipo as SolicitacaoTipo,
      solicitante_nome: values.solicitante_nome,
      solicitante_telefone: values.solicitante_telefone
        ? formatTelefone(values.solicitante_telefone)
        : null,
      motorista_id: values.motorista_id,
      veiculo_id: values.veiculo_id,
      carreta_id: values.carreta_id || null,
      primeira_carreta_id: values.primeira_carreta_id || null,
      dolly_id: values.dolly_id || null,
      subcontratada_id: values.subcontratada_id || null,
      cliente_id: values.cliente_id,
      material_id: resolvedMaterialId,
      material_subtipo: isMinerio ? values.material_subtipo ?? null : null,
      local_carregamento: values.local_carregamento || null,
      // Solicitações internas não usam Pamcard na UI (o cartão é gerenciado no
      // fluxo da OC). Gravar o default do banco mantém a constraint satisfeita
      // e a solicitação fora dos contadores/filtros de pendência (que filtram
      // por origem='parceiro').
      pamcard_status: 'nao_tem_cartao',
      pamcard_numero: null,
      observacoes: values.observacoes || null,
    })
    if (created?.id) onCreated?.(created.id)
    onOpenChange(false)
  }

  const onSubmit = async (values: FormValues) => {
    if (values.motorista_id && values.veiculo_id && values.cliente_id) {
      const dup = await findPossibleDuplicate({
        motoristaId: values.motorista_id,
        veiculoId: values.veiculo_id,
        clienteId: values.cliente_id,
      })
      if (dup) {
        setPendingDup({ values, dup })
        return
      }
    }
    await persistSolicitacao(values)
  }

  const proceedAnyway = async () => {
    if (!pendingDup) return
    const values = pendingDup.values
    setPendingDup(null)
    await persistSolicitacao(values)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[640px]">
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <DialogHeader>
              <DialogTitle>Nova solicitação</DialogTitle>
              <DialogDescription>
                Receba uma solicitação de carregamento ou retorno do WhatsApp.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-5">
              <Section label="Solicitante">
                <div className="space-y-1.5">
                  <Label>Tipo *</Label>
                  <RadioGroup
                    value={tipo}
                    onValueChange={(v) => setValue('tipo', v as SolicitacaoTipo, { shouldValidate: true })}
                    className="flex gap-4"
                  >
                    <label className="flex items-center gap-2 text-[13px]">
                      <RadioGroupItem value="carregamento" />
                      Minério
                    </label>
                    <label className="flex items-center gap-2 text-[13px]">
                      <RadioGroupItem value="retorno" />
                      Retorno
                    </label>
                  </RadioGroup>
                </div>
                <div className="grid grid-cols-[1.4fr_1fr] gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="solicitante_nome">Nome *</Label>
                    <Input id="solicitante_nome" autoFocus {...register('solicitante_nome')} />
                    {errors.solicitante_nome && (
                      <p className="text-[11px] text-destructive">{errors.solicitante_nome.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="solicitante_telefone">
                      Telefone {tipo === 'carregamento' && '*'}
                    </Label>
                    <Input
                      id="solicitante_telefone"
                      value={tel}
                      onChange={(e) => setValue('solicitante_telefone', formatTelefone(e.target.value), { shouldValidate: true })}
                      placeholder="(00) 00000-0000"
                    />
                    {errors.solicitante_telefone && (
                      <p className="text-[11px] text-destructive">{errors.solicitante_telefone.message}</p>
                    )}
                  </div>
                </div>
              </Section>

              <Section label="Motorista e veículo">
                <div className="space-y-1.5">
                  <Label>Motorista *</Label>
                  <Combobox
                    options={motoristaOptions}
                    ariaLabel="Motorista"
                    value={motoristaId || null}
                    onChange={(v) => setValue('motorista_id', v ?? '', { shouldValidate: true })}
                    placeholder="Buscar motorista por nome ou CPF"
                    searchPlaceholder="Buscar motorista"
                    emptyMessage="Nenhum motorista encontrado."
                    loading={motoristas.isLoading}
                    onCreateNew={(s) => setQcMot({ open: true, nome: s })}
                    createNewLabel="Cadastrar novo motorista"
                  />
                  {errors.motorista_id && (
                    <p className="text-[11px] text-destructive">{errors.motorista_id.message}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Cavalo *</Label>
                    <Combobox
                      options={veiculoOptions}
                      ariaLabel="Cavalo"
                      value={veiculoId || null}
                      onChange={(v) => setValue('veiculo_id', v ?? '', { shouldValidate: true })}
                      placeholder="Buscar pela placa"
                      searchPlaceholder="Buscar veículo"
                      emptyMessage="Nenhum veículo encontrado."
                      loading={veiculos.isLoading}
                      onCreateNew={(s) => setQcVeic({ open: true, placa: s })}
                      createNewLabel="Cadastrar novo veículo"
                    />
                    {errors.veiculo_id && (
                      <p className="text-[11px] text-destructive">{errors.veiculo_id.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Última Carreta *</Label>
                    <Combobox
                      options={carretaOptions}
                      value={carretaId}
                      ariaLabel="Última carreta"
                      onChange={(v) => setValue('carreta_id', v, { shouldValidate: true })}
                      placeholder="Buscar pela placa"
                      searchPlaceholder="Buscar carreta"
                      emptyMessage="Nenhuma carreta encontrada."
                      loading={carretas.isLoading}
                      onCreateNew={(s) => setQcCar({ open: true, placa: s })}
                      createNewLabel="Cadastrar nova carreta"
                    />
                    {errors.carreta_id && (
                      <p className="text-[11px] text-destructive">{errors.carreta_id.message}</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>1ª Carreta</Label>
                    <Combobox
                      options={carretaOptions}
                      value={primeiraCarretaId}
                      ariaLabel="Primeira carreta"
                      onChange={(v) => setValue('primeira_carreta_id', v, { shouldValidate: true })}
                      placeholder="Opcional"
                      searchPlaceholder="Buscar carreta"
                      emptyMessage="Nenhuma carreta encontrada."
                      loading={carretas.isLoading}
                      onCreateNew={(s) => setQcPrimCar({ open: true, placa: s })}
                      createNewLabel="Cadastrar nova carreta"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Dolly</Label>
                    <Combobox
                      options={carretaOptions}
                      value={dollyId}
                      ariaLabel="Dolly"
                      onChange={(v) => setValue('dolly_id', v, { shouldValidate: true })}
                      placeholder="Opcional"
                      searchPlaceholder="Buscar dolly"
                      emptyMessage="Nenhuma carreta encontrada."
                      loading={carretas.isLoading}
                      onCreateNew={(s) => setQcDolly({ open: true, placa: s })}
                      createNewLabel="Cadastrar novo dolly"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Preencha 1ª Carreta e Dolly apenas quando a composição tiver esses
                  implementos (ANTT). Em branco, a OC traz só cavalo e última carreta.
                </p>
                <div className="space-y-1.5">
                  <Label>Subcontratada *</Label>
                  <Combobox
                    options={subcontratadaOptions}
                    ariaLabel="Subcontratada"
                    value={subcontratadaId}
                    onChange={(v) => setValue('subcontratada_id', v, { shouldValidate: true })}
                    placeholder="Pré-preenchida pelo cavalo"
                    searchPlaceholder="Buscar subcontratada"
                    emptyMessage="Nenhuma subcontratada encontrada."
                    loading={subcontratadas.isLoading}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Por padrão usa a subcontratada do cavalo. Pode ser ajustada.
                  </p>
                  {errors.subcontratada_id && (
                    <p className="text-[11px] text-destructive">{errors.subcontratada_id.message}</p>
                  )}
                </div>
              </Section>

              {tipo === 'carregamento' ? (
                <Section label="Destino e minério">
                  <div className="space-y-1.5">
                    <Label>Cliente *</Label>
                    <Combobox
                      options={clienteOptions}
                      ariaLabel="Cliente"
                      value={watch('cliente_id') || null}
                      onChange={(v) => setValue('cliente_id', v ?? '', { shouldValidate: true })}
                      placeholder="Buscar cliente"
                      searchPlaceholder="Buscar cliente"
                      emptyMessage="Nenhum cliente encontrado."
                      loading={clientes.isLoading}
                      onCreateNew={podeCriarCliente ? (s) => setQcCli({ open: true, nome: s }) : undefined}
                      createNewLabel="Cadastrar novo cliente"
                    />
                    {errors.cliente_id && (
                      <p className="text-[11px] text-destructive">{errors.cliente_id.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tipo de minério *</Label>
                    <Select
                      value={materialSubtipo ?? undefined}
                      onValueChange={(v) => setValue('material_subtipo', v as MaterialSubtipo, { shouldValidate: true })}
                    >
                      <SelectTrigger aria-label="Tipo de minério">
                        <SelectValue placeholder="SINTER · HEMATITA · LUMP" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBTIPOS.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.material_subtipo && (
                      <p className="text-[11px] text-destructive">{errors.material_subtipo.message}</p>
                    )}
                    {!materialMinerio && (
                      <p className="text-[11px] text-amber-700">
                        Nenhum material "MINÉRIO" cadastrado — verifique o cadastro de materiais.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Local de carregamento *</Label>
                    <Select
                      value={localCarregamento || undefined}
                      onValueChange={(v) => setValue('local_carregamento', v, { shouldValidate: true })}
                    >
                      <SelectTrigger aria-label="Local de carregamento">
                        <SelectValue placeholder="Selecionar local" />
                      </SelectTrigger>
                      <SelectContent>
                        {LOCAIS_CARREGAMENTO.map((l) => (
                          <SelectItem key={l} value={l}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.local_carregamento && (
                      <p className="text-[11px] text-destructive">{errors.local_carregamento.message}</p>
                    )}
                  </div>
                </Section>
              ) : (
                <Section label="Carga de retorno">
                  <div className="space-y-1.5">
                    <Label>Carga de retorno *</Label>
                    <Combobox
                      options={cargaRetornoOptions}
                    ariaLabel="Carga de retorno"
                      value={cargaRetornoId}
                      onChange={(v) => setValue('carga_retorno_id', v, { shouldValidate: true })}
                      placeholder="Buscar carga de retorno"
                      searchPlaceholder="Buscar por cliente ou local"
                      emptyMessage={
                        cargasRetorno.isLoading
                          ? 'Carregando…'
                          : 'Nenhuma carga de retorno cadastrada. Cadastre na página "Cargas de Retorno".'
                      }
                      loading={cargasRetorno.isLoading}
                    />
                    {errors.carga_retorno_id && (
                      <p className="text-[11px] text-destructive">{errors.carga_retorno_id.message}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      O cliente e o local de carregamento vêm da carga de retorno selecionada.
                    </p>
                  </div>
                </Section>
              )}

              <Section label="Observações">
                <Textarea rows={2} {...register('observacoes')} placeholder="Opcional" />
              </Section>
            </DialogBody>
            <DialogFooter>
              <span className="text-[11px] text-muted-foreground/80">
                Enter para salvar · Esc para cancelar
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Salvar solicitação
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <QuickCreateMotorista
        open={qcMot.open}
        onOpenChange={(o) => setQcMot((s) => ({ ...s, open: o }))}
        initialNome={qcMot.nome}
        onCreated={(row) => {
          setValue('motorista_id', row.id, { shouldValidate: true })
          motoristas.refetch()
        }}
      />
      <QuickCreateVeiculo
        open={qcVeic.open}
        onOpenChange={(o) => setQcVeic((s) => ({ ...s, open: o }))}
        initialPlaca={qcVeic.placa}
        onCreated={(row) => {
          setValue('veiculo_id', row.id, { shouldValidate: true })
          veiculos.refetch()
        }}
      />
      <QuickCreateCarreta
        open={qcCar.open}
        onOpenChange={(o) => setQcCar((s) => ({ ...s, open: o }))}
        initialPlaca={qcCar.placa}
        onCreated={(row) => {
          setValue('carreta_id', row.id, { shouldValidate: true })
          carretas.refetch()
        }}
      />
      <QuickCreateCarreta
        open={qcPrimCar.open}
        onOpenChange={(o) => setQcPrimCar((s) => ({ ...s, open: o }))}
        initialPlaca={qcPrimCar.placa}
        onCreated={(row) => {
          setValue('primeira_carreta_id', row.id, { shouldValidate: true })
          carretas.refetch()
        }}
      />
      <QuickCreateCarreta
        open={qcDolly.open}
        onOpenChange={(o) => setQcDolly((s) => ({ ...s, open: o }))}
        initialPlaca={qcDolly.placa}
        onCreated={(row) => {
          setValue('dolly_id', row.id, { shouldValidate: true })
          carretas.refetch()
        }}
      />
      <QuickCreateCliente
        open={qcCli.open}
        onOpenChange={(o) => setQcCli((s) => ({ ...s, open: o }))}
        initialNome={qcCli.nome}
        onCreated={(row) => {
          setValue('cliente_id', row.id, { shouldValidate: true })
          clientes.refetch()
        }}
      />

      {pendingDup && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPendingDup(null)}
          title="Possível solicitação duplicada"
          description={
            `Já existe ${formatNumeroOC(pendingDup.dup.numero_interno)} ` +
            `(${STATUS_LABELS[pendingDup.dup.status]}) com este motorista, veículo e cliente, ` +
            `criada ${formatDistanceToNowStrict(new Date(pendingDup.dup.created_at), { addSuffix: true, locale: ptBR })}. ` +
            `Deseja criar uma nova solicitação mesmo assim?`
          }
          confirmLabel="Sim, criar mesmo assim"
          cancelLabel="Voltar para revisar"
          onConfirm={proceedAnyway}
        />
      )}
    </>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-[0.5px] text-muted-foreground">{label}</p>
      <div className="space-y-3">{children}</div>
    </div>
  )
}
