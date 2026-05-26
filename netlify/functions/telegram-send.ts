import type { Handler } from '@netlify/functions'
import { Pool } from 'pg'
import { getUser } from '../lib/auth'

function getPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL! })
}

function formatList(
  items: Array<{ name: string; category: string | null; category_id: string | null; qty: number }>,
  isHe: boolean,
  pinnedCategories: string[]
): string {
  const uncategorized = isHe ? 'אחר' : 'Other'
  const title = isHe ? 'רשימת הקניות שלי' : 'My Shopping List'

  const grouped = new Map<string, { categoryId: string | null; names: string[] }>()
  for (const item of items) {
    const cat = item.category ?? uncategorized
    if (!grouped.has(cat)) grouped.set(cat, { categoryId: item.category_id, names: [] })
    const label = item.qty > 1 ? `${item.name} x${item.qty}` : item.name
    grouped.get(cat)!.names.push(label)
  }

  // Sort categories by pinned order, uncategorized last
  const sorted = [...grouped.entries()].sort(([, a], [, b]) => {
    const aIdx = a.categoryId ? pinnedCategories.indexOf(a.categoryId) : -1
    const bIdx = b.categoryId ? pinnedCategories.indexOf(b.categoryId) : -1
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

  const { lang } = JSON.parse(event.body ?? '{}')
  const isHe = lang === 'he'

  const pool = getPool()
  try {
    // ── Check user is linked ─────────────────────────────────────────────────
    const userResult = await pool.query(
      'SELECT telegram_chat_id FROM users WHERE id = $1',
      [user.id]
    )
    const chatId = userResult.rows[0]?.telegram_chat_id
    if (!chatId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'not_linked' }) }
    }

    // ── Get pinned category order ────────────────────────────────────────────
    const listResult = await pool.query(
      'SELECT pinned_categories FROM lists WHERE user_id = $1 LIMIT 1',
      [user.id]
    )
    const pinnedCategories: string[] = listResult.rows[0]?.pinned_categories ?? []

    // ── Get unchecked items ──────────────────────────────────────────────────
    const itemsResult = await pool.query(
      `SELECT
         COALESCE(p.name_he, li.free_text) AS name,
         CASE WHEN $2 THEN c.name_he ELSE c.name_en END AS category,
         li.category_id,
         li.qty
       FROM list_items li
       LEFT JOIN products p  ON li.product_barcode = p.barcode
       LEFT JOIN categories c ON li.category_id    = c.id
       WHERE li.list_id IN (SELECT id FROM lists WHERE user_id = $1)
         AND li.is_checked = false
       ORDER BY li.created_at ASC`,
      [user.id, isHe]
    )

    if (itemsResult.rows.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'empty_list' }) }
    }

    const text = formatList(itemsResult.rows, isHe, pinnedCategories)

    // ── Send to Telegram ─────────────────────────────────────────────────────
    const tgRes = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: Number(chatId), text }),
      }
    )

    if (!tgRes.ok) {
      console.error('[telegram-send] Telegram error:', await tgRes.text())
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'telegram_error' }) }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  } catch (err: any) {
    console.error('[telegram-send] Error:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to send' }) }
  } finally {
    await pool.end()
  }
}
