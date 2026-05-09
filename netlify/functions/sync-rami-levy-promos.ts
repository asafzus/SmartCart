import type { Config } from '@netlify/functions'
import * as ftp from 'basic-ftp'
import { XMLParser } from 'fast-xml-parser'
import { gunzipSync } from 'zlib'
import { syncPromos } from '../../src/lib/sync-utils.ts'
import type { ParsedPromo } from '../../src/lib/sync-utils.ts'

const CHAIN_ID = 'rami-levy'
const FTP_HOST = 'url.retail.publishedprices.co.il'
const FTP_USER = 'RamiLevi'
const FTP_PASS = ''
const STORE_ID = '050'

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: true,
  trimValues: true,
})

function parseDate(dateStr: string, hourStr?: string): Date {
  const base = dateStr?.trim() ?? ''
  const hour = (hourStr?.trim() ?? '00:00').slice(0, 5)
  return new Date(`${base}T${hour}:00`)
}

function toFloat(val: any): number | undefined {
  const n = parseFloat(String(val ?? ''))
  return isNaN(n) || n <= 0 ? undefined : n
}

async function fetchRamiLevyPromos(): Promise<ParsedPromo[]> {
  const client = new ftp.Client(30000)
  client.ftp.verbose = false

  try {
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASS,
      secure: false,
    })

    const files = await client.list('/')

    // Find most recent PromoFull file for pinned store
    const promoFiles = files
      .filter(f => f.name.toLowerCase().includes('promofull') && f.name.includes(`-${STORE_ID}-`))
      .sort((a, b) => (b.modifiedAt?.getTime() ?? 0) - (a.modifiedAt?.getTime() ?? 0))

    if (promoFiles.length === 0) throw new Error(`No PromoFull file found for store ${STORE_ID}`)
    const promoFile = promoFiles[0]
    console.log(`[sync-rami-levy-promos] File: ${promoFile.name}`)

    const chunks: Buffer[] = []
    const writable = new (await import('stream')).Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        cb()
      },
    })

    await client.downloadTo(writable, promoFile.name)
    const buffer = Buffer.concat(chunks)
    const xml = promoFile.name.endsWith('.gz')
      ? gunzipSync(buffer).toString('utf-8')
      : buffer.toString('utf-8')

    const parsed = xmlParser.parse(xml)
    const root = parsed?.Root ?? parsed?.root
    let promos = root?.Promotions?.Promotion ?? []
    if (!Array.isArray(promos)) promos = [promos]

    const result: ParsedPromo[] = []

    for (const p of promos) {
      // Skip inactive
      const isActive = p.AdditionalRestrictions?.AdditionalIsActive ?? 1
      if (String(isActive) === '0') continue

      // Dates
      const startDate = parseDate(p.PromotionStartDate, p.PromotionStartHour)
      const endDate   = parseDate(p.PromotionEndDate,   p.PromotionEndHour)
      if (isNaN(endDate.getTime()) || endDate < new Date()) continue

      // Items
      const items = p.PromotionItems?.Item ?? []
      const itemArr = Array.isArray(items) ? items : [items]
      const itemCodes = itemArr
        .filter((i: any) => i?.ItemCode)
        .map((i: any) => String(i.ItemCode).trim())
      if (itemCodes.length === 0) continue

      const clubId = String(p.Clubs?.ClubId ?? '0').trim()

      result.push({
        promotionId:            String(p.PromotionId).trim(),
        description:            String(p.PromotionDescription ?? '').trim(),
        discountedPrice:        toFloat(p.DiscountedPrice),
        discountedPricePerMida: toFloat(p.DiscountedPricePerMida),
        minQty:                 parseFloat(String(p.MinQty ?? '1')) || 1,
        maxQty:                 toFloat(p.MaxQty),
        minPurchaseAmount:      toFloat(p.MinPurchaseAmnt),
        startDate,
        endDate,
        isCoupon:  String(p.AdditionalRestrictions?.AdditionalIsCoupon ?? '0') === '1',
        clubId,
        itemCodes,
      })
    }

    return result
  } finally {
    client.close()
  }
}

export default async function handler() {
  const start = Date.now()
  console.log(`[sync-rami-levy-promos] Starting via FTP...`)

  try {
    const promos = await fetchRamiLevyPromos()
    console.log(`[sync-rami-levy-promos] Parsed ${promos.length} promos`)

    const { promosUpserted } = await syncPromos({ chainId: CHAIN_ID, promos })

    const durationMs = Date.now() - start
    console.log(`[sync-rami-levy-promos] ✅ Done in ${durationMs}ms — promos: ${promosUpserted}`)

    return new Response(
      JSON.stringify({ ok: true, promosUpserted, durationMs }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    const durationMs = Date.now() - start
    console.error(`[sync-rami-levy-promos] ❌ Error after ${durationMs}ms:`, err.message)
    return new Response(
      JSON.stringify({ ok: false, error: err.message, durationMs }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export const config: Config = {
  schedule: '40 3 * * *',
}
