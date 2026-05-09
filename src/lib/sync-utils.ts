import { XMLParser } from 'fast-xml-parser'
import { Redis } from '@upstash/redis'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.ts'
import { gunzipSync } from 'zlib'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedProduct {
  barcode: string
  nameHe: string
  brand?: string
  size?: string
  price: number
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
    signal: AbortSignal.timeout(8000),
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
    signal: AbortSignal.timeout(8000),
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
// Structure: root > Items > Item[]
// Tags: ItemCode, ItemName, ManufacturerName, Quantity, UnitQty, ItemPrice

export function parseShufersal(xml: string): ParsedProduct[] {
  const parsed = xmlParser.parse(xml)
  const items = parsed?.root?.Items?.Item ?? []
  const arr = Array.isArray(items) ? items : [items]

  return arr
    .filter((item: any) => item?.ItemCode && item?.ItemPrice)
    .map((item: any) => ({
      barcode: String(item.ItemCode).trim(),
      nameHe: String(item.ItemName ?? '').trim(),
      brand: item.ManufacturerName ? String(item.ManufacturerName).trim() : undefined,
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

    console.log(`[syncChain:${chainId}] Products done. Upserting prices...`)

    // ── Bulk upsert prices in batches of 500 ───────────────────────────────
    for (let i = 0; i < products.length; i += SQL_BATCH_SIZE) {
      const batch = products.slice(i, i + SQL_BATCH_SIZE)

      const values = batch
        .map((p) => {
          const barcode = p.barcode.replace(/'/g, "''")
          return `(gen_random_uuid(), '${barcode}', '${chainId}', ${p.price}, NOW())`
        })
        .join(',')

      await (prisma as any).$executeRawUnsafe(`
        INSERT INTO product_prices (id, product_barcode, chain_id, price, updated_date)
        VALUES ${values}
        ON CONFLICT (product_barcode, chain_id) DO UPDATE SET
          price        = EXCLUDED.price,
          updated_date = NOW()
      `)
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
