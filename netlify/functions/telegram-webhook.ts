import type { Handler } from '@netlify/functions'
import { Pool } from 'pg'

function getPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL! })
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN!
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let update: any
  try {
    update = JSON.parse(event.body ?? '{}')
  } catch {
    return { statusCode: 200, body: 'ok' }
  }

  const message = update?.message
  if (!message) return { statusCode: 200, body: 'ok' }

  const chatId: number = message.chat?.id
  const text: string = message.text ?? ''
  const firstName: string = message.from?.first_name ?? ''

  if (!chatId) return { statusCode: 200, body: 'ok' }

  if (text.startsWith('/start')) {
    const code = generateCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    const pool = getPool()
    try {
      // Remove any existing codes for this chat, then insert a fresh one
      await pool.query('DELETE FROM telegram_link_codes WHERE chat_id = $1', [String(chatId)])
      await pool.query(
        'INSERT INTO telegram_link_codes (code, chat_id, expires_at) VALUES ($1, $2, $3)',
        [code, String(chatId), expiresAt]
      )
    } catch (err: any) {
      console.error('[telegram-webhook] DB error:', err.message)
      await sendMessage(chatId, '❌ שגיאה. נסה שוב מאוחר יותר.')
      return { statusCode: 200, body: 'ok' }
    } finally {
      await pool.end()
    }

    const replyText =
      `👋 שלום ${firstName}!\n\n` +
      `🔑 קוד הקישור שלך: <b>${code}</b>\n\n` +
      `⏱ הקוד תקף ל-10 דקות.\n\n` +
      `הזן קוד זה בסמארטקארט כדי לקשר את חשבון הטלגרם שלך.`

    await sendMessage(chatId, replyText)
  }

  return { statusCode: 200, body: 'ok' }
}
