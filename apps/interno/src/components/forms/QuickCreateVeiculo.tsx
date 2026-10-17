import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Spinner } from '@/components/shared/Spinner'
import { useUpsertRow } from '@/features/crud/useCrudQueries'
import { isValidPlaca } from '@/lib/validators'
import { formatPlaca } from '@/lib/utils'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Tables } from '@/types/database.types'
import { CadastroField } from '@/components/forms/CadastroField'
import { useDescartarAlteracoes } from '@/features/crud/useDescartarAlteracoes'

type Row = Tables<'veiculos'>

const TIPOS = ['Cavalo Trucado 3 Eixos', 'Cavalo Trucado 4 Eixos'] as const

const schema = z.object({
  placa: z.string().refine(isValidPlaca, 'Placa inválida'),
  tipo: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  initialPlaca?: string
  onCreated: (row: Row) => void
}

export function QuickCreateVeiculo({ open, onOpenChange, initialPlaca, onCreated }: Props) {
  const upsert = useUpsertRow('veiculos', { singular: 'Veículo', plural: 'Veículos', genero: 'm' })
  const {
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (open) reset({ placa: initialPlaca ? formatPlaca(initialPlaca) : '', tipo: '' })
  }, [open, initialPlaca, reset])

  const placa = watch('placa') ?? ''
  const tipo = watch('tipo') ?? ''

  const onSubmit = async (values: FormValues) => {
    const created = await upsert.mutateAsync({
      values: {
        placa: formatPlaca(values.placa),
        tipo: values.tipo || null,
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
            <DialogTitle>Cadastrar veículo</DialogTitle>
            <DialogDescription>
              Cadastro rápido do cavalo mecânico. Vincular subcontratada pode ser feito depois.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <CadastroField label="Placa" required id="qc-veic-placa" error={errors.placa?.message}>
                <Input
                  autoFocus
                  value={placa}
                  onChange={(e) => setValue('placa', formatPlaca(e.target.value), { shouldValidate: true, shouldDirty: true })}
                  placeholder="ABC1D23"
                />
              </CadastroField>
              <CadastroField label="Tipo" id="qc-vei-tipo">
                {(a11y) => (
                <Select
                  value={tipo || undefined}
                  onValueChange={(v) => setValue('tipo', v, { shouldValidate: true, shouldDirty: true })}
                >
                  <SelectTrigger {...a11y}>
                    <SelectValue placeholder="Selecionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                )}
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
