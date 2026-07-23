import * as React from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { registrarEvento } from '@/lib/eventos'
import type { Tables, ParceiroPerfil } from '@sislog/shared/types'

export type ParceiroUsuario = Tables<'parceiro_usuarios'>
export type Parceiro = Tables<'parceiros'>

type ParceiroUsuarioJoined = ParceiroUsuario & { parceiro: Parceiro | null }

interface AuthContextValue {
  session: Session | null
  user: User | null
  /** Vínculo do usuário logado com o parceiro. `null` se o login não pertence
   *  a nenhum parceiro ativo (ex.: conta interna usando o portal por engano). */
  parceiroUsuario: ParceiroUsuario | null
  /** Empresa parceira do usuário logado. */
  parceiro: Parceiro | null
  loading: boolean
  signIn: (
    email: string,
    password: string,
    captchaToken?: string,
  ) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

async function fetchParceiroUsuario(
  userId: string,
): Promise<{ parceiroUsuario: ParceiroUsuario; parceiro: Parceiro | null } | null> {
  const { data, error } = await supabase
    .from('parceiro_usuarios')
    .select('*, parceiro:parceiro_id ( * )')
    .eq('user_id', userId)
    .eq('ativo', true)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  if (!data) return null

  const { parceiro, ...parceiroUsuario } = data as unknown as ParceiroUsuarioJoined
  return { parceiroUsuario, parceiro: parceiro ?? null }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [parceiroUsuario, setParceiroUsuario] = React.useState<ParceiroUsuario | null>(null)
  const [parceiro, setParceiro] = React.useState<Parceiro | null>(null)
  const [loading, setLoading] = React.useState(true)

  const loadPerfil = React.useCallback(async (currentSession: Session | null) => {
    if (!currentSession?.user) {
      setParceiroUsuario(null)
      setParceiro(null)
      return
    }
    try {
      const result = await fetchParceiroUsuario(currentSession.user.id)
      setParceiroUsuario(result?.parceiroUsuario ?? null)
      setParceiro(result?.parceiro ?? null)
    } catch {
      setParceiroUsuario(null)
      setParceiro(null)
    }
  }, [])

  React.useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      try {
        await loadPerfil(data.session)
      } catch (err) {
        console.error('[useAuth] loadPerfil (getSession) falhou', err)
      } finally {
        if (active) setLoading(false)
      }
    })

    // Supabase recomenda NÃO aguardar outras chamadas dentro do callback de
    // onAuthStateChange (roda dentro de um lock e pode travar). Adiamos com
    // setTimeout(0) para liberar o lock antes de consultar o banco.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!active) return
      setSession(s)
      setTimeout(() => {
        if (!active) return
        loadPerfil(s)
          .catch((err) => console.error('[useAuth] loadPerfil (authChange) falhou', err))
          .finally(() => {
            if (active) setLoading(false)
          })
      }, 0)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [loadPerfil])

  const signIn: AuthContextValue['signIn'] = async (email, password, captchaToken) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    })
    if (error) {
      void registrarEvento('portal_login_falha', { email_tentado: email })
      return { error: traduzirErroAuth(error.message) }
    }
    void registrarEvento('portal_login')
    return { error: null }
  }

  const signOut = async () => {
    // Logar ANTES do signOut para ainda termos auth.uid() no servidor.
    await registrarEvento('portal_logout')
    await supabase.auth.signOut()
    setSession(null)
    setParceiroUsuario(null)
    setParceiro(null)
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    parceiroUsuario,
    parceiro,
    loading,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}

/** `true` se o usuário logado tem um dos perfis de parceiro informados. */
// eslint-disable-next-line react-refresh/only-export-components
export function hasPerfilParceiro(
  pu: ParceiroUsuario | null,
  ...allowed: ParceiroPerfil[]
): boolean {
  if (!pu || !pu.ativo) return false
  return allowed.includes(pu.perfil)
}

function traduzirErroAuth(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
  if (m.includes('too many requests')) return 'Muitas tentativas. Aguarde alguns instantes.'
  if (m.includes('captcha')) return 'Falha na verificação de segurança. Recarregue a página e tente novamente.'
  return 'Não foi possível entrar. Tente novamente.'
}
