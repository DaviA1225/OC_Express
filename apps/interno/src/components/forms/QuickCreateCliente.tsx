import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Spinner } from '@/components/shared/Spinner'
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
import type { Tables } from '@/types/database.types'
import { CadastroField } from '@/components/forms/CadastroField'
import { useDescartarAlteracoes } from '@/features/crud/useDescartarAlteracoes'

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
  const upsert = useUpsertRow('clientes', { singular: 'Cliente', plural: 'Clientes', genero: 'm' })
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
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
        cliente_minerio: true,
        cliente_retorno: false,
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
            <DialogTitle>Cadastrar cliente</DialogTitle>
            <DialogDescription>
              Cadastro rápido. Frete, liberação e tipos de carreta podem ser definidos depois.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <CadastroField label="Razão social" required id="qc-cli-razao" error={errors.razao_social?.message}>
              <Input autoFocus {...register('razao_social')} />
            </CadastroField>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <CadastroField label="Cidade" id="qc-cli-cidade">
                <Input {...register('cidade')} />
              </CadastroField>
              <CadastroField label="UF" id="qc-cli-uf">
                <Input
                  value={uf}
                  onChange={(e) => setValue('uf', e.target.value.toUpperCase().slice(0, 2), { shouldValidate: true, shouldDirty: true })}
                  maxLength={2}
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
