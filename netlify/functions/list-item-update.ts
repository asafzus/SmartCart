import type { Handler } from '@netlify/functions'
import { Pool } from 'pg'
import { getUser } from '../lib/auth'

function getPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL! })
}

export const handler: Handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' }

  if (event.httpMethod !== 'PATCH') {
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
    const { id, isChecked, qty } = JSON.parse(event.body ?? '{}')

    if (!id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) }
    }

    // ── Verify the item belongs to this user ─────────────────────────────────
    const check = await pool.query(
      `SELECT li.id FROM list_items li
       JOIN lists l ON li.list_id = l.id
       WHERE li.id = $1 AND l.user_id = $2`,
      [id, user.id]
    )

    if (check.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Item not found' }) }
    }

    // ── Build update dynamically based on what was provided ───────────────────
    const updates: string[] = []
    const values: any[] = []
    let idx = 1

    if (isChecked !== undefined) {
      updates.push(`is_checked = $${idx++}`)
      values.push(isChecked)
    }
    if (qty !== undefined) {
      updates.push(`qty = $${idx++}`)
      values.push(qty)
    }

    if (updates.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nothing to update' }) }
    }

    values.push(id)
    await pool.query(
      `UPDATE list_items SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    )

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  } catch (err: any) {
    console.error('[list-item-update] Error:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to update item' }) }
  } finally {
    await pool.end()
  }
}
