import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

interface Props {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: Props) {
  const { user, isLoading } = useAuth()

  // Still checking localStorage — show nothing to avoid flash
  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <span className="text-4xl animate-pulse">🛒</span>
      </div>
    )
  }

  // Not logged in → redirect to login
  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
