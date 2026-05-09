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
    user = await getUser(event.headers.authorization)
  } catch {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  const pool = getPool()
  try {
    await pool.query(
      'UPDATE users SET telegram_chat_id = NULL WHERE id = $1',
      [user.id]
    )
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  } catch (err: any) {
    console.error('[telegram-unlink] Error:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to unlink' }) }
  } finally {
    await pool.end()
  }
}
