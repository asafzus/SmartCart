import type { Handler } from '@netlify/functions'
import { Pool } from 'pg'
import { getUser } from '../lib/auth'

function getPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL! })
}

export const handler: Handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' }
  }

  let user: { id: string; email: string }
  try {
    user = await getUser(event.headers.authorization)
  } catch {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  const pool = getPool()
  try {
    // ── Get user's current list items ─────────────────────────────────────────
    const itemsResult = await pool.query(
      `SELECT li.product_barcode AS barcode,
              li.free_text,
              COALESCE(p.name_he, li.free_text) AS name
       FROM list_items li
       LEFT JOIN products p ON li.product_barcode = p.barcode
       WHERE li.list_id IN (SELECT id FROM lists WHERE user_id = $1)
       ORDER BY li.created_at ASC`,
      [user.id]
    )

    const items = itemsResult.rows
    const barcodes = items.filter(i => i.barcode).map(i => i.barcode)

    // ── Get all chains ────────────────────────────────────────────────────────
    const chainsResult = await pool.query(
      `SELECT id, name_he FROM chains ORDER BY id`
    )
    const chains = chainsResult.rows.map(c => ({ id: c.id, nameHe: c.name_he }))

    // ── Get prices for all barcodes across all chains ─────────────────────────
    let priceMap = new Map<string, Map<string, number>>() // barcode → chainId → price

    if (barcodes.length > 0) {
      const placeholders = barcodes.map((_, i) => `$${i + 1}`).join(', ')
      const pricesResult = await pool.query(
        `SELECT product_barcode, chain_id, price
         FROM product_prices
         WHERE product_barcode IN (${placeholders})`,
        barcodes
      )
      for (const row of pricesResult.rows) {
        if (!priceMap.has(row.product_barcode)) {
          priceMap.set(row.product_barcode, new Map())
        }
        priceMap.get(row.product_barcode)!.set(row.chain_id, parseFloat(row.price))
      }
    }

    // ── Get active promos for all barcodes ────────────────────────────────────
    type PromoInfo = {
      promotionId: string
      description: string
      discountedPrice: number | null
      discountedPricePerMida: number | null
      minQty: number
      maxQty: number | null
      minPurchaseAmount: number | null
      startDate: string
      endDate: string
      isCoupon: boolean
      clubId: string
    }

    let promoMap = new Map<string, Map<string, PromoInfo[]>>() // barcode → chainId → promos

    if (barcodes.length > 0) {
      const placeholders = barcodes.map((_, i) => `$${i + 1}`).join(', ')
      const promosResult = await pool.query(
        `SELECT product_barcode, chain_id, promotion_id, description,
                discounted_price, discounted_price_per_mida, min_qty, max_qty,
                min_purchase_amount, start_date, end_date, is_coupon, club_id
         FROM product_promos
         WHERE product_barcode IN (${placeholders})
           AND end_date > NOW()`,
        barcodes
      )
      for (const row of promosResult.rows) {
        if (!promoMap.has(row.product_barcode)) {
          promoMap.set(row.product_barcode, new Map())
        }
        const chainPromos = promoMap.get(row.product_barcode)!
        if (!chainPromos.has(row.chain_id)) {
          chainPromos.set(row.chain_id, [])
        }
        chainPromos.get(row.chain_id)!.push({
          promotionId: row.promotion_id,
          description: row.description,
          discountedPrice: row.discounted_price != null ? parseFloat(row.discounted_price) : null,
          discountedPricePerMida: row.discounted_price_per_mida != null ? parseFloat(row.discounted_price_per_mida) : null,
          minQty: row.min_qty ?? 1,
          maxQty: row.max_qty ?? null,
          minPurchaseAmount: row.min_purchase_amount != null ? parseFloat(row.min_purchase_amount) : null,
          startDate: row.start_date,
          endDate: row.end_date,
          isCoupon: row.is_coupon,
          clubId: String(row.club_id ?? '0'),
        })
      }
    }

    // ── Build response ────────────────────────────────────────────────────────
    const responseItems = items.map(item => {
      const isFreeText = !item.barcode
      const prices: Record<string, number | null> = {}
      const promos: Record<string, PromoInfo[]> = {}

      for (const chain of chains) {
        if (isFreeText) {
          prices[chain.id] = null
          promos[chain.id] = []
        } else {
          prices[chain.id] = priceMap.get(item.barcode)?.get(chain.id) ?? null
          promos[chain.id] = promoMap.get(item.barcode)?.get(chain.id) ?? []
        }
      }

      return {
        name: item.name ?? item.free_text ?? '',
        barcode: item.barcode ?? null,
        isFreeText,
        prices,
        promos,
      }
    })

    const excludedCount = responseItems.filter(i => i.isFreeText).length

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ chains, items: responseItems, excludedCount }),
    }
  } catch (err: any) {
    console.error('[compare-prices] Error:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Comparison failed' }) }
  } finally {
    await pool.end()
  }
}
