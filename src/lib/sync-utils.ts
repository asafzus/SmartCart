import { XMLParser } from 'fast-xml-parser'
import { Redis } from '@upstash/redis'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.ts'
import { gunzipSync } from 'zlib'
import { Pool } from 'pg'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedProduct {
  barcode: string
  nameHe: string
  brand?: string
  size?: string
  price: number
}

export interface ParsedPromo {
  promotionId: string
  description: string
  discountedPrice?: number
  discountedPricePerMida?: number
  minQty: number
  maxQty?: number
  minPurchaseAmount?: number
  startDate: Date
  endDate: Date
  isCoupon: boolean
  clubId: string
  itemCodes: string[]
}

// ─── Prisma client factory ────────────────────────────────────────────────────

export function createPrisma() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}

// ─── Redis client factory ─────────────────────────────────────────────────────

export function createRedis(): Redis {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
}

// ─── Fetch HTML listing and extract first .gz URL ────────────────────────────

export async function fetchFirstGzUrl(listingUrl: string): Promise<string> {
  const res = await fetch(listingUrl, {
    headers: { 'User-Agent': 'SmartCart/1.0' },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`Failed to fetch listing: ${res.status}`)
  const html = await res.text()

  // Extract all https .gz URLs from the HTML
  const gzRegex = /href=["'](https?:\/\/[^"']*\.gz[^"']*)["']/gi
  const links: string[] = []
  let match
  while ((match = gzRegex.exec(html)) !== null) {
    links.push(match[1].replace(/&amp;/g, '&'))
  }

  if (links.length === 0) throw new Error('No .gz file links found in listing page')

  // Prefer aggregated files (3-part: ChainId-SubChain-DateTime, no store segment)
  const aggregated = links.find(l => {
    const filename = l.split('/').pop()?.split('?')[0] ?? ''
    const parts = filename.replace('.gz', '').split('-')
    return parts.length === 3
  })
  if (aggregated) return aggregated

  // For store-specific files, sort by date in filename (YYYYMMDD-HHMMSS) and return newest
  // Pattern: PriceFull{ChainId}-{SubChain}-{Store}-{YYYYMMDD}-{HHMMSS}.gz
  const sorted = [...links].sort((a, b) => {
    const dateA = a.match(/(\d{8}-\d{6})/)?.[1] ?? ''
    const dateB = b.match(/(\d{8}-\d{6})/)?.[1] ?? ''
    return dateB.localeCompare(dateA) // newest first
  })

  return sorted[0]
}

// ─── Download and decompress a .gz file ──────────────────────────────────────

export async function fetchAndDecompress(gzUrl: string): Promise<string> {
  const res = await fetch(gzUrl, {
    headers: { 'User-Agent': 'SmartCart/1.0' },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`Failed to fetch .gz file: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  return gunzipSync(buffer).toString('utf-8')
}

// ─── XML Parser ───────────────────────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  trimValues: true,
})

// ─── Shufersal Parser ─────────────────────────────────────────────────────────
// Structure: Root > Items > Item[]
// Tags: ItemCode, ItemName, ManufactureName, Quantity, UnitQty, ItemPrice

export function parseShufersal(xml: string): ParsedProduct[] {
  const parsed = xmlParser.parse(xml)
  const root = parsed?.Root ?? parsed?.root ?? parsed?.[Object.keys(parsed)[0]]
  const items = root?.Items?.Item ?? []
  const arr = Array.isArray(items) ? items : [items]

  return arr
    .filter((item: any) => item?.ItemCode && item?.ItemPrice)
    .map((item: any) => ({
      barcode: String(item.ItemCode).trim(),
      nameHe: String(item.ItemName ?? '').trim(),
      brand: (item.ManufactureName ?? item.ManufacturerName)
        ? String(item.ManufactureName ?? item.ManufacturerName).trim()
        : undefined,
      size: item.Quantity && item.UnitQty
        ? `${item.Quantity} ${item.UnitQty}`.trim()
        : undefined,
      price: parseFloat(String(item.ItemPrice)) || 0,
    }))
    .filter((p: ParsedProduct) => p.price > 0 && p.barcode.length > 0)
}

// ─── Core Sync Logic ──────────────────────────────────────────────────────────

const REDIS_CACHE_TTL = 60 * 60 * 24 // 24 hours
const SQL_BATCH_SIZE = 500 // rows per bulk SQL query

export async function syncChain(params: {
  chainId: string
  products: ParsedProduct[]
  isMasterChain: boolean
}): Promise<{ productsUpserted: number; pricesUpserted: number }> {
  const { chainId, isMasterChain } = params
  const prisma = createPrisma()
  const redis = createRedis()

  // Deduplicate by barcode — keep last occurrence (in case of duplicates in source file)
  const seen = new Map<string, ParsedProduct>()
  const duplicates: string[] = []
  for (const p of params.products) {
    if (seen.has(p.barcode)) duplicates.push(p.barcode)
    seen.set(p.barcode, p)
  }
  const products = [...seen.values()]

  try {
    if (duplicates.length > 0) {
      console.log(`[syncChain:${chainId}] Duplicates removed (${duplicates.length}): ${duplicates.join(', ')}`)
    }

    // ── Safety guard: never sync an empty product list ─────────────────────
    if (products.length === 0) {
      throw new Error(`[syncChain:${chainId}] Parsed 0 products — aborting to protect existing price data. Check XML format.`)
    }

    console.log(`[syncChain:${chainId}] Upserting ${products.length} products...`)

    // ── Bulk upsert products in batches of 500 ──────────────────────────────
    for (let i = 0; i < products.length; i += SQL_BATCH_SIZE) {
      const batch = products.slice(i, i + SQL_BATCH_SIZE)

      if (isMasterChain) {
        // Master chain: upsert name/brand/size from this chain's data
        const values = batch
          .map((p) => {
            const barcode = p.barcode.replace(/'/g, "''")
            const name = p.nameHe.replace(/'/g, "''")
            const brand = p.brand ? p.brand.replace(/'/g, "''") : null
            const size = p.size ? p.size.replace(/'/g, "''") : null
            return `(gen_random_uuid(), '${barcode}', '${name}', ${brand ? `'${brand}'` : 'NULL'}, ${size ? `'${size}'` : 'NULL'}, NOW())`
          })
          .join(',')

        await (prisma as any).$executeRawUnsafe(`
          INSERT INTO products (id, barcode, name_he, brand, size, updated_date)
          VALUES ${values}
          ON CONFLICT (barcode) DO UPDATE SET
            name_he    = EXCLUDED.name_he,
            brand      = EXCLUDED.brand,
            size       = EXCLUDED.size,
            updated_date = NOW()
        `)
      } else {
        // Non-master: insert if new, never overwrite canonical names
        const values = batch
          .map((p) => {
            const barcode = p.barcode.replace(/'/g, "''")
            const name = p.nameHe.replace(/'/g, "''")
            const brand = p.brand ? p.brand.replace(/'/g, "''") : null
            const size = p.size ? p.size.replace(/'/g, "''") : null
            return `(gen_random_uuid(), '${barcode}', '${name}', ${brand ? `'${brand}'` : 'NULL'}, ${size ? `'${size}'` : 'NULL'}, NOW())`
          })
          .join(',')

        await (prisma as any).$executeRawUnsafe(`
          INSERT INTO products (id, barcode, name_he, brand, size, updated_date)
          VALUES ${values}
          ON CONFLICT (barcode) DO UPDATE SET
            updated_date = NOW()
        `)
      }
    }

    console.log(`[syncChain:${chainId}] Products done. Syncing prices in transaction...`)

    // ── Sync prices: DELETE chain rows, then INSERT fresh in a transaction ──
    {
      const pgPool = new Pool({ connectionString: process.env.DATABASE_URL! })
      const client = await pgPool.connect()
      try {
        await client.query('BEGIN')

        // Wipe all existing prices for this chain
        await client.query('DELETE FROM product_prices WHERE chain_id = $1', [chainId])

        // Insert fresh prices in batches
        for (let i = 0; i < products.length; i += SQL_BATCH_SIZE) {
          const batch = products.slice(i, i + SQL_BATCH_SIZE)
          const values = batch
            .map((p) => {
              const barcode = p.barcode.replace(/'/g, "''")
              return `(gen_random_uuid(), '${barcode}', '${chainId}', ${p.price}, NOW())`
            })
            .join(',')

          await client.query(`
            INSERT INTO product_prices (id, product_barcode, chain_id, price, updated_date)
            VALUES ${values}
          `)
        }

        await client.query('COMMIT')
        console.log(`[syncChain:${chainId}] Prices transaction committed.`)
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
        await pgPool.end()
      }
    }

    console.log(`[syncChain:${chainId}] Prices done. Updating chain timestamp...`)

    // ── Update chain last_synced_at ─────────────────────────────────────────
    await (prisma as any).chain.update({
      where: { id: chainId },
      data: { lastSyncedAt: new Date() },
    })

    // ── Cache sync summary in Redis ─────────────────────────────────────────
    await redis.setex(
      `sync:${chainId}:last`,
      REDIS_CACHE_TTL,
      JSON.stringify({
        chainId,
        productsUpserted: products.length,
        pricesUpserted: products.length,
        syncedAt: new Date().toISOString(),
      })
    )

    return { productsUpserted: products.length, pricesUpserted: products.length }
  } finally {
    await (prisma as any).$disconnect()
  }
}

// ─── Promo Sync ───────────────────────────────────────────────────────────────

export async function syncPromos(params: {
  chainId: string
  promos: ParsedPromo[]
}): Promise<{ promosUpserted: number }> {
  const { chainId, promos } = params

  // ── Safety guard: never sync an empty promo list ───────────────────────────
  if (promos.length === 0) {
    throw new Error(`[syncPromos:${chainId}] Parsed 0 promos — aborting to protect existing promo data. Check XML format.`)
  }

  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! })

  try {
    // ── Fetch known barcodes for this chain ────────────────────────────────────
    const knownResult = await pool.query(
      `SELECT product_barcode FROM product_prices WHERE chain_id = $1`,
      [chainId]
    )
    const knownBarcodes = new Set(knownResult.rows.map((r: any) => String(r.product_barcode)))
    console.log(`[syncPromos:${chainId}] Known barcodes: ${knownBarcodes.size}`)

    // ── Flatten promos into rows, filtering to known barcodes ─────────────────
    const rows: {
      promotionId: string
      barcode: string
      description: string
      discountedPrice: number | null
      discountedPricePerMida: number | null
      minQty: number
      maxQty: number | null
      minPurchaseAmount: number | null
      startDate: Date
      endDate: Date
      isCoupon: boolean
      clubId: string
    }[] = []

    for (const promo of promos) {
      for (const barcode of promo.itemCodes) {
        if (!knownBarcodes.has(barcode)) continue
        rows.push({
          promotionId: promo.promotionId,
          barcode,
          description: promo.description,
          discountedPrice: promo.discountedPrice ?? null,
          discountedPricePerMida: promo.discountedPricePerMida ?? null,
          minQty: promo.minQty,
          maxQty: promo.maxQty ?? null,
          minPurchaseAmount: promo.minPurchaseAmount ?? null,
          startDate: promo.startDate,
          endDate: promo.endDate,
          isCoupon: promo.isCoupon,
          clubId: promo.clubId,
        })
      }
    }

    // Deduplicate by (promotionId, barcode) — same combo can appear if a barcode
    // is listed more than once within a single promotion's item list
    const seen = new Map<string, typeof rows[number]>()
    for (const row of rows) {
      seen.set(`${row.promotionId}:${row.barcode}`, row)
    }
    const dedupedRows = [...seen.values()]

    console.log(`[syncPromos:${chainId}] Rows to insert: ${dedupedRows.length} (${rows.length - dedupedRows.length} duplicates removed)`)

    // ── Transaction: delete chain promos + bulk insert ─────────────────────────
    await pool.query('BEGIN')
    try {
      await pool.query(`DELETE FROM product_promos WHERE chain_id = $1`, [chainId])

      if (dedupedRows.length > 0) {
        for (let i = 0; i < dedupedRows.length; i += SQL_BATCH_SIZE) {
          const batch = dedupedRows.slice(i, i + SQL_BATCH_SIZE)
          const values = batch.map((_r, idx) => {
            const base = idx * 13
            return `(gen_random_uuid(), $${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7}, $${base+8}, $${base+9}, $${base+10}, $${base+11}, $${base+12}, $${base+13}, NOW())`
          }).join(',')

          const flatParams = batch.flatMap(r => [
            r.barcode, chainId, r.promotionId, r.description,
            r.discountedPrice, r.discountedPricePerMida,
            r.minQty, r.maxQty, r.minPurchaseAmount,
            r.startDate, r.endDate, r.isCoupon, r.clubId,
          ])

          await pool.query(
            `INSERT INTO product_promos
               (id, product_barcode, chain_id, promotion_id, description,
                discounted_price, discounted_price_per_mida,
                min_qty, max_qty, min_purchase_amount,
                start_date, end_date, is_coupon, club_id, updated_at)
             VALUES ${values}
             ON CONFLICT (product_barcode, chain_id, promotion_id) DO UPDATE SET
               description             = EXCLUDED.description,
               discounted_price        = EXCLUDED.discounted_price,
               discounted_price_per_mida = EXCLUDED.discounted_price_per_mida,
               min_qty                 = EXCLUDED.min_qty,
               max_qty                 = EXCLUDED.max_qty,
               min_purchase_amount     = EXCLUDED.min_purchase_amount,
               start_date              = EXCLUDED.start_date,
               end_date                = EXCLUDED.end_date,
               is_coupon               = EXCLUDED.is_coupon,
               club_id                 = EXCLUDED.club_id,
               updated_at              = NOW()`,
            flatParams
          )
        }
      }

      await pool.query('COMMIT')
    } catch (err) {
      await pool.query('ROLLBACK')
      throw err
    }

    return { promosUpserted: dedupedRows.length }
  } finally {
    await pool.end()
  }
}
