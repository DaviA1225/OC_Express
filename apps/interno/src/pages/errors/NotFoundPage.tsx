import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Compass, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[#1D1E1B] text-primary-foreground shadow-sm">
          <Compass className="h-6 w-6" />
        </div>

        <p className="text-[12px] font-medium uppercase tracking-[2px] text-primary">
          Erro 404
        </p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-foreground">
          Página não encontrada
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
          O endereço que você tentou acessar não existe ou foi movido. Volte para o início
          ou retorne à página anterior.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <Button asChild>
            <Link to="/dashboard">
              <Home className="h-4 w-4" />
              Ir para o Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
