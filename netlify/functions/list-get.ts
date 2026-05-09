import type { Handler } from '@netlify/functions'
import { Pool } from 'pg'
import { randomUUID } from 'crypto'
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
    // ── Find or create user's list ────────────────────────────────────────────
    let listResult = await pool.query(
      'SELECT id, title, pinned_categories FROM lists WHERE user_id = $1 LIMIT 1',
      [user.id]
    )

    let listId: string
    if (listResult.rows.length === 0) {
      listId = randomUUID()
      await pool.query(
        'INSERT INTO lists (id, user_id, title, pinned_categories, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [listId, user.id, 'My List', []]
      )
    } else {
      listId = listResult.rows[0].id
    }
    const pinnedCategories: string[] = listResult.rows[0]?.pinned_categories ?? []

    // ── Fetch items with product + category info ───────────────────────────────
    const itemsResult = await pool.query(
      `SELECT
         li.id,
         li.product_barcode   AS barcode,
         li.free_text,
         li.category_id,
         li.qty,
         li.unit,
         li.note,
         li.is_checked,
         li.created_at,
         p.name_he            AS product_name,
         p.brand,
         p.size,
         c.name_he            AS category_name,
         c.name_en            AS category_name_en,
         c.emoji              AS category_emoji,
         c.color              AS category_color
       FROM list_items li
       LEFT JOIN products p  ON li.product_barcode = p.barcode
       LEFT JOIN categories c ON li.category_id    = c.id
       WHERE li.list_id = $1
       ORDER BY li.is_checked ASC, li.created_at ASC`,
      [listId]
    )

    // ── Check Telegram link status ────────────────────────────────────────────
    const tgResult = await pool.query(
      'SELECT telegram_chat_id IS NOT NULL AS telegram_linked FROM users WHERE id = $1',
      [user.id]
    )
    const telegramLinked: boolean = tgResult.rows[0]?.telegram_linked ?? false

    // ── Fetch categories available to this user ───────────────────────────────
    const catsResult = await pool.query(
      `SELECT id, name_he, name_en, emoji, color, user_id
       FROM categories
       WHERE user_id = $1 OR user_id IS NULL
       ORDER BY user_id NULLS FIRST, name_he`,
      [user.id]
    )

    const items = itemsResult.rows.map(r => ({
      id: r.id,
      barcode: r.barcode ?? null,
      freeText: r.free_text ?? null,
      name: r.product_name ?? r.free_text ?? '',
      brand: r.brand ?? null,
      size: r.size ?? null,
      categoryId: r.category_id ?? null,
      categoryName: r.category_name ?? null,
      categoryNameEn: r.category_name_en ?? null,
      categoryEmoji: r.category_emoji ?? null,
      categoryColor: r.category_color ?? null,
      qty: parseFloat(r.qty),
      unit: r.unit,
      note: r.note ?? null,
      isChecked: Boolean(r.is_checked),
      isFreeText: !r.barcode,
    }))

    const categories = catsResult.rows.map(r => ({
      id: r.id,
      nameHe: r.name_he,
      nameEn: r.name_en,
      emoji: r.emoji,
      color: r.color,
      isOwned: r.user_id === user.id,
    }))

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ listId, items, categories, telegramLinked, pinnedCategories }),
    }
  } catch (err: any) {
    console.error('[list-get] Error:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to load list' }) }
  } finally {
    await pool.end()
  }
}
