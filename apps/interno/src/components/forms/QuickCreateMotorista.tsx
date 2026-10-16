import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Spinner } from '@/components/shared/Spinner'
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
import type { Tables } from '@/types/database.types'
import { CadastroField } from '@/components/forms/CadastroField'
import { useDescartarAlteracoes } from '@/features/crud/useDescartarAlteracoes'

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
  const upsert = useUpsertRow('motoristas', { singular: 'Motorista', plural: 'Motoristas', genero: 'm' })
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
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

  const guarda = useDescartarAlteracoes(isDirty, onOpenChange, isSubmitting)

  return (
    <>
    <Dialog open={open} onOpenChange={guarda.onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Cadastrar motorista</DialogTitle>
            <DialogDescription>
              Cadastro rápido. Ajustes finos podem ser feitos depois em Cadastros › Motoristas.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <CadastroField label="Nome completo" required id="qc-mot-nome" error={errors.nome_completo?.message}>
              <Input autoFocus {...register('nome_completo')} />
            </CadastroField>
            <div className="grid grid-cols-2 gap-3">
              <CadastroField label="CPF" required id="qc-mot-cpf" error={errors.cpf?.message}>
                <Input
                  value={cpf}
                  onChange={(e) => setValue('cpf', formatCpf(e.target.value), { shouldValidate: true, shouldDirty: true })}
                  placeholder="000.000.000-00"
                />
              </CadastroField>
              <CadastroField label="Telefone" id="qc-mot-tel" error={errors.telefone?.message}>
                <Input
                  value={tel}
                  onChange={(e) => setValue('telefone', formatTelefone(e.target.value), { shouldValidate: true, shouldDirty: true })}
                  placeholder="(00) 00000-0000"
                />
              </CadastroField>
            </div>
          </DialogBody>
          <DialogFooter className="justify-end">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => guarda.onOpenChange(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner />}
                Salvar
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
