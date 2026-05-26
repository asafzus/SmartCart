import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import BottomNav, { type NavTab } from '../components/BottomNav'
import CategoryManager from '../components/CategoryManager'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Category {
  id: string
  nameHe: string
  nameEn: string
  emoji: string
  color: string
  isOwned: boolean
}

export interface ListItem {
  id: string
  barcode: string | null
  freeText: string | null
  name: string
  brand: string | null
  size: string | null
  categoryId: string | null
  categoryName: string | null
  categoryNameEn: string | null
  categoryEmoji: string | null
  categoryColor: string | null
  qty: number
  unit: string
  note: string | null
  isChecked: boolean
  isFreeText: boolean
}


// ── CategoryCard ──────────────────────────────────────────────────────────────

interface CategoryCardProps {
  category: Category
  items: ListItem[]
  isHe: boolean
  onToggle: (item: ListItem) => void
  onDelete: (id: string) => void
  onAddItem: () => void
}

function CategoryCard({ category, items, isHe, onToggle, onDelete, onAddItem }: CategoryCardProps) {
  const { t } = useTranslation()

  return (
    <section className="bg-surface-container-lowest rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden">
      {/* Card header */}
      <div className="p-md flex items-center justify-between border-b border-outline-variant bg-surface-container-low">
        <div className="flex items-center gap-sm min-w-0">
          <div className="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center text-xl flex-shrink-0">
            {category.emoji}
          </div>
          <h3 className="font-jakarta font-semibold text-base text-on-surface truncate">
            {isHe ? category.nameHe : category.nameEn}
          </h3>
        </div>
        <button
          onClick={onAddItem}
          className="text-primary font-jakarta text-label-sm font-semibold flex items-center gap-1 px-sm py-1 rounded-lg hover:bg-primary/10 transition-colors flex-shrink-0"
        >
          + {t('list.addItem')}
        </button>
      </div>

      {/* Items */}
      <div className="p-md space-y-sm">
        {items.length === 0 ? (
          <p className="font-jakarta text-label-sm text-on-surface-variant text-center py-sm">
            {t('list.emptyHint')}
          </p>
        ) : (
          items.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </section>
  )
}

// ── ItemRow ───────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: ListItem
  onToggle: (item: ListItem) => void
  onDelete: (id: string) => void
}

function ItemRow({ item, onToggle, onDelete }: ItemRowProps) {
  const [showDelete, setShowDelete] = useState(false)

  return (
    <div
      className={`flex items-center gap-sm p-sm rounded-lg hover:bg-surface-container transition-colors group ${item.isChecked ? 'opacity-60' : ''}`}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(item)}
        className={`w-6 h-6 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-colors
          ${item.isChecked ? 'bg-primary border-primary text-on-primary' : 'border-outline'}`}
      >
        {item.isChecked && <span className="text-xs font-bold">✓</span>}
      </button>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <span className={`font-jakarta text-body-md text-on-surface block truncate ${item.isChecked ? 'line-through' : ''}`}>
          {item.name}
          {item.qty > 1 && (
            <span className="text-on-surface-variant text-sm ml-1">×{item.qty}</span>
          )}
        </span>
      </div>

      {/* Delete (visible on hover) */}
      <button
        onClick={() => onDelete(item.id)}
        className={`text-on-surface-variant hover:text-error transition-all flex-shrink-0 text-sm ${showDelete ? 'opacity-100' : 'opacity-0'}`}
        tabIndex={-1}
      >
        🗑️
      </button>
    </div>
  )
}

// ── Settings overlay ──────────────────────────────────────────────────────────

interface SettingsOverlayProps {
  onClose: () => void
}

function SettingsOverlay({ onClose }: SettingsOverlayProps) {
  const { t, i18n } = useTranslation()
  const isHe = i18n.language === 'he'

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 bg-surface-container-lowest rounded-t-2xl z-50 p-lg shadow-xl" dir={isHe ? 'rtl' : 'ltr'}>
        <div className="w-10 h-1 rounded-full bg-outline-variant mx-auto mb-lg" />
        <h2 className="font-jakarta font-bold text-headline-sm text-on-surface mb-md">
          {t('settings.title')}
        </h2>

        {/* Language toggle */}
        <div className="bg-surface-container rounded-lg p-md flex items-center justify-between mb-sm">
          <span className="font-jakarta text-body-md text-on-surface">{t('settings.language')}</span>
          <button
            onClick={() => i18n.changeLanguage(isHe ? 'en' : 'he')}
            className="font-jakarta text-label-sm font-semibold text-primary bg-primary/10 px-md py-xs rounded-full hover:bg-primary/20 transition-colors"
          >
            {isHe ? t('settings.langEn') : t('settings.langHe')}
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-md py-sm font-jakarta text-body-md font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
        >
          {t('item.cancel')}
        </button>
      </div>
    </>
  )
}

// ── Account overlay ───────────────────────────────────────────────────────────

interface AccountOverlayProps {
  onClose: () => void
  onLogout: () => void
  telegramLinked: boolean
  onUnlink: () => void
}

function AccountOverlay({ onClose, onLogout, telegramLinked, onUnlink }: AccountOverlayProps) {
  const { t, i18n } = useTranslation()
  const isHe = i18n.language === 'he'
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 bg-surface-container-lowest rounded-t-2xl z-50 p-lg shadow-xl" dir={isHe ? 'rtl' : 'ltr'}>
        <div className="w-10 h-1 rounded-full bg-outline-variant mx-auto mb-lg" />
        <h2 className="font-jakarta font-bold text-headline-sm text-on-surface mb-md">
          {t('settings.account')}
        </h2>

        <div className="bg-surface-container rounded-lg p-md mb-md">
          <p className="font-jakarta text-label-sm text-on-surface-variant mb-xs">{t('auth.email')}</p>
          <p className="font-jakarta text-body-md text-on-surface font-semibold">{user?.email}</p>
        </div>

        {telegramLinked ? (
          <button
            onClick={onUnlink}
            className="w-full border border-outline font-jakarta font-semibold text-body-md rounded-full py-sm mb-sm transition-opacity flex items-center justify-center gap-sm hover:bg-surface-container"
          >
            <span>📤</span>
            <span>{t('telegram.unlink')}</span>
          </button>
        ) : (
          <button
            onClick={() => { onClose(); navigate('/telegram-setup') }}
            className="w-full border border-primary text-primary font-jakarta font-semibold text-body-md rounded-full py-sm mb-sm flex items-center justify-center gap-sm hover:bg-primary/5 transition-colors"
          >
            <span>📲</span>
            <span>{t('telegram.linkTelegram')}</span>
          </button>
        )}

        <button
          onClick={onLogout}
          className="w-full bg-error text-on-error font-jakarta font-semibold text-body-md rounded-full py-sm hover:opacity-90 transition-opacity mb-sm"
        >
          {t('auth.logout')}
        </button>

        <button
          onClick={onClose}
          className="w-full py-sm font-jakarta text-body-md font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
        >
          {t('item.cancel')}
        </button>
      </div>
    </>
  )
}

// ── Telegram confirm modal ────────────────────────────────────────────────────

interface TelegramConfirmModalProps {
  preview: string
  status: 'idle' | 'sending' | 'error'
  onSend: () => void
  onClose: () => void
}

function TelegramConfirmModal({ preview, status, onSend, onClose }: TelegramConfirmModalProps) {
  const { t, i18n } = useTranslation()
  const isHe = i18n.language === 'he'

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={status === 'sending' ? undefined : onClose} />
      <div className="fixed inset-x-0 bottom-0 bg-surface-container-lowest rounded-t-2xl z-50 p-lg shadow-xl" dir={isHe ? 'rtl' : 'ltr'}>
        <div className="w-10 h-1 rounded-full bg-outline-variant mx-auto mb-lg" />
        <h2 className="font-jakarta font-bold text-headline-sm text-on-surface mb-xs">
          {t('telegram.confirmTitle')}
        </h2>
        <p className="font-jakarta text-label-sm text-on-surface-variant mb-md">
          {t('telegram.confirmBody')}
        </p>

        <pre className="bg-surface-container rounded-xl p-md font-mono text-xs text-on-surface-variant overflow-auto max-h-48 mb-md whitespace-pre-wrap leading-relaxed">
          {preview}
        </pre>

        {status === 'error' && (
          <p className="font-jakarta text-label-sm text-error mb-md">{t('telegram.sendError')}</p>
        )}

        <button
          onClick={onSend}
          disabled={status === 'sending'}
          className="w-full bg-primary text-on-primary font-jakarta font-semibold text-body-md rounded-full py-sm hover:opacity-90 transition-opacity disabled:opacity-50 mb-sm"
        >
          {status === 'sending' ? t('telegram.sending') : t('telegram.send')}
        </button>

        <button
          onClick={onClose}
          disabled={status === 'sending'}
          className="w-full py-sm font-jakarta text-body-md font-semibold text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-40"
        >
          {t('item.cancel')}
        </button>
      </div>
    </>
  )
}

// ── Home ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const { t, i18n } = useTranslation()
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const isHe = i18n.language === 'he'

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<NavTab>('list')

  // ── List data ─────────────────────────────────────────────────────────────
  const [items, setItems] = useState<ListItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // ── Active categories (DB-backed) ─────────────────────────────────────────
  const [activeCategories, setActiveCategories] = useState<string[]>([])

  // ── Telegram ──────────────────────────────────────────────────────────────
  const [telegramLinked, setTelegramLinked] = useState(false)
  const [showTelegramConfirm, setShowTelegramConfirm] = useState(false)
  const [telegramStatus, setTelegramStatus] = useState<'idle' | 'sending' | 'error'>('idle')
  const [toast, setToast] = useState<string | null>(null)

  // ── Overlays ──────────────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false)
  const [showAccount, setShowAccount] = useState(false)

  // ── Load list from API ────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch('/api/list-get', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setItems(data.items ?? [])
        setCategories(data.categories ?? [])
        setActiveCategories(data.pinnedCategories ?? [])
        setTelegramLinked(data.telegramLinked ?? false)
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }, [token])

  useEffect(() => { loadList() }, [loadList])

  // ── Toggle check ──────────────────────────────────────────────────────────
  const toggleCheck = useCallback(async (item: ListItem) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, isChecked: !i.isChecked } : i))
    try {
      await fetch('/api/list-item-update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: item.id, isChecked: !item.isChecked }),
      })
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, isChecked: item.isChecked } : i))
    }
  }, [token])

  // ── Delete item ───────────────────────────────────────────────────────────
  const deleteItem = useCallback(async (itemId: string) => {
    setItems(prev => prev.filter(i => i.id !== itemId))
    try {
      await fetch('/api/list-item-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: itemId }),
      })
    } catch {
      loadList()
    }
  }, [token, loadList])

  // ── Telegram helpers ─────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const formatForTelegram = useCallback(() => {
    const unchecked = items.filter(i => i.isChecked !== true)
    const title = isHe ? 'רשימת הקניות שלי' : 'My Shopping List'
    const uncategorized = isHe ? 'אחר' : 'Other'

    // Group by category name, tracking the categoryId for sort ordering
    const grouped = new Map<string, { categoryId: string | null; names: string[] }>()
    for (const item of unchecked) {
      const cat = (isHe ? item.categoryName : item.categoryNameEn) ?? uncategorized
      if (!grouped.has(cat)) grouped.set(cat, { categoryId: item.categoryId, names: [] })
      const label = item.qty > 1 ? `${item.name} x${item.qty}` : item.name
      grouped.get(cat)!.names.push(label)
    }

    // Sort by pinned category order (activeCategories), uncategorized goes last
    const sorted = [...grouped.entries()].sort(([, a], [, b]) => {
      const aIdx = a.categoryId ? activeCategories.indexOf(a.categoryId) : -1
      const bIdx = b.categoryId ? activeCategories.indexOf(b.categoryId) : -1
      if (aIdx === -1 && bIdx === -1) return 0
      if (aIdx === -1) return 1
      if (bIdx === -1) return -1
      return aIdx - bIdx
    })

    const lines: string[] = [title, '']
    for (const [cat, { names }] of sorted) {
      lines.push(`${cat}:`)
      lines.push('')
      for (const name of names) lines.push(`* ${name}`)
      lines.push('')
    }
    return lines.join('\n').trimEnd()
  }, [items, isHe, activeCategories])

  const sendToTelegram = useCallback(async () => {
    setTelegramStatus('sending')
    try {
      const res = await fetch('/api/telegram-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lang: isHe ? 'he' : 'en' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setTelegramStatus('error')
        return
      }
      setTelegramStatus('idle')
      setShowTelegramConfirm(false)
      showToast(data.ok ? t('telegram.sent') : t('telegram.sendError'))
    } catch {
      setTelegramStatus('error')
    }
  }, [token, isHe, t, showToast])

  const unlinkTelegram = useCallback(async () => {
    try {
      await fetch('/api/telegram-unlink', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      setTelegramLinked(false)
      setShowAccount(false)
      showToast(t('telegram.unlinkSuccess'))
    } catch {
      // silent
    }
  }, [token, t, showToast])

  // ── Toggle active category ────────────────────────────────────────────────
  const toggleActiveCategory = useCallback((categoryId: string) => {
    const isActive = activeCategories.includes(categoryId)
    const next = isActive
      ? activeCategories.filter(id => id !== categoryId)
      : [...activeCategories, categoryId]

    setActiveCategories(next)

    // If removing, also clear that category's items from local state
    if (isActive) {
      setItems(prev => prev.filter(i => i.categoryId !== categoryId))
    }

    fetch('/api/list-categories-pin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ categoryIds: next }),
    }).catch(() => {})

    if (!isActive) setActiveTab('list')
  }, [activeCategories, token])

  // ── Navigate to add item ──────────────────────────────────────────────────
  const goToAddItem = useCallback((cat?: Category) => {
    navigate('/add-item', {
      state: cat
        ? { categoryId: cat.id, categoryName: isHe ? cat.nameHe : cat.nameEn, categoryEmoji: cat.emoji }
        : {},
    })
  }, [navigate, isHe])

  // ── Derived: which categories to show in the grid ─────────────────────────
  const categoryItemsMap = useMemo(() => {
    const map = new Map<string, ListItem[]>()
    for (const item of items) {
      const key = item.categoryId ?? '__none__'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return map
  }, [items])

  const visibleCategories = useMemo(() => {
    const catMap = new Map(categories.map(c => [c.id, c]))
    // Only show pinned categories, in pin order
    return activeCategories.map(id => catMap.get(id)).filter(Boolean) as Category[]
  }, [categories, activeCategories])

  const uncategorizedItems = categoryItemsMap.get('__none__') ?? []

  // ── Count for header ──────────────────────────────────────────────────────
  const totalCount = items.length
  const uncheckedCount = items.filter(i => !i.isChecked).length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col" dir={isHe ? 'rtl' : 'ltr'}>

      {/* ── Top app bar ──────────────────────────────────────────────────── */}
      <header className="fixed top-0 w-full z-50 bg-surface-container-lowest border-b border-outline-variant shadow-sm">
        <div className="flex justify-between items-center px-4 h-16 max-w-7xl mx-auto">
          <h1 className="font-jakarta font-extrabold text-xl text-primary tracking-tight">
            {t('app.name')}
          </h1>
          <div className="flex items-center gap-xs">
            <button
              onClick={() => setShowAccount(true)}
              className="p-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors active:scale-95"
              aria-label="Account"
            >
              👤
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors active:scale-95"
              aria-label={t('settings.title')}
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto pt-16 pb-24">

        {/* ── LIST TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'list' && (
          <div className="max-w-5xl mx-auto px-4 py-lg">

            {/* List title + action buttons */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-md mb-lg">
              <div>
                <h2 className="font-jakarta font-bold text-headline-lg text-on-surface">
                  {t('list.title')}
                </h2>
                <p className="font-jakarta text-body-md text-on-surface-variant flex items-center gap-sm">
                  {t('list.activeList')}
                  {totalCount > 0 && (
                    <span className="font-jakarta text-label-sm bg-primary/10 text-primary px-sm py-0.5 rounded-full">
                      {uncheckedCount}/{totalCount}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-sm">
                <button
                  onClick={() => navigate('/compare')}
                  className="flex-1 md:flex-none h-11 px-md bg-primary text-on-primary rounded-xl font-jakarta font-semibold text-sm flex items-center justify-center gap-1 active:scale-95 transition-transform hover:opacity-90"
                >
                  💰 {t('list.compare')}
                </button>
                <button
                  className="flex-1 md:flex-none h-11 px-md border border-secondary text-secondary rounded-xl font-jakarta font-semibold text-sm flex items-center justify-center gap-1 active:scale-95 transition-transform hover:bg-secondary-container"
                  onClick={() => {
                    if (!telegramLinked) {
                      navigate('/telegram-setup')
                    } else {
                      setTelegramStatus('idle')
                      setShowTelegramConfirm(true)
                    }
                  }}
                >
                  📤 {t('list.share')}
                </button>
              </div>
            </div>

            {/* Loading */}
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <span className="text-4xl animate-pulse">🛒</span>
              </div>
            ) : (
              <>
                {/* Bento grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">

                  {/* Category cards */}
                  {visibleCategories.map(cat => (
                    <CategoryCard
                      key={cat.id}
                      category={cat}
                      items={[
                        ...(categoryItemsMap.get(cat.id) ?? []).filter(i => !i.isChecked),
                        ...(categoryItemsMap.get(cat.id) ?? []).filter(i => i.isChecked),
                      ]}
                      isHe={isHe}
                      onToggle={toggleCheck}
                      onDelete={deleteItem}
                      onAddItem={() => goToAddItem(cat)}
                    />
                  ))}

                  {/* Uncategorized items card */}
                  {uncategorizedItems.length > 0 && (
                    <CategoryCard
                      key="__none__"
                      category={{ id: '__none__', nameHe: 'אחר', nameEn: 'Other', emoji: '📦', color: '#6f7a6f', isOwned: false }}
                      items={[
                        ...uncategorizedItems.filter(i => !i.isChecked),
                        ...uncategorizedItems.filter(i => i.isChecked),
                      ]}
                      isHe={isHe}
                      onToggle={toggleCheck}
                      onDelete={deleteItem}
                      onAddItem={() => goToAddItem()}
                    />
                  )}

                  {/* Add Category placeholder */}
                  <button
                    onClick={() => setActiveTab('categories')}
                    className="bg-transparent border-2 border-dashed border-outline-variant rounded-xl flex flex-col items-center justify-center p-xl gap-sm hover:bg-surface-container-low hover:border-primary transition-all group min-h-[180px]"
                  >
                    <div className="w-12 h-12 rounded-full bg-secondary-container flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                      🏷️
                    </div>
                    <span className="font-jakarta font-semibold text-secondary group-hover:text-primary transition-colors">
                      {t('categories.add')}
                    </span>
                  </button>
                </div>

                {/* Empty hint when no categories and no items */}
                {visibleCategories.length === 0 && uncategorizedItems.length === 0 && (
                  <p className="font-jakarta text-label-sm text-on-surface-variant text-center mt-md">
                    {t('list.noCategoriesHint')}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ── CATEGORIES TAB ───────────────────────────────────────────── */}
        {activeTab === 'categories' && (
          <CategoryManager
            categories={categories}
            activeCategories={activeCategories}
            onToggle={toggleActiveCategory}
            onRefresh={loadList}
          />
        )}
      </main>

      {/* ── Bottom nav ───────────────────────────────────────────────────── */}
      <BottomNav active={activeTab} onSelect={setActiveTab} />

      {/* ── Overlays ─────────────────────────────────────────────────────── */}
      {showSettings && (
        <SettingsOverlay onClose={() => setShowSettings(false)} />
      )}
      {showAccount && (
        <AccountOverlay
          onClose={() => setShowAccount(false)}
          onLogout={async () => { await logout(); navigate('/login') }}
          telegramLinked={telegramLinked}
          onUnlink={unlinkTelegram}
        />
      )}

      {showTelegramConfirm && (
        <TelegramConfirmModal
          preview={formatForTelegram()}
          status={telegramStatus}
          onSend={sendToTelegram}
          onClose={() => { setShowTelegramConfirm(false); setTelegramStatus('idle') }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-on-surface text-surface font-jakarta text-label-sm font-semibold px-lg py-sm rounded-full shadow-lg pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  )
}
