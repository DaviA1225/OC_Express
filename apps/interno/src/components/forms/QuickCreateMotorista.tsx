import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { useUpsertRow } from '@/features/crud/useCrudQueries'
import { isValidCpf, isValidTelefone } from '@/lib/validators'
import { formatCpf, formatTelefone } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Tables } from '@/types/database.types'

type Row = Tables<'motoristas'>

const schema = z.object({
  nome_completo: z.string().min(2, 'Informe o nome completo'),
  cpf: z.string().refine(isValidCpf, 'CPF inválido'),
  telefone: z
    .string()
    .optional()
    .refine((v) => !v || isValidTelefone(v), 'Telefone inválido'),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  initialNome?: string
  onCreated: (row: Row) => void
}

export function QuickCreateMotorista({ open, onOpenChange, initialNome, onCreated }: Props) {
  const upsert = useUpsertRow('motoristas', 'Motorista')
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (open) reset({ nome_completo: initialNome ?? '', cpf: '', telefone: '' })
  }, [open, initialNome, reset])

  const cpf = watch('cpf') ?? ''
  const tel = watch('telefone') ?? ''

  const onSubmit = async (values: FormValues) => {
    const created = await upsert.mutateAsync({
      values: {
        nome_completo: values.nome_completo,
        cpf: formatCpf(values.cpf),
        telefone: values.telefone ? formatTelefone(values.telefone) : null,
      },
    })
    if (created) onCreated(created as Row)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Cadastrar motorista</DialogTitle>
            <DialogDescription>
              Cadastro rápido. Ajustes finos podem ser feitos depois em Cadastros › Motoristas.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="qc-mot-nome">Nome completo *</Label>
              <Input id="qc-mot-nome" autoFocus {...register('nome_completo')} />
              {errors.nome_completo && (
                <p className="text-[11px] text-destructive">{errors.nome_completo.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qc-mot-cpf">CPF *</Label>
                <Input
                  id="qc-mot-cpf"
                  value={cpf}
                  onChange={(e) => setValue('cpf', formatCpf(e.target.value), { shouldValidate: true })}
                  placeholder="000.000.000-00"
                />
                {errors.cpf && <p className="text-[11px] text-destructive">{errors.cpf.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qc-mot-tel">Telefone</Label>
                <Input
                  id="qc-mot-tel"
                  value={tel}
                  onChange={(e) => setValue('telefone', formatTelefone(e.target.value), { shouldValidate: true })}
                  placeholder="(00) 00000-0000"
                />
                {errors.telefone && (
                  <p className="text-[11px] text-destructive">{errors.telefone.message}</p>
                )}
              </div>
            </div>
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
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
