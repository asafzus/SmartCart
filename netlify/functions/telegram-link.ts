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

  let body: any
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_body' }) }
  }

  const code = String(body.code ?? '').trim()
  if (!/^\d{6}$/.test(code)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_code' }) }
  }

  const pool = getPool()
  try {
    const result = await pool.query(
      'SELECT chat_id, expires_at FROM telegram_link_codes WHERE code = $1',
      [code]
    )

    if (result.rows.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_code' }) }
    }

    const { chat_id, expires_at } = result.rows[0]

    if (new Date(expires_at) < new Date()) {
      await pool.query('DELETE FROM telegram_link_codes WHERE code = $1', [code])
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'expired_code' }) }
    }

    // Link the Telegram chat to the user account
    await pool.query(
      'UPDATE users SET telegram_chat_id = $1 WHERE id = $2',
      [BigInt(chat_id), user.id]
    )

    // Consume the code so it can't be reused
    await pool.query('DELETE FROM telegram_link_codes WHERE code = $1', [code])

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  } catch (err: any) {
    console.error('[telegram-link] Error:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'server_error' }) }
  } finally {
    await pool.end()
  }
}
