import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg text-center">
        <p className="font-display text-kpi font-medium tabular-nums text-tertiary" aria-hidden>
          404
        </p>
        <h1 className="mt-2 font-display text-page font-medium text-foreground">
          Página não encontrada
        </h1>
        <p className="mt-3 text-body-lg leading-relaxed text-muted-foreground">
          Endereço inexistente ou removido.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <Button asChild>
            <Link to="/dashboard">
              <Home className="h-4 w-4" />
              Ir para o Painel
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
