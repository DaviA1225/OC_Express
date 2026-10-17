import * as React from 'react'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

/**
 * Proteção de alterações não salvas nos diálogos de cadastro. Use o
 * `onOpenChange` devolvido no `<Dialog>` e no botão Cancelar: com o formulário
 * alterado, fechar (Esc, clique fora, X, Cancelar) pede confirmação antes de
 * descartar. Com `ocupado` (salvamento em andamento) o diálogo não fecha, para
 * não perder o que foi digitado se o salvamento falhar. Depois de salvar, o
 * chamador fecha direto pelo próprio `onOpenChange`, sem passar por aqui.
 */
export function useDescartarAlteracoes(
  alterado: boolean,
  onOpenChange: (open: boolean) => void,
  ocupado = false,
) {
  const [confirmando, setConfirmando] = React.useState(false)

  const guardedOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open && ocupado) return
      if (!open && alterado) {
        setConfirmando(true)
        return
      }
      onOpenChange(open)
    },
    [alterado, ocupado, onOpenChange],
  )

  const dialog = (
    <ConfirmDialog
      open={confirmando}
      onOpenChange={setConfirmando}
      title="Descartar alterações?"
      description="As alterações feitas neste formulário não foram salvas e serão perdidas."
      confirmLabel="Descartar"
      cancelLabel="Continuar editando"
      destructive
      onConfirm={() => onOpenChange(false)}
    />
  )

  return { onOpenChange: guardedOpenChange, dialog }
}
