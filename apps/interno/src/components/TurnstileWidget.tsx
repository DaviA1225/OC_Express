import * as React from 'react'

// Widget Cloudflare Turnstile (CAPTCHA) para o login. Defesa nativa contra
// brute force: o Supabase Auth valida o `captchaToken` no endpoint de token
// quando o captcha está habilitado no Dashboard (Auth → Attack Protection).
//
// Rollout seguro: este componente só é renderizado quando a env
// `VITE_TURNSTILE_SITE_KEY` está setada. Sem a chave, o login segue como antes
// (nenhum token é exigido) — o gate real acontece no Supabase.

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileRenderOptions {
  sitekey: string
  callback?: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: () => void
  theme?: 'auto' | 'light' | 'dark'
  action?: string
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: TurnstileRenderOptions) => string
      reset: (id?: string) => void
      remove: (id?: string) => void
    }
  }
}

// Carrega o script uma única vez, mesmo com múltiplos widgets/re-montagens.
let scriptPromise: Promise<void> | null = null
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => {
      scriptPromise = null // permite nova tentativa em recarga futura
      reject(new Error('Falha ao carregar o Turnstile'))
    }
    document.head.appendChild(s)
  })
  return scriptPromise
}

export interface TurnstileHandle {
  /** Descarta o token atual e emite um novo desafio (tokens são de uso único). */
  reset: () => void
}

interface TurnstileWidgetProps {
  siteKey: string
  onVerify: (token: string) => void
  onExpire?: () => void
  onError?: () => void
  theme?: 'auto' | 'light' | 'dark'
  action?: string
}

export const TurnstileWidget = React.forwardRef<TurnstileHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ siteKey, onVerify, onExpire, onError, theme = 'auto', action }, ref) {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const widgetIdRef = React.useRef<string | null>(null)

    // Mantém os callbacks mais recentes sem re-renderizar o widget.
    const cbs = React.useRef({ onVerify, onExpire, onError })
    cbs.current = { onVerify, onExpire, onError }

    React.useImperativeHandle(
      ref,
      () => ({
        reset: () => {
          if (widgetIdRef.current && window.turnstile) {
            window.turnstile.reset(widgetIdRef.current)
          }
        },
      }),
      [],
    )

    React.useEffect(() => {
      let cancelled = false
      loadTurnstileScript()
        .then(() => {
          if (cancelled || !containerRef.current || !window.turnstile) return
          if (widgetIdRef.current) return // já renderizado (guarda p/ StrictMode)
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            theme,
            action,
            callback: (token) => cbs.current.onVerify(token),
            'expired-callback': () => cbs.current.onExpire?.(),
            'error-callback': () => cbs.current.onError?.(),
          })
        })
        .catch(() => cbs.current.onError?.())

      return () => {
        cancelled = true
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current)
          widgetIdRef.current = null
        }
      }
    }, [siteKey, theme, action])

    return <div ref={containerRef} className="flex justify-center" />
  },
)
