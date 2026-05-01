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
import { useCreateSolicitacao } from '@/features/solicitacoes/useSolicitacoes'
import { isValidTelefone } from '@/lib/validators'
import { formatTelefone } from '@/lib/utils'
import { QuickCreateMotorista } from '@/components/forms/QuickCreateMotorista'
import { QuickCreateVeiculo } from '@/components/forms/QuickCreateVeiculo'
import { QuickCreateCarreta } from '@/components/forms/QuickCreateCarreta'
import { QuickCreateCliente } from '@/components/forms/QuickCreateCliente'
import type { SolicitacaoTipo, Tables } from '@/types/database.types'

type MotoristaOpt = Pick<Tables<'motoristas'>, 'id' | 'nome_completo' | 'cpf'>
type VeiculoOpt = Pick<Tables<'veiculos'>, 'id' | 'placa' | 'tipo'>
type CarretaOpt = Pick<Tables<'carretas'>, 'id' | 'placa' | 'tipo'>
type ClienteOpt = Pick<Tables<'clientes'>, 'id' | 'razao_social' | 'cidade' | 'uf'>
type MaterialOpt = Pick<Tables<'materiais'>, 'id' | 'nome' | 'filial'>

const schema = z
  .object({
    tipo: z.enum(['carregamento', 'retorno']),
    solicitante_nome: z.string().min(2, 'Informe o nome do solicitante'),
    solicitante_telefone: z.string().optional(),
    motorista_id: z.string().min(1, 'Motorista é obrigatório'),
    veiculo_id: z.string().min(1, 'Cavalo é obrigatório'),
    carreta_id: z.string().nullable().optional(),
    cliente_id: z.string().min(1, 'Cliente é obrigatório'),
    material_id: z.string().min(1, 'Material é obrigatório'),
    observacoes: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === 'carregamento') {
      if (!v.solicitante_telefone || !isValidTelefone(v.solicitante_telefone)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['solicitante_telefone'],
          message: 'Telefone obrigatório para Carregamento',
        })
      }
    } else if (v.solicitante_telefone && !isValidTelefone(v.solicitante_telefone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['solicitante_telefone'],
        message: 'Telefone inválido',
      })
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

  const motoristas = useCrudOptions<MotoristaOpt>({
    table: 'motoristas', selectColumns: 'id, nome_completo, cpf', orderBy: 'nome_completo',
  })
  const veiculos = useCrudOptions<VeiculoOpt>({
    table: 'veiculos', selectColumns: 'id, placa, tipo', orderBy: 'placa',
  })
  const carretas = useCrudOptions<CarretaOpt>({
    table: 'carretas', selectColumns: 'id, placa, tipo', orderBy: 'placa',
  })
  const clientes = useCrudOptions<ClienteOpt>({
    table: 'clientes', selectColumns: 'id, razao_social, cidade, uf', orderBy: 'razao_social',
  })
  const materiais = useCrudOptions<MaterialOpt>({
    table: 'materiais', selectColumns: 'id, nome, filial', orderBy: 'nome',
  })

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
        cliente_id: '',
        material_id: '',
        observacoes: '',
      })
    }
  }, [open, reset])

  const tipo = watch('tipo')
  const tel = watch('solicitante_telefone') ?? ''
  const motoristaId = watch('motorista_id')
  const veiculoId = watch('veiculo_id')
  const carretaId = watch('carreta_id') ?? null
  const clienteId = watch('cliente_id')
  const materialId = watch('material_id')

  const [qcMot, setQcMot] = React.useState<{ open: boolean; nome: string }>({ open: false, nome: '' })
  const [qcVeic, setQcVeic] = React.useState<{ open: boolean; placa: string }>({ open: false, placa: '' })
  const [qcCar, setQcCar] = React.useState<{ open: boolean; placa: string }>({ open: false, placa: '' })
  const [qcCli, setQcCli] = React.useState<{ open: boolean; nome: string }>({ open: false, nome: '' })

  const motoristaOptions: ComboboxOption[] = (motoristas.data ?? []).map((m) => ({
    value: m.id, label: m.nome_completo, hint: m.cpf,
  }))
  const veiculoOptions: ComboboxOption[] = (veiculos.data ?? []).map((v) => ({
    value: v.id, label: v.placa, hint: v.tipo ?? undefined,
  }))
  const carretaOptions: ComboboxOption[] = (carretas.data ?? []).map((c) => ({
    value: c.id, label: c.placa, hint: c.tipo ?? undefined,
  }))
  const clienteOptions: ComboboxOption[] = (clientes.data ?? []).map((c) => ({
    value: c.id,
    label: c.razao_social,
    hint: c.cidade && c.uf ? `${c.cidade}/${c.uf}` : c.cidade ?? c.uf ?? undefined,
  }))

  const onSubmit = async (values: FormValues) => {
    const created = await create.mutateAsync({
      tipo: values.tipo as SolicitacaoTipo,
      solicitante_nome: values.solicitante_nome,
      solicitante_telefone: values.solicitante_telefone
        ? formatTelefone(values.solicitante_telefone)
        : null,
      motorista_id: values.motorista_id,
      veiculo_id: values.veiculo_id,
      carreta_id: values.carreta_id || null,
      cliente_id: values.cliente_id,
      material_id: values.material_id,
      observacoes: values.observacoes || null,
    })
    if (created?.id) onCreated?.(created.id)
    onOpenChange(false)
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
                      Carregamento
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
                    <Label>Carreta</Label>
                    <Combobox
                      options={carretaOptions}
                      value={carretaId}
                      onChange={(v) => setValue('carreta_id', v, { shouldValidate: true })}
                      placeholder="Opcional"
                      searchPlaceholder="Buscar carreta"
                      emptyMessage="Nenhuma carreta encontrada."
                      loading={carretas.isLoading}
                      onCreateNew={(s) => setQcCar({ open: true, placa: s })}
                      createNewLabel="Cadastrar nova carreta"
                    />
                  </div>
                </div>
              </Section>

              <Section label="Destino e material">
                <div className="space-y-1.5">
                  <Label>Cliente *</Label>
                  <Combobox
                    options={clienteOptions}
                    value={clienteId || null}
                    onChange={(v) => setValue('cliente_id', v ?? '', { shouldValidate: true })}
                    placeholder="Buscar cliente"
                    searchPlaceholder="Buscar cliente"
                    emptyMessage="Nenhum cliente encontrado."
                    loading={clientes.isLoading}
                    onCreateNew={(s) => setQcCli({ open: true, nome: s })}
                    createNewLabel="Cadastrar novo cliente"
                  />
                  {errors.cliente_id && (
                    <p className="text-[11px] text-destructive">{errors.cliente_id.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Material *</Label>
                  <Select
                    value={materialId || undefined}
                    onValueChange={(v) => setValue('material_id', v, { shouldValidate: true })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar material" />
                    </SelectTrigger>
                    <SelectContent>
                      {(materiais.data ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome} <span className="text-muted-foreground">· {m.filial}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.material_id && (
                    <p className="text-[11px] text-destructive">{errors.material_id.message}</p>
                  )}
                </div>
              </Section>

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
      <QuickCreateCliente
        open={qcCli.open}
        onOpenChange={(o) => setQcCli((s) => ({ ...s, open: o }))}
        initialNome={qcCli.nome}
        onCreated={(row) => {
          setValue('cliente_id', row.id, { shouldValidate: true })
          clientes.refetch()
        }}
      />
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
