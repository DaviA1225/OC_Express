/** Loader de tela cheia usado enquanto a sessão/perfil do parceiro carrega. */
export function PortalLoader() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" />
    </div>
  )
}
