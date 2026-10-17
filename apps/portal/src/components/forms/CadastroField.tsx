import * as React from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type FieldA11y = {
  id: string
  'aria-invalid'?: true
  'aria-describedby'?: string
  'aria-required'?: true
}

interface CadastroFieldProps {
  label: string
  /** Mostra "(obrigatório)" discreto e marca aria-required no controle. */
  required?: boolean
  /** Dica permanente abaixo do campo. Some quando há erro. */
  hint?: React.ReactNode
  /** Mensagem de erro (react-hook-form: errors.campo?.message). */
  error?: string
  /** id do controle; gerado se omitido. */
  id?: string
  className?: string
  /**
   * O controle. Elemento único (Input/Textarea/SelectTrigger…) recebe id e
   * aria-* automaticamente; para composições, passe uma função e espalhe as
   * props no controle certo.
   */
  children: React.ReactElement | ((a11y: FieldA11y) => React.ReactNode)
}

/**
 * Campo de formulário padrão: rótulo, obrigatório, dica e erro ligados ao
 * controle por aria-describedby/aria-invalid (antes repetido à mão ~40×).
 */
export function CadastroField({ label, required, hint, error, id, className, children }: CadastroFieldProps) {
  const auto = React.useId()
  const fieldId = id ?? `campo-${auto}`
  const hintId = `${fieldId}-dica`
  const errorId = `${fieldId}-erro`
  const describedBy = error ? errorId : hint ? hintId : undefined

  const a11y: FieldA11y = {
    id: fieldId,
    ...(error ? { 'aria-invalid': true as const } : {}),
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    ...(required ? { 'aria-required': true as const } : {}),
  }

  const control =
    typeof children === 'function'
      ? children(a11y)
      : React.cloneElement(children as React.ReactElement<Record<string, unknown>>, a11y)

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={fieldId}>
        {label}
        {required && <span className="ml-1 font-normal text-tertiary">(obrigatório)</span>}
      </Label>
      {control}
      {error ? (
        <p id={errorId} role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-body-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
