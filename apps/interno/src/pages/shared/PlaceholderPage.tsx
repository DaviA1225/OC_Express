import { Construction } from 'lucide-react'

interface Props {
  title: string
  description?: string
}

export default function PlaceholderPage({ title, description }: Props) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md rounded-lg border bg-card p-8 text-center">
        <Construction className="mx-auto h-6 w-6 text-tertiary" aria-hidden />
        <h2 className="mt-3 text-title font-medium text-foreground">{title}</h2>
        <p className="mt-1 text-body text-muted-foreground">
          {description ?? 'Esta tela será construída em uma fase futura.'}
        </p>
      </div>
    </div>
  )
}
