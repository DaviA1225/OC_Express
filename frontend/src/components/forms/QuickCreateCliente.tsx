import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { useUpsertRow } from '@/features/crud/useCrudQueries'
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

type Row = Tables<'clientes'>

const schema = z.object({
  razao_social: z.string().min(2, 'Informe a razão social'),
  cidade: z.string().optional(),
  uf: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  initialNome?: string
  onCreated: (row: Row) => void
}

export function QuickCreateCliente({ open, onOpenChange, initialNome, onCreated }: Props) {
  const upsert = useUpsertRow('clientes', 'Cliente')
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (open) reset({ razao_social: initialNome ?? '', cidade: '', uf: '' })
  }, [open, initialNome, reset])

  const uf = watch('uf') ?? ''

  const onSubmit = async (values: FormValues) => {
    const created = await upsert.mutateAsync({
      values: {
        razao_social: values.razao_social,
        cidade: values.cidade || null,
        uf: values.uf || null,
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
            <DialogTitle>Cadastrar cliente</DialogTitle>
            <DialogDescription>
              Cadastro rápido. Frete, liberação e tipos de carreta podem ser definidos depois.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="qc-cli-razao">Razão social *</Label>
              <Input id="qc-cli-razao" autoFocus {...register('razao_social')} />
              {errors.razao_social && (
                <p className="text-[11px] text-destructive">{errors.razao_social.message}</p>
              )}
            </div>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qc-cli-cidade">Cidade</Label>
                <Input id="qc-cli-cidade" {...register('cidade')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qc-cli-uf">UF</Label>
                <Input
                  id="qc-cli-uf"
                  value={uf}
                  onChange={(e) => setValue('uf', e.target.value.toUpperCase().slice(0, 2), { shouldValidate: true })}
                  maxLength={2}
                />
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
