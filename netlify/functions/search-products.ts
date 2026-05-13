import type { Handler } from '@netlify/functions'
import { Pool } from 'pg'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

function getPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL! })
}

export const handler: Handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' }
  const q = (event.queryStringParameters?.q ?? '').trim()
  const all = event.queryStringParameters?.all === 'true'

  if (q.length < 2) {
    return { statusCode: 200, headers, body: JSON.stringify([]) }
  }

  const pool = getPool()
  try {
    if (all) {
      // ── Search all: go directly to DB, no cache, no limit ─────────────────
      const words = q.trim().split(/\s+/)
      const wordConditions = words.map((_, i) => `name_he ILIKE $${i + 1}`).join(' AND ')
      const wordParams = words.map(w => `%${w}%`)
      const wordsMatchedExpr = words.map((_, i) => `CASE WHEN name_he ILIKE $${i + 1} THEN 1 ELSE 0 END`).join(' + ')

      const result = await pool.query(
        `SELECT barcode, name_he, brand, size,
                similarity(name_he, $${words.length + 1}) AS score,
                (${wordsMatchedExpr}) AS words_matched
         FROM products
         WHERE ${wordConditions}
            OR similarity(name_he, $${words.length + 1}) > 0.15
         ORDER BY words_matched DESC, score DESC`,
        [...wordParams, q]
      )
      const products = result.rows.map(r => ({
        barcode: r.barcode,
        name: r.name_he,
        brand: r.brand ?? null,
        size: r.size ?? null,
      }))
      return { statusCode: 200, headers, body: JSON.stringify(products) }
    }

    // ── Regular search: Redis cache → DB LIMIT 5 ─────────────────────────────
    const cacheKey = `search:v3:${q.toLowerCase()}`
    const cached = await redis.get<object[]>(cacheKey)
    if (cached) {
      return { statusCode: 200, headers, body: JSON.stringify(cached) }
    }

    // Split query into words and require all words to match (any order)
    const words = q.trim().split(/\s+/)
    const wordConditions = words.map((_, i) => `name_he ILIKE $${i + 1}`).join(' AND ')
    const wordParams = words.map(w => `%${w}%`)
    const wordsMatchedExpr = words.map((_, i) => `CASE WHEN name_he ILIKE $${i + 1} THEN 1 ELSE 0 END`).join(' + ')

    const result = await pool.query(
      `SELECT barcode, name_he, brand, size,
              similarity(name_he, $${words.length + 1}) AS score,
              (${wordsMatchedExpr}) AS words_matched
       FROM products
       WHERE ${wordConditions}
          OR similarity(name_he, $${words.length + 1}) > 0.15
       ORDER BY words_matched DESC, score DESC
       LIMIT 5`,
      [...wordParams, q]
    )
    const products = result.rows.map(r => ({
      barcode: r.barcode,
      name: r.name_he,
      brand: r.brand ?? null,
      size: r.size ?? null,
    }))

    // Cache result for 24h
    await redis.set(cacheKey, products, { ex: 86400 })


    return { statusCode: 200, headers, body: JSON.stringify(products) }
  } catch (err: any) {
    console.error('[search-products] Error:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Search failed' }) }
  } finally {
    await pool.end()
  }
}
