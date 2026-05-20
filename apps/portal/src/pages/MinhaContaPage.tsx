import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Shield, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { registrarEvento } from '@/lib/eventos'

const senhaSchema = z
  .object({
    nova: z.string().min(12, 'Use pelo menos 12 caracteres'),
    confirmar: z.string().min(12, 'Use pelo menos 12 caracteres'),
  })
  .refine((d) => d.nova === d.confirmar, {
    message: 'As senhas não coincidem',
    path: ['confirmar'],
  })
type SenhaForm = z.infer<typeof senhaSchema>

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

export default function MinhaContaPage() {
  const { parceiroUsuario, user } = useAuth()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Minha conta</h1>
        <p className="text-[12px] text-muted-foreground">
          Gerencie a senha de acesso ao portal.
        </p>
      </div>

      <section className="flex items-center gap-4 rounded-lg border bg-background p-4">
        <Avatar className="h-12 w-12">
          <AvatarFallback className="bg-primary/10 text-[14px] font-medium text-primary">
            {iniciais(parceiroUsuario?.nome_completo ?? '')}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-foreground">
            {parceiroUsuario?.nome_completo ?? 'Usuário'}
          </p>
          <p className="truncate text-[12px] text-muted-foreground">{user?.email}</p>
        </div>
      </section>

      <SegurancaCard />
    </div>
  )
}

function SegurancaCard() {
  const [showNova, setShowNova] = React.useState(false)
  const [showConf, setShowConf] = React.useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SenhaForm>({
    resolver: zodResolver(senhaSchema),
    defaultValues: { nova: '', confirmar: '' },
  })

  const change = useMutation({
    mutationFn: async (values: SenhaForm) => {
      const { error } = await supabase.auth.updateUser({ password: values.nova })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Senha atualizada')
      reset({ nova: '', confirmar: '' })
      setShowNova(false)
      setShowConf(false)
      void registrarEvento('portal_senha_alterada')
    },
    onError: (e: Error) => toast.error(traduzirErro(e.message)),
  })

  return (
    <section className="rounded-lg border bg-background">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-foreground/80">
          <Shield className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-[14px] font-medium text-foreground">Segurança</h2>
          <p className="text-[11px] text-muted-foreground">
            Senha com no mínimo 12 caracteres. Combine letras, números e símbolos.
          </p>
        </div>
      </header>
      <form
        onSubmit={handleSubmit((v) => change.mutateAsync(v))}
        className="space-y-4 p-4"
        noValidate
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="nova">Nova senha *</Label>
            <PasswordInput
              id="nova"
              show={showNova}
              onToggle={() => setShowNova((v) => !v)}
              register={register('nova')}
            />
            {errors.nova && (
              <p className="text-[11px] text-destructive">{errors.nova.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmar">Confirmar senha *</Label>
            <PasswordInput
              id="confirmar"
              show={showConf}
              onToggle={() => setShowConf((v) => !v)}
              register={register('confirmar')}
            />
            {errors.confirmar && (
              <p className="text-[11px] text-destructive">{errors.confirmar.message}</p>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Sessões já abertas continuam ativas até expirarem. Sua próxima sessão usará a nova senha.
        </p>
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Alterar senha
          </Button>
        </div>
      </form>
    </section>
  )
}

interface PasswordInputProps {
  id: string
  show: boolean
  onToggle: () => void
  register: ReturnType<ReturnType<typeof useForm<SenhaForm>>['register']>
}

function PasswordInput({ id, show, onToggle, register }: PasswordInputProps) {
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        autoComplete="new-password"
        className="pr-10"
        {...register}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

// O Supabase devolve erros tecnicos; traduzimos os mais comuns ao usuario.
function traduzirErro(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('password should be at least')) {
    return 'A senha precisa ter no mínimo 12 caracteres.'
  }
  if (m.includes('same as the old password')) {
    return 'A nova senha precisa ser diferente da atual.'
  }
  if (m.includes('weak password')) {
    return 'Senha muito fraca. Combine letras, números e símbolos.'
  }
  return 'Não foi possível alterar a senha. Tente novamente.'
}
