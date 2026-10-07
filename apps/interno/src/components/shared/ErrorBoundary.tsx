import * as React from 'react'
import { RefreshCw, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Segura um erro de renderização para ele não desmontar o app inteiro.
 *
 * Sem isto, qualquer exceção durante o render (ex.: a data vazia que virava
 * `new Date(NaN).toISOString()` no Dashboard) deixava a tela TODA em branco,
 * menu incluído, e só um F5 tirava a pessoa de lá.
 *
 * As rotas são declarativas (<Routes>), então o `errorElement` do React Router
 * não se aplica: o boundary precisa ser um componente de classe, que é o único
 * jeito de o React expor `getDerivedStateFromError`.
 */
interface Props {
  children: React.ReactNode
  /** Quando muda, o erro é descartado. O layout passa o pathname: navegar pelo menu sai da tela quebrada. */
  resetKey?: unknown
  fallback: (props: { error: Error; reset: () => void }) => React.ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.reset()
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) return this.props.fallback({ error: this.state.error, reset: this.reset })
    return this.props.children
  }
}

/**
 * Chunk que não carrega é quase sempre deploy novo: o index.html em memória
 * aponta para arquivos com hash antigo, que a Vercel já não serve. "Tentar de
 * novo" não resolve; só recarregar a página, que busca o index.html atual.
 */
function ehChunkAntigo(error: Error): boolean {
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(
    error.message,
  )
}

/** Tela de erro dentro do layout: menu e cabeçalho continuam funcionando. */
export function ErroDaTela({ error, reset }: { error: Error; reset: () => void }) {
  const atualizado = ehChunkAntigo(error)
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-[24px] font-semibold tracking-tight text-foreground">
          {atualizado ? 'O sistema foi atualizado' : 'Esta tela encontrou um erro'}
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
          {atualizado
            ? 'Uma versão nova foi publicada enquanto você usava o sistema. Recarregue a página para continuar.'
            : 'O restante do sistema continua funcionando: use o menu para ir a outra tela, ou tente abrir esta de novo. Se o erro se repetir, avise o suporte com os detalhes abaixo.'}
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          {!atualizado && (
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              Tentar de novo
            </Button>
          )}
          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" />
            Recarregar página
          </Button>
        </div>

        {!atualizado && <DetalhesTecnicos error={error} />}
      </div>
    </div>
  )
}

/**
 * Última rede, em volta do app inteiro: pega o que escapar do layout (login,
 * cabeçalho, menu). Não usa nada do router, que pode ser justamente o que quebrou.
 */
export function ErroGeral({ error }: { error: Error }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-[24px] font-semibold tracking-tight text-foreground">
          {ehChunkAntigo(error) ? 'O sistema foi atualizado' : 'O sistema encontrou um erro'}
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
          Recarregue a página para continuar. Nenhum dado foi perdido: o que já estava salvo
          continua no sistema.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" onClick={() => window.location.assign('/dashboard')}>
            Ir para o Dashboard
          </Button>
          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" />
            Recarregar página
          </Button>
        </div>
        {!ehChunkAntigo(error) && <DetalhesTecnicos error={error} />}
      </div>
    </div>
  )
}

function DetalhesTecnicos({ error }: { error: Error }) {
  return (
    <details className="mt-8 text-left">
      <summary className="cursor-pointer text-center text-[12px] text-muted-foreground">
        Detalhes técnicos
      </summary>
      <pre className="mt-3 max-h-48 overflow-auto rounded-md border bg-muted/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
        {`${error.name}: ${error.message}\n${window.location.pathname}${window.location.search}`}
      </pre>
    </details>
  )
}
