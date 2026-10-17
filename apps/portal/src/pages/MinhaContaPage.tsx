import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { Shield, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { registrarEvento } from '@/lib/eventos'
import { Spinner } from '@/components/shared/Spinner'
import { iniciais } from '@/features/auth/perfis'
import { PageHeader } from '@/components/layout/PageHeader'
import { CadastroField } from '@/components/forms/CadastroField'

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

export default function MinhaContaPage() {
  const { parceiroUsuario, user } = useAuth()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader className="mb-0" title="Minha conta" description="Dados de acesso e senha do portal." />

      <section className="flex items-center gap-4 rounded-lg border bg-card p-4">
        <Avatar className="h-12 w-12">
          <AvatarFallback className="bg-accent text-body-lg font-medium text-foreground">
            {iniciais(parceiroUsuario?.nome_completo ?? '')}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-title-sm font-medium text-foreground">
            {parceiroUsuario?.nome_completo ?? 'Usuário'}
          </p>
          <p className="truncate text-body-sm text-muted-foreground">{user?.email}</p>
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
      toast.success('Senha atualizada.')
      reset({ nova: '', confirmar: '' })
      setShowNova(false)
      setShowConf(false)
      void registrarEvento('portal_senha_alterada')
    },
    onError: (e: Error) => toast.error(traduzirErro(e.message)),
  })

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-start gap-2 border-b px-4 py-3">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-tertiary" aria-hidden />
        <div>
          <h2 className="text-body-lg font-medium text-foreground">Segurança</h2>
          <p className="text-meta text-muted-foreground">
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
          <CadastroField label="Nova senha" required id="nova" error={errors.nova?.message}>
            {(a11y) => (
              <PasswordInput
                a11y={a11y}
                show={showNova}
                onToggle={() => setShowNova((v) => !v)}
                register={register('nova')}
              />
            )}
          </CadastroField>
          <CadastroField label="Confirmar senha" required id="confirmar" error={errors.confirmar?.message}>
            {(a11y) => (
              <PasswordInput
                a11y={a11y}
                show={showConf}
                onToggle={() => setShowConf((v) => !v)}
                register={register('confirmar')}
              />
            )}
          </CadastroField>
        </div>
        <p className="text-body-sm text-muted-foreground">
          Sessões já abertas continuam ativas até expirarem. A próxima sessão usará a nova senha.
        </p>
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            Alterar senha
          </Button>
        </div>
      </form>
    </section>
  )
}

interface PasswordInputProps {
  a11y: React.ComponentProps<typeof Input>
  show: boolean
  onToggle: () => void
  register: ReturnType<ReturnType<typeof useForm<SenhaForm>>['register']>
}

function PasswordInput({ a11y, show, onToggle, register }: PasswordInputProps) {
  return (
    <div className="relative">
      <Input
        {...a11y}
        type={show ? 'text' : 'password'}
        autoComplete="new-password"
        className="pr-10"
        {...register}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors duration-fast hover:bg-accent hover:text-foreground"
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
