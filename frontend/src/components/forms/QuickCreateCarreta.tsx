import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import type { Tables } from '@/types/database.types'

type Row = Tables<'carretas'>

const TIPOS = [
  'Caçamba 3 Eixos',
  'Caçamba 4 Eixos',
  'Bi-Trem Caçamba',
  'Rodo-Trem Caçamba',
  'Graneleiro LS 3 Eixos',
  'Graneleiro LS 4 Eixos',
  'Bi-Trem Graneleiro',
  'Rodo-Trem Graneleiro',
] as const

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

export function QuickCreateCarreta({ open, onOpenChange, initialPlaca, onCreated }: Props) {
  const upsert = useUpsertRow('carretas', 'Carreta')
  const {
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Cadastrar carreta</DialogTitle>
            <DialogDescription>
              Cadastro rápido da carreta. Vincular subcontratada pode ser feito depois.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qc-car-placa">Placa *</Label>
                <Input
                  id="qc-car-placa"
                  autoFocus
                  value={placa}
                  onChange={(e) => setValue('placa', formatPlaca(e.target.value), { shouldValidate: true })}
                  placeholder="ABC1D23"
                />
                {errors.placa && (
                  <p className="text-[11px] text-destructive">{errors.placa.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={tipo || undefined}
                  onValueChange={(v) => setValue('tipo', v, { shouldValidate: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
