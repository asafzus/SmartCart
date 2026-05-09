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
    user = await getUser(event.headers['authorization'])
  } catch {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  let body: { id?: string }
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { id } = body
  if (!id) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) }
  }

  const pool = getPool()
  try {
    // Unset category from any list items that use it first
    await pool.query(
      `UPDATE list_items SET category_id = NULL WHERE category_id = $1`,
      [id]
    )

    const result = await pool.query(
      `DELETE FROM categories WHERE id = $1 AND user_id = $2`,
      [id, user.id]
    )
    if (result.rowCount === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Category not found' }) }
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  } catch (err: any) {
    console.error('[category-delete] Error:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to delete category' }) }
  } finally {
    await pool.end()
  }
}
