import { createContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
}

export interface AuthState {
  user: AuthUser | null
  token: string | null   // Supabase access_token — passed as Bearer in API calls
  isLoading: boolean
}

export interface UseAuthReturn extends AuthState {
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

// ── Context ───────────────────────────────────────────────────────────────────

export const AuthContext = createContext<UseAuthReturn | null>(null)

// ── Provider (mount once in App.tsx) ─────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, token: null, isLoading: true })

  useEffect(() => {
    // Hydrate from Supabase's own session cache (localStorage under the hood).
    // Resolves quickly without a network round-trip for valid, unexpired sessions.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setState({
          user: { id: session.user.id, email: session.user.email! },
          token: session.access_token,
          isLoading: false,
        })
      } else {
        setState({ user: null, token: null, isLoading: false })
      }
    })

    // Keep state in sync for login, logout, and background token refreshes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setState({
          user: { id: session.user.id, email: session.user.email! },
          token: session.access_token,
          isLoading: false,
        })
      } else {
        setState({ user: null, token: null, isLoading: false })
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    // onAuthStateChange fires and updates state automatically
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw new Error(error.message)
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    // onAuthStateChange fires and clears state automatically
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
