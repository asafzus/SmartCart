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
         pp.chain_id                    AS chain_id,
         c.name_he                      AS chain_name,
         pp.price,
         pr.promotion_id                AS promo_id,
         pr.description                 AS promo_description,
         pr.discounted_price            AS promo_discounted_price,
         pr.discounted_price_per_mida   AS promo_discounted_price_per_mida,
         pr.min_qty                     AS promo_min_qty,
         pr.max_qty                     AS promo_max_qty,
         pr.min_purchase_amount         AS promo_min_purchase_amount,
         pr.start_date                  AS promo_start_date,
         pr.end_date                    AS promo_end_date,
         pr.is_coupon                   AS promo_is_coupon,
         pr.club_id                     AS promo_club_id
       FROM product_prices pp
       JOIN chains c ON pp.chain_id = c.id
       LEFT JOIN product_promos pr
         ON  pr.product_barcode = pp.product_barcode
         AND pr.chain_id        = pp.chain_id
         AND pr.end_date        > NOW()
       WHERE pp.product_barcode = $1
       ORDER BY pp.price ASC`,
      [barcode]
    )

    const prices = result.rows.map(r => ({
      chainId:   r.chain_id,
      chainName: r.chain_name,
      price:     parseFloat(r.price),
      promo: r.promo_id ? {
        promotionId:            r.promo_id,
        description:            r.promo_description,
        discountedPrice:        r.promo_discounted_price        != null ? parseFloat(r.promo_discounted_price)          : null,
        discountedPricePerMida: r.promo_discounted_price_per_mida != null ? parseFloat(r.promo_discounted_price_per_mida) : null,
        minQty:                 parseFloat(r.promo_min_qty ?? '1'),
        maxQty:                 r.promo_max_qty        != null ? parseFloat(r.promo_max_qty)         : null,
        minPurchaseAmount:      r.promo_min_purchase_amount != null ? parseFloat(r.promo_min_purchase_amount) : null,
        startDate:              r.promo_start_date,
        endDate:                r.promo_end_date,
        isCoupon:               r.promo_is_coupon,
        clubId:                 r.promo_club_id,
      } : null,
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
