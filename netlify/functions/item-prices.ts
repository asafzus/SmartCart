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
         pp.chain_id,
         c.name_he                                                    AS chain_name,
         pp.price,
         json_agg(
           json_build_object(
             'promotionId',            pr.promotion_id,
             'description',            pr.description,
             'discountedPrice',        pr.discounted_price,
             'discountedPricePerMida', pr.discounted_price_per_mida,
             'minQty',                 pr.min_qty,
             'maxQty',                 pr.max_qty,
             'minPurchaseAmount',      pr.min_purchase_amount,
             'startDate',              pr.start_date,
             'endDate',                pr.end_date,
             'isCoupon',               pr.is_coupon,
             'clubId',                 pr.club_id
           )
         ) FILTER (WHERE pr.promotion_id IS NOT NULL)                 AS promos
       FROM product_prices pp
       JOIN chains c ON pp.chain_id = c.id
       LEFT JOIN product_promos pr
         ON  pr.product_barcode = pp.product_barcode
         AND pr.chain_id        = pp.chain_id
         AND pr.end_date        > NOW()
       WHERE pp.product_barcode = $1
       GROUP BY pp.chain_id, c.name_he, pp.price
       ORDER BY pp.price ASC`,
      [barcode]
    )

    const prices = result.rows.map(r => ({
      chainId:   r.chain_id,
      chainName: r.chain_name,
      price:     parseFloat(r.price),
      promos:    (r.promos ?? []).map((pr: any) => ({
        promotionId:            pr.promotionId,
        description:            pr.description,
        discountedPrice:        pr.discountedPrice        != null ? parseFloat(pr.discountedPrice)          : null,
        discountedPricePerMida: pr.discountedPricePerMida != null ? parseFloat(pr.discountedPricePerMida)   : null,
        minQty:                 parseFloat(pr.minQty ?? '1'),
        maxQty:                 pr.maxQty                != null ? parseFloat(pr.maxQty)                    : null,
        minPurchaseAmount:      pr.minPurchaseAmount      != null ? parseFloat(pr.minPurchaseAmount)         : null,
        startDate:              pr.startDate,
        endDate:                pr.endDate,
        isCoupon:               pr.isCoupon,
        clubId:                 pr.clubId,
      })),
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
