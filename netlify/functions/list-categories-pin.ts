import type { Handler } from '@netlify/functions'
import { Pool } from 'pg'
import { randomUUID } from 'crypto'
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

  const { categoryIds } = JSON.parse(event.body ?? '{}')
  if (!Array.isArray(categoryIds)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'categoryIds must be an array' }) }
  }

  const pool = getPool()
  try {
    const listResult = await pool.query(
      'SELECT id, pinned_categories FROM lists WHERE user_id = $1 LIMIT 1',
      [user.id]
    )

    if (listResult.rows.length === 0) {
      const listId = randomUUID()
      await pool.query(
        'INSERT INTO lists (id, user_id, title, pinned_categories, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [listId, user.id, 'My List', categoryIds]
      )
    } else {
      const listId = listResult.rows[0].id
      const currentPinned: string[] = listResult.rows[0].pinned_categories ?? []
      const removedIds = currentPinned.filter(id => !categoryIds.includes(id))

      await pool.query('BEGIN')
      try {
        // Delete all items belonging to removed categories
        if (removedIds.length > 0) {
          await pool.query(
            'DELETE FROM list_items WHERE list_id = $1 AND category_id = ANY($2::uuid[])',
            [listId, removedIds]
          )
        }

        await pool.query(
          'UPDATE lists SET pinned_categories = $1 WHERE id = $2',
          [categoryIds, listId]
        )

        await pool.query('COMMIT')
      } catch (err) {
        await pool.query('ROLLBACK')
        throw err
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  } catch (err: any) {
    console.error('[list-categories-pin] Error:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to update categories' }) }
  } finally {
    await pool.end()
  }
}
