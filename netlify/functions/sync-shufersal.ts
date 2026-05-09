import type { Config } from '@netlify/functions'
import {
  fetchFirstGzUrl,
  fetchAndDecompress,
  parseShufersal,
  syncChain,
} from '../../src/lib/sync-utils.ts'

const CHAIN_ID = 'shufersal'
const STORE_ID = '123'
const LISTING_URL = `https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=2&storeId=${STORE_ID}`

export default async function handler() {
  const start = Date.now()
  console.log(`[sync-shufersal] Starting sync...`)

  try {
    // Step 1: Get the listing page and extract first .gz URL
    console.log(`[sync-shufersal] Fetching file listing...`)
    const gzUrl = await fetchFirstGzUrl(LISTING_URL)
    const filename = gzUrl.split('/').pop()?.split('?')[0] ?? gzUrl
    console.log(`[sync-shufersal] File: ${filename}`)

    // Step 2: Download and decompress the .gz file
    console.log(`[sync-shufersal] Downloading and decompressing...`)
    const xml = await fetchAndDecompress(gzUrl)
    console.log(`[sync-shufersal] Decompressed XML (${xml.length} chars)`)

    // Step 3: Parse the XML
    const products = parseShufersal(xml)
    console.log(`[sync-shufersal] Parsed ${products.length} products`)

    // Step 4: Upsert into DB + cache in Redis
    const { productsUpserted, pricesUpserted } = await syncChain({
      chainId: CHAIN_ID,
      products,
      isMasterChain: true, // Shufersal = master — its names are canonical
    })

    const durationMs = Date.now() - start
    console.log(`[sync-shufersal] ✅ Done in ${durationMs}ms — products: ${productsUpserted}, prices: ${pricesUpserted}`)

    return new Response(
      JSON.stringify({ ok: true, productsUpserted, pricesUpserted, durationMs }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    const durationMs = Date.now() - start
    console.error(`[sync-shufersal] ❌ Error after ${durationMs}ms:`, err.message)
    return new Response(
      JSON.stringify({ ok: false, error: err.message, durationMs }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export const config: Config = {
  schedule: '0 3 * * *',
}
