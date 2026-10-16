import { Spinner } from '@/components/shared/Spinner'

/** Loader de tela cheia usado enquanto a sessão/perfil do parceiro carrega. */
export function PortalLoader() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center text-muted-foreground">
      <Spinner size="md" label="Carregando" />
    </div>
  )
}
