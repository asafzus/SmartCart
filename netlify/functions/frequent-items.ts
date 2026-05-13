import type { Handler } from '@netlify/functions'
import { Pool } from 'pg'
import { Redis } from '@upstash/redis'
import { getUser } from '../lib/auth'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

function getPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL! })
}

export const handler: Handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' }
  }

  let user: { id: string; email: string }
  try {
    user = await getUser(event.headers.authorization)
  } catch {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    // ── Get top 8 most-added items for this user ──────────────────────────────
    const members = await redis.zrange(`frequent:${user.id}`, '+inf', '-inf', {
      byScore: true,
      rev: true,
      limit: { offset: 0, count: 8 },
    })

    if (!members || members.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify([]) }
    }

    // ── Split barcodes from free-text entries ─────────────────────────────────
    const barcodes = members.filter((m: any) => !String(m).startsWith('ft:')).map((m: any) => String(m))
    const freeTexts = members.filter((m: any) => String(m).startsWith('ft:')).map((m: any) => String(m).slice(3))

    // ── Look up product names from DB for barcode items ───────────────────────
    let productMap = new Map<string, { name: string; brand: string | null; size: string | null }>()
    if (barcodes.length > 0) {
      const pool = getPool()
      try {
        const placeholders = barcodes.map((_: string, i: number) => `$${i + 1}`).join(', ')
        const result = await pool.query(
          `SELECT barcode, name_he, brand, size FROM products WHERE barcode IN (${placeholders})`,
          barcodes
        )
        for (const row of result.rows) {
          productMap.set(row.barcode, { name: row.name_he, brand: row.brand ?? null, size: row.size ?? null })
        }
      } finally {
        await pool.end()
      }
    }

    // ── Build response in original order (highest frequency first) ────────────
    const items = members.map((m: any) => {
      const member = String(m)
      if (member.startsWith('ft:')) {
        const text = member.slice(3)
        return { barcode: null, freeText: text, name: text, brand: null, size: null }
      }
      const product = productMap.get(member)
      if (!product) return null
      return { barcode: member, freeText: null, name: product.name, brand: product.brand, size: product.size }
    }).filter(Boolean)

    return { statusCode: 200, headers, body: JSON.stringify(items) }
  } catch (err: any) {
    console.error('[frequent-items] Error:', err.message)
    return { statusCode: 200, headers, body: JSON.stringify([]) }
  }
}
