import type { Handler } from '@netlify/functions'
import { Pool } from 'pg'

function getPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL! })
}

export const handler: Handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' }
  }

  const barcode = event.queryStringParameters?.barcode?.trim()
  if (!barcode) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'barcode is required' }) }
  }

  const pool = getPool()
  try {
    const result = await pool.query(
      `SELECT
         pp.chain_id   AS chain_id,
         c.name_he     AS chain_name,
         pp.price
       FROM product_prices pp
       JOIN chains c ON pp.chain_id = c.id
       WHERE pp.product_barcode = $1
       ORDER BY pp.price ASC`,
      [barcode]
    )

    const prices = result.rows.map(r => ({
      chainId:   r.chain_id,
      chainName: r.chain_name,
      price:     parseFloat(r.price),
      // ready for discounts: originalPrice, promoName, discountPrice
    }))

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ prices }),
    }
  } catch (err: any) {
    console.error('[item-prices] Error:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch prices' }) }
  } finally {
    await pool.end()
  }
}
