import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import PromoPopup from '../components/PromoPopup'
import type { PromoInfo } from '../components/PromoPopup'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  barcode: string
  name: string
  brand: string | null
  size: string | null
}

interface FrequentItem {
  barcode: string | null
  freeText: string | null
  name: string
  brand: string | null
  size: string | null
}

interface ChainPrice {
  chainId: string
  chainName: string
  price: number
  promos: PromoInfo[]
}

interface LocationState {
  categoryId?: string
  categoryName?: string
  categoryEmoji?: string
}

// ── Chain display names ───────────────────────────────────────────────────────

const CHAIN_NAME_EN: Record<string, string> = {
  'shufersal': 'Shufersal',
  'rami-levy': 'Rami Levy',
  'victory':   'Victory',
}

// ── PriceSheet ────────────────────────────────────────────────────────────────

interface PriceSheetProps {
  product: Product
  prices: ChainPrice[]
  loading: boolean
  adding: boolean
  onAdd: () => void
  onClose: () => void
}

// ── PriceSheet ────────────────────────────────────────────────────────────────

function PriceSheet({ product, prices, loading, adding, onAdd, onClose }: PriceSheetProps) {
  const { t, i18n } = useTranslation()
  const isHe = i18n.language === 'he'
  const sub = [product.brand, product.size].filter(Boolean).join(' · ')
  const [promoPopup, setPromoPopup] = useState<{ chainName: string; promos: PromoInfo[] } | null>(null)

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 bg-surface-container-lowest rounded-t-2xl z-50 shadow-xl"
        dir={isHe ? 'rtl' : 'ltr'}
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full bg-outline-variant mx-auto mt-md" />

        {/* Product header */}
        <div className="px-lg pt-md pb-md border-b border-outline-variant">
          <p className="font-jakarta font-bold text-body-lg text-on-surface">{product.name}</p>
          {sub && (
            <p className="font-jakarta text-label-sm text-on-surface-variant mt-xs">{sub}</p>
          )}
          <p className="font-jakarta text-label-sm text-primary font-semibold mt-xs">
            {t('item.pricesTitle')}
          </p>
        </div>

        {/* Price table */}
        <div className="px-lg py-md min-h-[120px]">
          {loading ? (
            <div className="flex items-center justify-center h-24">
              <span className="text-3xl animate-pulse">💰</span>
            </div>
          ) : prices.length === 0 ? (
            <p className="font-jakarta text-body-md text-on-surface-variant text-center py-lg">
              {t('item.noPriceData')}
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="font-jakarta text-label-sm text-on-surface-variant font-semibold pb-xs text-start">
                    {t('item.store')}
                  </th>
                  <th className="font-jakarta text-label-sm text-on-surface-variant font-semibold pb-xs text-center">
                    {t('item.promoCol')}
                  </th>
                  <th className="font-jakarta text-label-sm text-on-surface-variant font-semibold pb-xs text-end">
                    {t('item.price')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {prices.map((row, i) => {
                  const hasPromos = row.promos.length > 0

                  return (
                    <tr
                      key={row.chainId}
                      className={`border-b border-outline-variant/40 last:border-0 ${i === 0 ? 'bg-primary/5' : ''}`}
                    >
                      {/* Store name */}
                      <td className="py-sm">
                        <div className="flex items-center gap-xs">
                          {i === 0 && (
                            <span className="text-xs bg-primary text-on-primary px-xs py-0.5 rounded-full font-semibold font-jakarta">
                              ✓
                            </span>
                          )}
                          <span className="font-jakarta text-body-md text-on-surface">
                            {isHe ? row.chainName : (CHAIN_NAME_EN[row.chainId] ?? row.chainName)}
                          </span>
                        </div>
                      </td>

                      {/* Promo button */}
                      <td className="py-sm text-center">
                        {hasPromos && (
                          <button
                            onClick={() => setPromoPopup({ chainName: isHe ? row.chainName : (CHAIN_NAME_EN[row.chainId] ?? row.chainName), promos: row.promos })}
                            className="text-xs px-xs py-0.5 rounded-full font-semibold font-jakarta bg-secondary-container text-on-secondary-container hover:opacity-80 transition-opacity"
                          >
                            {row.promos.some(p => p.isCoupon) && row.promos.length === 1
                              ? t('item.coupon')
                              : t('item.promo')}
                            {row.promos.length > 1 ? ` (${row.promos.length})` : ''}
                          </button>
                        )}
                      </td>

                      {/* Price column */}
                      <td className="py-sm text-end align-middle">
                        <span className="font-jakarta text-body-md text-on-surface font-semibold">
                          ₪{row.price.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Add button */}
        <div className="px-lg pb-lg pt-sm">
          <button
            onClick={onAdd}
            disabled={adding}
            className="w-full bg-primary text-on-primary font-jakarta font-semibold text-body-md rounded-full py-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {adding ? '✓' : t('item.addToList')}
          </button>
        </div>
      </div>

      {/* Promo popup */}
      {promoPopup && (
        <PromoPopup
          chainName={promoPopup.chainName}
          promos={promoPopup.promos}
          onClose={() => setPromoPopup(null)}
        />
      )}
    </>
  )
}

// ── AddItem page ──────────────────────────────────────────────────────────────

export default function AddItem() {
  const { t, i18n } = useTranslation()
  const isHe = i18n.language === 'he'
  const { token } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const { categoryId, categoryName, categoryEmoji } =
    (location.state as LocationState) ?? {}

  // ── Search state ─────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [frequent, setFrequent] = useState<FrequentItem[]>([])
  const [searching, setSearching] = useState(false)
  const [searchedOnce, setSearchedOnce] = useState(false)
  const [isSearchAll, setIsSearchAll] = useState(false)

  // ── Adding state ─────────────────────────────────────────────────────────────
  const [adding, setAdding] = useState<string | null>(null)
  const [snackbar, setSnackbar] = useState<string | null>(null)

  // ── Price sheet state ─────────────────────────────────────────────────────────
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [sheetPrices, setSheetPrices] = useState<ChainPrice[]>([])
  const [sheetLoading, setSheetLoading] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  // ── On mount: focus + load frequent ─────────────────────────────────────────
  useEffect(() => {
    inputRef.current?.focus()
    if (!token) return
    fetch('/api/frequent-items', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setFrequent(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [token])

  // ── Search ───────────────────────────────────────────────────────────────────
  const search = useCallback(async (q: string, all = false) => {
    if (!q.trim()) return
    setSearching(true)
    setSearchedOnce(true)
    setIsSearchAll(all)
    try {
      const url = `/api/search-products?q=${encodeURIComponent(q)}${all ? '&all=true' : ''}`
      const res = await fetch(url)
      const data = await res.json()
      setResults(Array.isArray(data) ? data : [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  // ── Open price sheet ──────────────────────────────────────────────────────────
  const openPriceSheet = useCallback(async (product: Product) => {
    setSelectedProduct(product)
    setSheetPrices([])
    setSheetLoading(true)
    try {
      const res = await fetch(`/api/item-prices?barcode=${encodeURIComponent(product.barcode)}`)
      const data = await res.json()
      setSheetPrices(Array.isArray(data.prices) ? data.prices : [])
    } catch {
      setSheetPrices([])
    } finally {
      setSheetLoading(false)
    }
  }, [])

  // ── Show snackbar ─────────────────────────────────────────────────────────────
  function flash(msg: string) {
    setSnackbar(msg)
    setTimeout(() => setSnackbar(null), 2500)
  }

  // ── Add to list ──────────────────────────────────────────────────────────────
  const addToList = useCallback(
    async (product: Product | null, freeTextVal?: string) => {
      const key = product?.barcode ?? freeTextVal ?? ''
      setAdding(key)
      try {
        const body: Record<string, unknown> = {
          qty: 1,
          unit: 'unit',
          categoryId: categoryId ?? null,
        }
        if (product) body.barcode = product.barcode
        else body.freeText = freeTextVal

        const res = await fetch('/api/list-item-add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        })

        if (res.ok) {
          setSelectedProduct(null)
          flash(t('item.added'))
        }
      } catch {
        // silent
      } finally {
        setAdding(null)
      }
    },
    [token, categoryId, t],
  )

  // ── Clear search ──────────────────────────────────────────────────────────────
  function clearSearch() {
    setQuery('')
    setResults([])
    setSearchedOnce(false)
    setIsSearchAll(false)
  }

  // ── Derived state ─────────────────────────────────────────────────────────────
  const showFrequent = !searchedOnce && frequent.length > 0
  const showResults = searchedOnce && results.length > 0
  const showNoResults = searchedOnce && !searching && results.length === 0 && query.trim().length > 0
  const showSearchAll = showResults && results.length === 5 && !isSearchAll
  const emoji = categoryEmoji ?? '📦'

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      dir={isHe ? 'rtl' : 'ltr'}
    >
      {/* Header */}
      <header className="bg-surface-container-lowest border-b border-outline-variant shadow-sm sticky top-0 z-50">
        <div className="flex items-center px-4 h-16 max-w-2xl mx-auto gap-sm">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors flex-shrink-0"
            aria-label="Back"
          >
            {isHe ? '→' : '←'}
          </button>
          <h1 className="font-jakarta font-bold text-lg text-on-surface flex-1 truncate">
            {categoryName
              ? t('item.addTo', { category: `${emoji} ${categoryName}` })
              : t('list.addItem')}
          </h1>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-lg space-y-md pb-8">

        {/* Search input */}
        <div className="relative">
          <span className="absolute top-1/2 -translate-y-1/2 text-outline pointer-events-none"
            style={{ [isHe ? 'right' : 'left']: '1rem' }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              if (!e.target.value.trim()) clearSearch()
            }}
            onKeyDown={e => e.key === 'Enter' && search(query)}
            placeholder={t('item.search')}
            dir={isHe ? 'rtl' : 'ltr'}
            className="w-full h-14 bg-surface-container-lowest border-none rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all font-jakarta text-body-md text-on-surface placeholder:text-outline outline-none"
            style={{ [isHe ? 'paddingRight' : 'paddingLeft']: '3rem', [isHe ? 'paddingLeft' : 'paddingRight']: '1rem' }}
          />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors"
              style={{ [isHe ? 'left' : 'right']: '1rem' }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Frequent items */}
        {showFrequent && (
          <section className="space-y-sm">
            <h2 className="font-jakarta font-semibold text-headline-md text-on-surface">
              {t('item.frequent')}
            </h2>
            <div className="space-y-gutter">
              {frequent.map((item, i) => {
                const key = item.barcode ?? item.freeText ?? String(i)
                return (
                  <ProductCard
                    key={key}
                    emoji={emoji}
                    name={item.name}
                    sub={[item.brand, item.size].filter(Boolean).join(' · ')}
                    adding={adding === key}
                    onAdd={() => {
                      if (item.barcode) {
                        openPriceSheet({ barcode: item.barcode, name: item.name, brand: item.brand, size: item.size })
                      } else {
                        addToList(null, item.freeText ?? item.name)
                      }
                    }}
                  />
                )
              })}
            </div>
          </section>
        )}

        {/* Searching indicator */}
        {searching && (
          <div className="flex justify-center py-lg">
            <span className="text-4xl animate-pulse">🔍</span>
          </div>
        )}

        {/* Results header */}
        {showResults && (
          <div className="flex items-center justify-between">
            <span className="font-jakarta text-label-sm text-outline">
              {t('item.resultsCount', { count: results.length })}
            </span>
          </div>
        )}

        {/* Results — tap opens price sheet */}
        {showResults && (
          <div className="space-y-gutter">
            {results.map(p => (
              <ProductCard
                key={p.barcode}
                emoji={emoji}
                name={p.name}
                sub={[p.brand, p.size].filter(Boolean).join(' · ')}
                adding={adding === p.barcode}
                onAdd={() => openPriceSheet(p)}
              />
            ))}

            {showSearchAll && (
              <button
                onClick={() => search(query, true)}
                className="w-full py-sm font-jakarta text-label-sm font-semibold text-primary hover:bg-surface-container rounded-xl transition-colors text-center"
              >
                🔍 {t('item.showAll')}
              </button>
            )}
          </div>
        )}

        {/* No results */}
        {showNoResults && (
          <div className="flex items-center justify-center py-lg">
            <span className="font-jakarta text-body-md text-on-surface-variant">
              {t('item.noResults')}
            </span>
          </div>
        )}

        {/* Free text — always shown when there's a query */}
        {searchedOnce && !searching && query.trim().length > 0 && (
          <div className="flex flex-col items-center gap-xs text-center">
            <button
              disabled={adding === query.trim()}
              onClick={() => addToList(null, query.trim())}
              className="font-jakarta font-semibold text-body-md text-primary disabled:opacity-50"
            >
              + {t('item.confirm')}
            </button>
            <p className="font-jakarta text-label-sm text-on-surface-variant max-w-xs">
              {t('item.freeTextWarning')}
            </p>
          </div>
        )}

        {/* Empty state */}
        {!searchedOnce && !showFrequent && !searching && (
          <div className="flex flex-col items-center text-center space-y-md py-xl opacity-40">
            <span className="text-7xl">{emoji}</span>
            <p className="font-jakarta text-body-md text-on-surface-variant max-w-xs">
              {t('item.search')}
            </p>
          </div>
        )}
      </main>

      {/* Price sheet */}
      {selectedProduct && (
        <PriceSheet
          product={selectedProduct}
          prices={sheetPrices}
          loading={sheetLoading}
          adding={adding === selectedProduct.barcode}
          onAdd={() => addToList(selectedProduct)}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* Snackbar */}
      {snackbar && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface px-lg py-md rounded-xl shadow-xl flex items-center gap-sm z-50 whitespace-nowrap">
          <span className="text-primary-fixed">✓</span>
          <p className="font-jakarta text-body-md">{snackbar}</p>
        </div>
      )}
    </div>
  )
}

// ── ProductCard ───────────────────────────────────────────────────────────────

interface ProductCardProps {
  emoji: string
  name: string
  sub: string
  adding: boolean
  onAdd: () => void
}

function ProductCard({ emoji, name, sub, adding, onAdd }: ProductCardProps) {
  return (
    <div className="bg-surface-container-lowest p-md rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex items-center justify-between border border-outline-variant hover:shadow-md transition-all group">
      <div className="flex items-center gap-md min-w-0">
        <div className="w-12 h-12 bg-surface-container-low rounded-full flex items-center justify-center text-2xl flex-shrink-0 group-hover:bg-secondary-container transition-colors">
          {emoji}
        </div>
        <div className="min-w-0">
          <span className="font-jakarta text-body-lg text-on-surface block truncate">{name}</span>
          {sub && (
            <span className="font-jakarta text-label-sm text-outline truncate block">{sub}</span>
          )}
        </div>
      </div>
      <button
        onClick={onAdd}
        disabled={adding}
        className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shadow-sm hover:scale-105 active:scale-95 transition-transform disabled:opacity-50 flex-shrink-0 ml-sm font-bold text-lg"
        aria-label="Add"
      >
        {adding ? '✓' : '+'}
      </button>
    </div>
  )
}
