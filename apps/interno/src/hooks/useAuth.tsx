import * as React from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Tables, PerfilUsuario } from '@/types/database.types'

type PerfilRow = Tables<'perfis_usuarios'>

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: PerfilRow | null
  /** A última tentativa de carregar o perfil falhou (erro transitório/rede). */
  profileError: boolean
  loading: boolean
  signIn: (
    email: string,
    password: string,
    captchaToken?: string,
  ) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

async function fetchProfile(userId: string): Promise<PerfilRow | null> {
  const { data, error } = await supabase
    .from('perfis_usuarios')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data as PerfilRow | null
}

// Tenta carregar o perfil com algumas tentativas e backoff. maybeSingle()
// devolve data=null SEM erro quando não há perfil — esse caso não cai aqui,
// só erros reais (rede, 5xx, lock do auth durante refresh do token) repetem.
async function fetchProfileWithRetry(userId: string, attempts = 3): Promise<PerfilRow | null> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchProfile(userId)
    } catch (err) {
      lastErr = err
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)))
      }
    }
  }
  throw lastErr
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [profile, setProfile] = React.useState<PerfilRow | null>(null)
  const [profileError, setProfileError] = React.useState(false)
  const [loading, setLoading] = React.useState(true)

  const loadProfile = React.useCallback(async (currentSession: Session | null) => {
    if (!currentSession?.user) {
      setProfile(null)
      setProfileError(false)
      return
    }
    try {
      const p = await fetchProfileWithRetry(currentSession.user.id)
      setProfile(p)
      setProfileError(false)
    } catch (err) {
      console.error('[useAuth] loadProfile failed after retries', err)
      // NÃO zera um perfil já carregado: um erro transitório (refresh de token,
      // rede) não deve derrubar quem já está logado para "Aguardando liberação".
      // Apenas sinaliza o erro — o ProtectedRoute mostra tela de reconexão
      // quando ainda não há perfil nenhum.
      setProfileError(true)
    }
  }, [])

  React.useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      try {
        await loadProfile(data.session)
      } catch (err) {
        console.error('[useAuth] loadProfile (getSession) failed', err)
      } finally {
        if (active) setLoading(false)
      }
    })

    // Supabase recommends NOT awaiting other supabase calls inside
    // onAuthStateChange — it runs inside an auth lock and can deadlock.
    // Defer with setTimeout(0) so the lock is released before we query.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!active) return
      setSession(s)
      setTimeout(() => {
        if (!active) return
        loadProfile(s)
          .catch((err) => console.error('[useAuth] loadProfile (authChange) failed', err))
          .finally(() => {
            if (active) setLoading(false)
          })
      }, 0)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn: AuthContextValue['signIn'] = async (email, password, captchaToken) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    })
    if (error) return { error: traduzirErroAuth(error.message) }
    return { error: null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setProfileError(false)
  }

  const refreshProfile = async () => {
    await loadProfile(session)
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    profileError,
    loading,
    signIn,
    signOut,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}

// eslint-disable-next-line react-refresh/only-export-components
export function hasPerfil(profile: PerfilRow | null, ...allowed: PerfilUsuario[]): boolean {
  if (!profile || !profile.ativo) return false
  return allowed.includes(profile.perfil)
}

function traduzirErroAuth(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
  if (m.includes('too many requests')) return 'Muitas tentativas. Aguarde alguns instantes.'
  if (m.includes('captcha')) return 'Falha na verificação de segurança. Recarregue a página e tente novamente.'
  return 'Não foi possível entrar. Tente novamente.'
}
