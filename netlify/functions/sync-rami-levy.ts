import type { Config } from '@netlify/functions'
import * as ftp from 'basic-ftp'
import { XMLParser } from 'fast-xml-parser'
import { gunzipSync } from 'zlib'
import { syncChain } from '../../src/lib/sync-utils.ts'
import type { ParsedProduct } from '../../src/lib/sync-utils.ts'

const CHAIN_ID = 'rami-levy'
const FTP_HOST = 'url.retail.publishedprices.co.il'
const FTP_USER = 'RamiLevi'
const FTP_PASS = ''
const STORE_ID = '050' // Always sync the same branch for price consistency

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: true,
  trimValues: true,
})

async function fetchRamiLevyProducts(): Promise<ParsedProduct[]> {
  const client = new ftp.Client(30000) // 30s timeout
  client.ftp.verbose = false

  try {
    // Connect to FTP
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASS,
      secure: false,
    })

    // List files in root directory
    const files = await client.list('/')
    console.log(`[sync-rami-levy] Found ${files.length} files on FTP`)

    // Find the most recent PriceFull file for the pinned store
    // Files are named: PriceFull{ChainId}-{SubChain}-{Store}-{Date}-{Time}.gz
    const priceFiles = files
      .filter(f => f.name.toLowerCase().includes('pricefull') && f.name.includes(`-${STORE_ID}-`))
      .sort((a, b) => (b.modifiedAt?.getTime() ?? 0) - (a.modifiedAt?.getTime() ?? 0))

    if (priceFiles.length === 0) throw new Error(`No PriceFull file found for store ${STORE_ID}`)
    const priceFile = priceFiles[0]
    if (!priceFile) throw new Error('No price file found on FTP server')
    console.log(`[sync-rami-levy] File: ${priceFile.name}`)

    // Download file into memory buffer
    const chunks: Buffer[] = []
    const writable = new (await import('stream')).Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        cb()
      },
    })

    await client.downloadTo(writable, priceFile.name)
    const buffer = Buffer.concat(chunks)

    // Decompress if gzipped
    const xml = priceFile.name.endsWith('.gz')
      ? gunzipSync(buffer).toString('utf-8')
      : buffer.toString('utf-8')

    // Parse XML — Rami Levy: Root (capital) > Items > Item
    // Note: ManufactureName (no 'r') differs from Shufersal's ManufacturerName
    const parsed = xmlParser.parse(xml)
    const items = parsed?.Root?.Items?.Item ?? parsed?.root?.Items?.Item ?? []
    const arr = Array.isArray(items) ? items : [items]

    return arr
      .filter((item: any) => item?.ItemCode && item?.ItemPrice)
      .map((item: any) => ({
        barcode: String(item.ItemCode).trim(),
        nameHe: String(item.ItemName ?? '').trim(),
        brand: item.ManufactureName ? String(item.ManufactureName).trim() : undefined,
        size: item.Quantity && item.UnitQty
          ? `${item.Quantity} ${item.UnitQty}`.trim()
          : undefined,
        price: parseFloat(String(item.ItemPrice)) || 0,
      }))
      .filter((p: ParsedProduct) => p.price > 0 && p.barcode.length > 0)

  } finally {
    client.close()
  }
}

export default async function handler() {
  const start = Date.now()
  console.log(`[sync-rami-levy] Starting sync via FTP...`)

  try {
    const products = await fetchRamiLevyProducts()
    console.log(`[sync-rami-levy] Parsed ${products.length} products`)

    const { productsUpserted, pricesUpserted } = await syncChain({
      chainId: CHAIN_ID,
      products,
      isMasterChain: false, // Shufersal is master
    })

    const durationMs = Date.now() - start
    console.log(`[sync-rami-levy] ✅ Done in ${durationMs}ms — products: ${productsUpserted}, prices: ${pricesUpserted}`)

    return new Response(
      JSON.stringify({ ok: true, productsUpserted, pricesUpserted, durationMs }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    const durationMs = Date.now() - start
    console.error(`[sync-rami-levy] ❌ Error after ${durationMs}ms:`, err.message)
    return new Response(
      JSON.stringify({ ok: false, error: err.message, durationMs }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// Run daily at 03:10 UTC (staggered after Shufersal)
export const config: Config = {
  schedule: '10 3 * * *',
}
