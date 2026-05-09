import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'

export interface Category {
  id: string
  nameHe: string
  nameEn: string
  emoji: string
  color: string
  isOwned: boolean
}

// ── Preset colors ─────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#006a34', // green
  '#1565c0', // blue
  '#b71c1c', // red
  '#e65100', // orange
  '#6a1b9a', // purple
  '#00838f', // teal
  '#558b2f', // olive
  '#4e342e', // brown
  '#37474f', // blue-grey
  '#f9a825', // yellow
]

// ── Category form (bottom sheet) ──────────────────────────────────────────────

interface CategoryFormProps {
  initial?: Category
  onSave: (data: { nameHe: string; nameEn: string; emoji: string; color: string }) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}

function CategoryForm({ initial, onSave, onDelete, onClose }: CategoryFormProps) {
  const { t, i18n } = useTranslation()
  const isHe = i18n.language === 'he'

  const [nameHe, setNameHe] = useState(initial?.nameHe ?? '')
  const [nameEn, setNameEn] = useState(initial?.nameEn ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? '🛒')
  const [color, setColor] = useState(initial?.color ?? PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isValid = nameHe.trim() && nameEn.trim() && emoji.trim()

  const handleSave = async () => {
    if (!isValid || saving) return
    setSaving(true)
    try {
      await onSave({ nameHe: nameHe.trim(), nameEn: nameEn.trim(), emoji: emoji.trim(), color })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete || deleting) return
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      await onDelete()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 bg-surface-container-lowest rounded-t-2xl z-50 p-lg shadow-xl"
        dir={isHe ? 'rtl' : 'ltr'}
      >
        <div className="w-10 h-1 rounded-full bg-outline-variant mx-auto mb-lg" />

        <h2 className="font-jakarta font-bold text-headline-sm text-on-surface mb-lg">
          {initial ? t('categories.edit') : t('categories.add')}
        </h2>

        {/* Emoji + color preview */}
        <div className="flex items-center gap-md mb-lg">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-2xl flex-shrink-0 border-2"
            style={{ backgroundColor: `${color}20`, borderColor: color }}
          >
            {emoji || '🛒'}
          </div>
          <div className="flex-1">
            {/* Emoji input */}
            <label className="font-jakarta text-label-sm text-on-surface-variant block mb-xs">
              {t('categories.emoji')}
            </label>
            <input
              type="text"
              value={emoji}
              onChange={e => setEmoji(e.target.value)}
              maxLength={2}
              className="w-20 border border-outline rounded-lg px-sm py-xs font-jakarta text-body-md text-on-surface bg-surface-container focus:outline-none focus:border-primary text-center text-xl"
            />
          </div>
        </div>

        {/* Color picker */}
        <div className="mb-lg">
          <label className="font-jakarta text-label-sm text-on-surface-variant block mb-sm">
            {t('categories.color')}
          </label>
          <div className="flex flex-wrap gap-sm">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? '#000' : 'transparent',
                  transform: color === c ? 'scale(1.2)' : undefined,
                }}
              />
            ))}
          </div>
        </div>

        {/* Name fields */}
        <div className="space-y-sm mb-lg">
          <div>
            <label className="font-jakarta text-label-sm text-on-surface-variant block mb-xs">
              {t('categories.name')} (עברית)
            </label>
            <input
              type="text"
              value={nameHe}
              onChange={e => setNameHe(e.target.value)}
              dir="rtl"
              className="w-full border border-outline rounded-xl px-md py-sm font-jakarta text-body-md text-on-surface bg-surface-container focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="font-jakarta text-label-sm text-on-surface-variant block mb-xs">
              {t('categories.name')} (English)
            </label>
            <input
              type="text"
              value={nameEn}
              onChange={e => setNameEn(e.target.value)}
              dir="ltr"
              className="w-full border border-outline rounded-xl px-md py-sm font-jakarta text-body-md text-on-surface bg-surface-container focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Actions */}
        <button
          onClick={handleSave}
          disabled={!isValid || saving}
          className="w-full bg-primary text-on-primary font-jakarta font-semibold text-body-md rounded-full py-sm hover:opacity-90 transition-opacity disabled:opacity-40 mb-sm"
        >
          {saving ? '...' : t('categories.save')}
        </button>

        {onDelete && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className={`w-full font-jakarta font-semibold text-body-md rounded-full py-sm transition-colors mb-sm
              ${confirmDelete
                ? 'bg-error text-on-error hover:opacity-90'
                : 'border border-error text-error hover:bg-error/10'
              }`}
          >
            {deleting ? '...' : confirmDelete ? t('categories.delete') + ' ?' : t('categories.delete')}
          </button>
        )}

        <button
          onClick={onClose}
          className="w-full py-sm font-jakarta text-body-md font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
        >
          {t('categories.cancel')}
        </button>
      </div>
    </>
  )
}

// ── CategoryManager ───────────────────────────────────────────────────────────

interface Props {
  categories: Category[]
  activeCategories: string[]
  onToggle: (categoryId: string) => void
  onRefresh: () => void
}

export default function CategoryManager({ categories, activeCategories, onToggle, onRefresh }: Props) {
  const { t, i18n } = useTranslation()
  const { token } = useAuth()
  const isHe = i18n.language === 'he'

  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const handleAdd = async (data: { nameHe: string; nameEn: string; emoji: string; color: string }) => {
    const res = await fetch('/api/category-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      setShowAddForm(false)
      onRefresh()
    }
  }

  const handleUpdate = async (data: { nameHe: string; nameEn: string; emoji: string; color: string }) => {
    if (!editingCategory) return
    const res = await fetch('/api/category-update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: editingCategory.id, ...data }),
    })
    if (res.ok) {
      setEditingCategory(null)
      onRefresh()
    }
  }

  const handleDelete = async () => {
    if (!editingCategory) return
    const res = await fetch('/api/category-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: editingCategory.id }),
    })
    if (res.ok) {
      setEditingCategory(null)
      onRefresh()
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-lg">
      {/* Page header */}
      <div className="flex items-center justify-between mb-lg">
        <div>
          <h1 className="font-jakarta font-bold text-headline-lg text-on-surface">
            {t('categories.title')}
          </h1>
          <p className="font-jakarta text-body-md text-on-surface-variant">
            {t('categories.manage')}
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-xs bg-primary text-on-primary font-jakarta font-semibold text-label-sm px-md py-sm rounded-full hover:opacity-90 transition-opacity active:scale-95"
        >
          + {t('categories.add')}
        </button>
      </div>

      {/* Category grid */}
      {categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-xl gap-3 text-center">
          <span className="text-5xl">🏷️</span>
          <p className="font-jakarta text-body-md text-on-surface-variant">
            {t('list.noCategoriesHint')}
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="font-jakarta font-semibold text-primary underline"
          >
            {t('categories.add')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories.map(cat => {
            const isActive = activeCategories.includes(cat.id)
            return (
              <div key={cat.id} className="relative group">
                <button
                  onClick={() => onToggle(cat.id)}
                  className={`w-full bg-surface-container-lowest p-4 rounded-2xl shadow-sm border-2 flex flex-col items-center gap-3 transition-all hover:shadow-md active:scale-95
                    ${isActive ? 'border-primary shadow-primary/10' : 'border-outline-variant'}`}
                >
                  {/* Emoji circle */}
                  <div className="relative w-16 h-16">
                    <div
                      className={`w-full h-full rounded-full flex items-center justify-center text-3xl border-2 transition-all
                        ${isActive ? 'border-primary/30' : 'bg-surface-container-low border-outline-variant'}`}
                      style={isActive ? { backgroundColor: `${cat.color}20`, borderColor: `${cat.color}60` } : undefined}
                    >
                      {cat.emoji}
                    </div>
                    {isActive && (
                      <div
                        className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center shadow-sm"
                        style={{ backgroundColor: cat.color }}
                      >
                        <span className="text-white text-xs font-bold">✓</span>
                      </div>
                    )}
                  </div>

                  {/* Name + accent bar */}
                  <div className="text-center">
                    <h3 className="font-jakarta font-semibold text-sm text-on-surface leading-tight">
                      {isHe ? cat.nameHe : cat.nameEn}
                    </h3>
                    <div
                      className="mt-2 h-1 w-10 rounded-full mx-auto transition-all"
                      style={{ backgroundColor: isActive ? cat.color : '#becabd' }}
                    />
                  </div>
                </button>

                {/* Edit button — only for user-created categories */}
                {cat.isOwned && (
                  <button
                    onClick={e => { e.stopPropagation(); setEditingCategory(cat) }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors opacity-0 group-hover:opacity-100"
                    title={t('categories.edit')}
                  >
                    ✏️
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Hint */}
      {categories.length > 0 && (
        <p className="mt-lg font-jakarta text-label-sm text-on-surface-variant text-center">
          {t('categories.pick')}
        </p>
      )}

      {/* Add form */}
      {showAddForm && (
        <CategoryForm
          onSave={handleAdd}
          onClose={() => setShowAddForm(false)}
        />
      )}

      {/* Edit form */}
      {editingCategory && (
        <CategoryForm
          initial={editingCategory}
          onSave={handleUpdate}
          onDelete={handleDelete}
          onClose={() => setEditingCategory(null)}
        />
      )}
    </div>
  )
}
