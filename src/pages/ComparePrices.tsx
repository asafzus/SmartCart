import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import CompareScreen from '../components/CompareScreen'

export default function ComparePrices() {
  const { t, i18n } = useTranslation()
  const isHe = i18n.language === 'he'
  const { token } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background flex flex-col" dir={isHe ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="bg-surface-container-lowest border-b border-outline-variant shadow-sm sticky top-0 z-50">
        <div className="flex items-center px-4 h-16 max-w-5xl mx-auto gap-sm">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors flex-shrink-0"
            aria-label="Back"
          >
            {isHe ? '→' : '←'}
          </button>
          <h1 className="font-jakarta font-bold text-lg text-on-surface">
            {t('compare.title')}
          </h1>
        </div>
      </header>

      {/* Compare screen */}
      <main className="flex-1 overflow-y-auto">
        <CompareScreen token={token!} />
      </main>
    </div>
  )
}
