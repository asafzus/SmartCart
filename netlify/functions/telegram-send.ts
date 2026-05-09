import type { Handler } from '@netlify/functions'
import { Pool } from 'pg'
import { getUser } from '../lib/auth'

function getPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL! })
}

function formatList(
  items: Array<{ name: string; category: string | null; qty: number }>,
  isHe: boolean
): string {
  const uncategorized = isHe ? 'אחר' : 'Other'
  const title = isHe ? 'רשימת הקניות שלי' : 'My Shopping List'

  const grouped = new Map<string, string[]>()
  for (const item of items) {
    const cat = item.category ?? uncategorized
    if (!grouped.has(cat)) grouped.set(cat, [])
    const label = item.qty > 1 ? `${item.name} x${item.qty}` : item.name
    grouped.get(cat)!.push(label)
  }

  const lines: string[] = [title, '']
  for (const [cat, names] of grouped) {
    lines.push(`${cat}:`)
    lines.push('')
    for (const name of names) {
      lines.push(`* ${name}`)
    }
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

    // ── Get unchecked items ──────────────────────────────────────────────────
    const itemsResult = await pool.query(
      `SELECT
         COALESCE(p.name_he, li.free_text) AS name,
         CASE WHEN $2 THEN c.name_he ELSE c.name_en END AS category,
         li.qty
       FROM list_items li
       LEFT JOIN products p  ON li.product_barcode = p.barcode
       LEFT JOIN categories c ON li.category_id    = c.id
       WHERE li.list_id IN (SELECT id FROM lists WHERE user_id = $1)
         AND li.is_checked = false
       ORDER BY c.name_he NULLS LAST, li.created_at ASC`,
      [user.id, isHe]
    )

    if (itemsResult.rows.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'empty_list' }) }
    }

    const text = formatList(itemsResult.rows, isHe)

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
