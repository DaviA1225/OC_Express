import { Link, Navigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

/**
 * Primeira tela do SisLog (rota `/`), para quem ainda não entrou: a foto de uma
 * caçamba sendo carregada na mina, o que é o sistema em uma frase, e duas
 * saídas — Entrar (login) e "O que é o SisLog" (`/sobre`, com o apoio por PIX).
 * Quem já tem sessão vai direto ao Painel.
 *
 * Foto: Pexels 29506742 (licença livre para uso comercial), com nome de
 * empresa, número de frota e placa desfocados — o SisLog não tem ligação com
 * quem aparece nela. Regras e véu no bloco "Primeira tela" do index.css.
 */
export default function InicioPage() {
  const { session, loading } = useAuth()

  // Sem piscar a tela para quem já está logado: espera a sessão ser lida.
  if (loading) return <div className="min-h-full bg-[#0B0D10]" />
  if (session) return <Navigate to="/dashboard" replace />

  return (
    <div className="inicio">
      <img
        src="/inicio/mina-1920.webp"
        srcSet="/inicio/mina-1280.webp 1280w, /inicio/mina-1920.webp 1920w"
        sizes="100vw"
        alt=""
        aria-hidden
        className="inicio-foto"
        fetchPriority="high"
        decoding="async"
      />
      <div className="inicio-veu" aria-hidden />

      <header className="inicio-barra">
        <Link to="/" className="flex items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
          <img src="/favicon.svg" alt="" aria-hidden className="h-7 w-7" />
          <span className="font-display text-title font-semibold tracking-tight">SisLog</span>
        </Link>
        <nav aria-label="Principal" className="ml-auto flex items-center gap-6">
          <Link to="/sobre" className="inicio-nav hidden sm:inline">
            O que é o SisLog
          </Link>
          <Link to="/sobre#apoiar" className="inicio-nav hidden md:inline">
            Apoiar
          </Link>
          <Link to="/login" className="inicio-pilula inicio-pilula-sm">
            Entrar
          </Link>
        </nav>
      </header>

      <main className="inicio-centro">
        <h1 className="inicio-titulo">
          <span className="inicio-linha">Acabou a planilha,</span>{' '}
          <span className="inicio-linha" style={{ animationDelay: '90ms' }}>
            carregue com o <span className="text-[#FF5100]">SisLog.</span>
          </span>
        </h1>
        <p className="inicio-sub">
          O sistema de ordens de carregamento da LHG: cadastro reaproveitado, OC em PDF na
          hora, envio pelo WhatsApp e cada carga acompanhada no painel.
        </p>
        <div className="inicio-acoes">
          <Link to="/login" className="inicio-pilula">
            Entrar no SisLog
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link to="/sobre" className="inicio-link">
            O que é o SisLog
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </main>
    </div>
  )
}
