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
    user = await getUser(event.headers['authorization'])
  } catch {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  let body: { id?: string; nameHe?: string; nameEn?: string; emoji?: string; color?: string }
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { id, nameHe, nameEn, emoji, color } = body
  if (!id || !nameHe || !nameEn || !emoji || !color) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'id, nameHe, nameEn, emoji, color are required' }) }
  }

  const pool = getPool()
  try {
    const result = await pool.query(
      `UPDATE categories
       SET name_he = $1, name_en = $2, emoji = $3, color = $4
       WHERE id = $5 AND user_id = $6
       RETURNING id, name_he, name_en, emoji, color`,
      [nameHe, nameEn, emoji, color, id, user.id]
    )
    if (result.rowCount === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Category not found' }) }
    }
    const row = result.rows[0]
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        category: {
          id: row.id,
          nameHe: row.name_he,
          nameEn: row.name_en,
          emoji: row.emoji,
          color: row.color,
        },
      }),
    }
  } catch (err: any) {
    console.error('[category-update] Error:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to update category' }) }
  } finally {
    await pool.end()
  }
}
