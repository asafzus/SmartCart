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

    // ── Build response ────────────────────────────────────────────────────────
    const responseItems = items.map(item => {
      const isFreeText = !item.barcode
      const prices: Record<string, number | null> = {}

      for (const chain of chains) {
        if (isFreeText) {
          prices[chain.id] = null
        } else {
          prices[chain.id] = priceMap.get(item.barcode)?.get(chain.id) ?? null
        }
      }

      return {
        name: item.name ?? item.free_text ?? '',
        barcode: item.barcode ?? null,
        isFreeText,
        prices,
      }
    })

    // ── Calculate totals (only barcode items with at least one price) ─────────
    const totals: Record<string, number> = {}
    for (const chain of chains) {
      totals[chain.id] = responseItems
        .filter(i => !i.isFreeText && i.prices[chain.id] !== null)
        .reduce((sum, i) => sum + (i.prices[chain.id] as number), 0)
    }

    const excludedCount = responseItems.filter(i => i.isFreeText).length

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ chains, items: responseItems, totals, excludedCount }),
    }
  } catch (err: any) {
    console.error('[compare-prices] Error:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Comparison failed' }) }
  } finally {
    await pool.end()
  }
}
