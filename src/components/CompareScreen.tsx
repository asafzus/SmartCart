import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Chain {
  id: string
  nameHe: string
}

interface CompareItem {
  name: string
  barcode: string | null
  isFreeText: boolean
  prices: Record<string, number | null>
}

interface CompareData {
  chains: Chain[]
  items: CompareItem[]
  totals: Record<string, number>
  excludedCount: number
}

// ── Chain English names ───────────────────────────────────────────────────────

const CHAIN_NAME_EN: Record<string, string> = {
  'shufersal': 'Shufersal',
  'rami-levy': 'Rami Levy',
  'victory':   'Victory',
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  token: string
}

export default function CompareScreen({ token }: Props) {
  const { t, i18n } = useTranslation()
  const isHe = i18n.language === 'he'

  const [data, setData] = useState<CompareData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const res = await fetch('/api/compare-prices', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to load comparison')
      setData(await res.json())
    } catch {
      setError(t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }, [token, t])

  useEffect(() => { load() }, [load])

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <span className="text-4xl animate-pulse">💰</span>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 px-md text-center">
        <p className="font-jakarta text-body-md text-error">{error || t('errors.generic')}</p>
        <button onClick={load} className="font-jakarta text-label-sm font-semibold text-primary">
          {t('errors.generic')}
        </button>
      </div>
    )
  }

  // ── Empty list ────────────────────────────────────────────────────────────
  if (data.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-md">
        <span className="text-5xl">💰</span>
        <p className="font-jakarta text-headline-sm text-on-surface">{t('compare.title')}</p>
        <p className="font-jakarta text-body-md text-on-surface-variant">{t('list.empty')}</p>
      </div>
    )
  }

  const { chains, items, totals, excludedCount } = data

  // Find cheapest price per item (across chains, ignoring nulls)
  function getCheapestChain(item: CompareItem): string | null {
    if (item.isFreeText) return null
    let min = Infinity
    let cheapestId: string | null = null
    for (const chain of chains) {
      const price = item.prices[chain.id]
      if (price !== null && price < min) {
        min = price
        cheapestId = chain.id
      }
    }
    return cheapestId
  }

  // Chain display name based on language
  function chainName(chain: Chain) {
    return isHe ? chain.nameHe : (CHAIN_NAME_EN[chain.id] ?? chain.id)
  }

  return (
    <div className="flex flex-col gap-md p-md">
      <h1 className="font-jakarta font-bold text-headline-md text-on-surface">
        {t('compare.title')}
      </h1>

      {/* Excluded items notice */}
      {excludedCount > 0 && (
        <div className="bg-warning-container rounded-DEFAULT px-md py-sm">
          <p className="font-jakarta text-label-sm text-on-warning-container">
            ⚠️ {t('compare.freeTextExcluded')} ({excludedCount})
          </p>
        </div>
      )}

      {/* Comparison table */}
      <div className="overflow-x-auto rounded-lg shadow-card">
        <table className="w-full min-w-[320px] border-collapse bg-surface-container-lowest">
          <thead>
            <tr className="border-b border-outline-variant">
              <th className="text-start px-md py-sm font-jakarta text-label-sm font-semibold text-on-surface-variant w-2/5">
                {t('list.title')}
              </th>
              {chains.map(chain => (
                <th key={chain.id} className="px-sm py-sm font-jakarta text-label-sm font-semibold text-primary text-center">
                  {chainName(chain)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {items.map((item, idx) => {
              const cheapestChain = getCheapestChain(item)
              return (
                <tr
                  key={idx}
                  className={`border-b border-outline-variant last:border-b-0 ${item.isFreeText ? 'opacity-60' : ''}`}
                >
                  {/* Item name */}
                  <td className="px-md py-sm">
                    <p className="font-jakarta text-body-md text-on-surface truncate max-w-[120px]">
                      {item.name}
                    </p>
                    {item.isFreeText && (
                      <p className="font-jakarta text-label-sm text-error">{t('compare.freeTextExcluded').split(' ')[0]}</p>
                    )}
                  </td>

                  {/* Price per chain */}
                  {chains.map(chain => {
                    const price = item.prices[chain.id]
                    const isCheapest = cheapestChain === chain.id
                    return (
                      <td key={chain.id} className="px-sm py-sm text-center">
                        {price !== null ? (
                          <span className={`font-worksans text-body-md font-semibold
                            ${isCheapest ? 'text-price-cheapest' : 'text-on-surface'}`}>
                            ₪{price.toFixed(2)}
                          </span>
                        ) : (
                          <span className="font-jakarta text-label-sm text-on-surface-variant">
                            {t('compare.notAvailable')}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>

          {/* Totals row */}
          <tfoot>
            <tr className="border-t-2 border-outline-variant bg-surface-container">
              <td className="px-md py-sm font-jakarta text-body-md font-semibold text-on-surface">
                {t('compare.total')}
              </td>
              {chains.map(chain => (
                <td key={chain.id} className="px-sm py-sm text-center">
                  <span className="font-worksans text-body-md font-semibold text-on-surface">
                    ₪{totals[chain.id].toFixed(2)}
                  </span>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Last updated */}
      <p className="font-jakarta text-label-sm text-on-surface-variant text-center">
        {t('compare.lastUpdated', { date: new Date().toLocaleDateString(isHe ? 'he-IL' : 'en-US') })}
      </p>
    </div>
  )
}
