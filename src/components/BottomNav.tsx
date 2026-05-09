import { useTranslation } from 'react-i18next'

export type NavTab = 'list' | 'categories'

interface Props {
  active: NavTab
  onSelect: (tab: NavTab) => void
}

export default function BottomNav({ active, onSelect }: Props) {
  const { t } = useTranslation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface-container-lowest border-t border-outline-variant rounded-t-2xl shadow-[0_-4px_12px_rgba(0,0,0,0.05)] flex justify-around items-center px-4 py-3">
      {/* Lists tab */}
      <button
        onClick={() => onSelect('list')}
        className={`flex flex-col items-center justify-center rounded-xl px-8 py-1.5 transition-all active:scale-90
          ${active === 'list'
            ? 'bg-primary/10 text-primary'
            : 'text-on-surface-variant hover:text-primary'
          }`}
      >
        <span className="text-2xl leading-none mb-0.5">🛒</span>
        <span className="font-jakarta text-xs font-semibold">{t('nav.lists')}</span>
      </button>

      {/* Categories tab */}
      <button
        onClick={() => onSelect('categories')}
        className={`flex flex-col items-center justify-center rounded-xl px-8 py-1.5 transition-all active:scale-90
          ${active === 'categories'
            ? 'bg-primary/10 text-primary'
            : 'text-on-surface-variant hover:text-primary'
          }`}
      >
        <span className="text-2xl leading-none mb-0.5">🏷️</span>
        <span className="font-jakarta text-xs font-semibold">{t('nav.categories')}</span>
      </button>
    </nav>
  )
}
