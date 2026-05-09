import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'

export default function Register() {
  const { t } = useTranslation()
  const { register } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError(t('auth.passwordTooShort'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'))
      return
    }

    setIsLoading(true)

    try {
      await register(email, password)
      navigate('/')
    } catch (err: any) {
      setError(err.message ?? t('auth.registerError'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-md">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-xl">
          <span className="text-4xl">🛒</span>
          <h1 className="font-jakarta font-bold text-headline-lg text-primary">
            {t('app.name')}
          </h1>
        </div>

        {/* Card */}
        <div className="bg-surface-container-lowest rounded-lg shadow-card p-lg">
          <h2 className="font-jakarta font-semibold text-headline-md text-on-surface mb-lg">
            {t('auth.register')}
          </h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-md">

            {/* Email */}
            <div className="flex flex-col gap-xs">
              <label className="font-jakarta text-label-sm text-on-surface-variant">
                {t('auth.email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="border border-outline-variant rounded-DEFAULT px-md py-sm font-jakarta text-body-md text-on-surface bg-surface-container-lowest focus:outline-none focus:border-primary transition-colors"
                placeholder="you@example.com"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-xs">
              <label className="font-jakarta text-label-sm text-on-surface-variant">
                {t('auth.password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="border border-outline-variant rounded-DEFAULT px-md py-sm font-jakarta text-body-md text-on-surface bg-surface-container-lowest focus:outline-none focus:border-primary transition-colors"
                placeholder="••••••••"
              />
              <span className="font-jakarta text-label-sm text-on-surface-variant">
                {t('auth.passwordHint')}
              </span>
            </div>

            {/* Confirm Password */}
            <div className="flex flex-col gap-xs">
              <label className="font-jakarta text-label-sm text-on-surface-variant">
                {t('auth.confirmPassword')}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="border border-outline-variant rounded-DEFAULT px-md py-sm font-jakarta text-body-md text-on-surface bg-surface-container-lowest focus:outline-none focus:border-primary transition-colors"
                placeholder="••••••••"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="font-jakarta text-label-sm text-error bg-error-container rounded-DEFAULT px-md py-sm">
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="bg-primary text-on-primary font-jakarta font-semibold text-body-md rounded-full py-sm mt-xs hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isLoading ? '...' : t('auth.register')}
            </button>

          </form>
        </div>

        {/* Link to Login */}
        <p className="text-center font-jakarta text-label-sm text-on-surface-variant mt-lg">
          {t('auth.hasAccount')}{' '}
          <Link to="/login" className="text-primary font-semibold hover:underline">
            {t('auth.login')}
          </Link>
        </p>

      </div>
    </div>
  )
}
