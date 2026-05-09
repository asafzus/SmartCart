import type { Handler } from '@netlify/functions'
import { Pool } from 'pg'
import { Redis } from '@upstash/redis'
import { randomUUID } from 'crypto'
import { getUser } from '../lib/auth'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

function getPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL! })
}

export const handler: Handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' }

  if (event.httpMethod !== 'POST') {
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
    const { barcode, freeText, categoryId, qty, unit, note } = JSON.parse(event.body ?? '{}')

    // Must have either a barcode or free text
    if (!barcode && !freeText) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'barcode or freeText is required' }),
      }
    }

    // ── Find or create user's list ────────────────────────────────────────────
    let listResult = await pool.query(
      'SELECT id FROM lists WHERE user_id = $1 LIMIT 1',
      [user.id]
    )

    let listId: string
    if (listResult.rows.length === 0) {
      listId = randomUUID()
      await pool.query(
        'INSERT INTO lists (id, user_id, title, created_at) VALUES ($1, $2, $3, NOW())',
        [listId, user.id, 'My List']
      )
    } else {
      listId = listResult.rows[0].id
    }

    // ── Insert item ───────────────────────────────────────────────────────────
    const itemId = randomUUID()
    await pool.query(
      `INSERT INTO list_items
         (id, list_id, product_barcode, free_text, category_id, qty, unit, note, is_checked, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, NOW())`,
      [
        itemId,
        listId,
        barcode ?? null,
        freeText ?? null,
        categoryId ?? null,
        qty ?? 1,
        unit ?? 'unit',
        note ?? null,
      ]
    )

    // ── Track frequency in Redis (fire and forget) ────────────────────────────
    const freqKey = barcode ?? `ft:${freeText}`
    redis.zincrby(`frequent:${user.id}`, 1, freqKey).catch(() => {})

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ id: itemId }),
    }
  } catch (err: any) {
    console.error('[list-item-add] Error:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to add item' }) }
  } finally {
    await pool.end()
  }
}
