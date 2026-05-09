import type { Handler } from '@netlify/functions'
import { Pool } from 'pg'
import { getUser } from '../lib/auth'

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
    user = await getUser(event.headers['authorization'])
  } catch {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  let body: { nameHe?: string; nameEn?: string; emoji?: string; color?: string }
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { nameHe, nameEn, emoji, color } = body
  if (!nameHe || !nameEn || !emoji || !color) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'nameHe, nameEn, emoji, color are required' }) }
  }

  const pool = getPool()
  try {
    const result = await pool.query(
      `INSERT INTO categories (id, user_id, name_he, name_en, emoji, color)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       RETURNING id, name_he, name_en, emoji, color`,
      [user.id, nameHe, nameEn, emoji, color]
    )
    const row = result.rows[0]
    return {
      statusCode: 201,
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
    console.error('[category-add] Error:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to add category' }) }
  } finally {
    await pool.end()
  }
}
