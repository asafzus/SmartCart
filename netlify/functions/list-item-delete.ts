import type { Handler } from '@netlify/functions'
import { Pool } from 'pg'
import { getUser } from '../lib/auth'

function getPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL! })
}

export const handler: Handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' }

  if (event.httpMethod !== 'DELETE') {
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
    const { id } = JSON.parse(event.body ?? '{}')

    if (!id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) }
    }

    // Delete only if it belongs to this user's list
    const result = await pool.query(
      `DELETE FROM list_items
       WHERE id = $1
         AND list_id IN (SELECT id FROM lists WHERE user_id = $2)`,
      [id, user.id]
    )

    if (result.rowCount === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Item not found' }) }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  } catch (err: any) {
    console.error('[list-item-delete] Error:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to delete item' }) }
  } finally {
    await pool.end()
  }
}
