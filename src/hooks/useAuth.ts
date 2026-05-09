import { useContext } from 'react'
import { AuthContext } from '../contexts/AuthContext'

// Re-export types so existing imports keep working
export type { AuthUser, AuthState, UseAuthReturn } from '../contexts/AuthContext'

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be called inside <AuthProvider>')
  return ctx
}
