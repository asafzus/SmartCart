import type { Config } from '@netlify/functions'
import { XMLParser } from 'fast-xml-parser'
import { gunzipSync } from 'zlib'
import { syncChain, createPrisma, createRedis } from '../../src/lib/sync-utils.ts'
import type { ParsedProduct } from '../../src/lib/sync-utils.ts'

const CHAIN_ID = 'victory'
const CHAIN_EDI = '7290696200003'
const API_BASE = 'https://laibcatalog.co.il/webapi'
const STORE_ID = '039' // Always sync the same branch for price consistency

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: true,
  trimValues: true,
})

async function getVictoryFileUrl(): Promise<string> {
  // Step 1: get list of available files for this chain
  const res = await fetch(`${API_BASE}/api/getfiles?edi=${CHAIN_EDI}`, {
    headers: { 'User-Agent': 'SmartCart/1.0' },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`getfiles failed: ${res.status}`)
  const files: any[] = await res.json()

  // Step 2: find the most recent PriceFull file for the pinned store
  const priceFiles = files
    .filter((f: any) =>
      (f.fileType?.toLowerCase().includes('pricefull') || f.fileName?.toLowerCase().includes('pricefull')) &&
      f.fileName?.includes(`-${STORE_ID}-`)
    )
    .sort((a: any, b: any) => {
      const dateA = a.fileName?.match(/(\d{8}-\d{6})/)?.[1] ?? ''
      const dateB = b.fileName?.match(/(\d{8}-\d{6})/)?.[1] ?? ''
      return dateB.localeCompare(dateA) // newest first
    })

  if (priceFiles.length === 0) throw new Error(`No PriceFull file found for store ${STORE_ID}`)
  const priceFile = priceFiles[0]

  return `${API_BASE}/${CHAIN_EDI}/${priceFile.fileName}`
}

async function fetchAndParseVictory(): Promise<ParsedProduct[]> {
  const fileUrl = await getVictoryFileUrl()
  const filename = fileUrl.split('/').pop() ?? fileUrl
  console.log(`[sync-victory] File: ${filename}`)

  const res = await fetch(fileUrl, {
    headers: { 'User-Agent': 'SmartCart/1.0' },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`File download failed: ${res.status}`)

  // Decompress if gzipped
  const buffer = Buffer.from(await res.arrayBuffer())
  const xml = fileUrl.endsWith('.gz')
    ? gunzipSync(buffer).toString('utf-8')
    : buffer.toString('utf-8')

  const parsed = xmlParser.parse(xml)

  // Victory XML: root > Items > Item  OR  Prices > Products > Product
  const items =
    parsed?.root?.Items?.Item ??
    parsed?.Prices?.Products?.Product ??
    parsed?.Root?.Items?.Item ??
    []

  const arr = Array.isArray(items) ? items : [items]

  return arr
    .filter((item: any) => (item?.ItemCode || item?.Barcode) && item?.ItemPrice)
    .map((item: any) => ({
      barcode: String(item.ItemCode ?? item.Barcode).trim(),
      nameHe: String(item.ItemName ?? item.ProductName ?? '').trim(),
      brand: (item.ManufacturerName ?? item.ManufactureName)
        ? String(item.ManufacturerName ?? item.ManufactureName).trim()
        : undefined,
      size: item.Quantity && item.UnitQty
        ? `${item.Quantity} ${item.UnitQty}`.trim()
        : undefined,
      price: parseFloat(String(item.ItemPrice)) || 0,
    }))
    .filter((p: ParsedProduct) => p.price > 0 && p.barcode.length > 0)
}

export default async function handler() {
  const start = Date.now()
  console.log(`[sync-victory] Starting sync...`)

  try {
    const products = await fetchAndParseVictory()
    console.log(`[sync-victory] Parsed ${products.length} products`)

    const { productsUpserted, pricesUpserted } = await syncChain({
      chainId: CHAIN_ID,
      products,
      isMasterChain: false,
    })

    const durationMs = Date.now() - start
    console.log(`[sync-victory] ✅ Done in ${durationMs}ms — products: ${productsUpserted}, prices: ${pricesUpserted}`)

    return new Response(
      JSON.stringify({ ok: true, productsUpserted, pricesUpserted, durationMs }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    const durationMs = Date.now() - start
    console.error(`[sync-victory] ❌ Error after ${durationMs}ms:`, err.message)
    return new Response(
      JSON.stringify({ ok: false, error: err.message, durationMs }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// Scheduled via GitHub Actions — see .github/workflows/sync-victory.yml
export const config: Config = {}
