import type { Config } from '@netlify/functions'
import { XMLParser } from 'fast-xml-parser'
import { fetchFirstGzUrl, fetchAndDecompress, syncPromos } from '../../src/lib/sync-utils.ts'
import type { ParsedPromo } from '../../src/lib/sync-utils.ts'

const CHAIN_ID = 'shufersal'
const STORE_ID = '123'
// catID=4 serves PromoFull files (catID=2 is PriceFull)
const LISTING_URL = `https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=4&storeId=${STORE_ID}`

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

export function parseShufersalPromos(xml: string): ParsedPromo[] {
  const parsed = xmlParser.parse(xml)
  const root = parsed?.root ?? parsed?.Root
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

    // Club — handle both ClubId and Clubid (inconsistent casing in Shufersal XML)
    const clubId = String(p.Clubs?.ClubId ?? p.Clubs?.Clubid ?? '0').trim()

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
}

export default async function handler() {
  const start = Date.now()
  console.log(`[sync-shufersal-promos] Starting...`)

  try {
    const gzUrl = await fetchFirstGzUrl(LISTING_URL)
    const filename = gzUrl.split('/').pop()?.split('?')[0] ?? gzUrl
    console.log(`[sync-shufersal-promos] File: ${filename}`)

    const xml = await fetchAndDecompress(gzUrl)
    const promos = parseShufersalPromos(xml)
    console.log(`[sync-shufersal-promos] Parsed ${promos.length} promos`)

    const { promosUpserted } = await syncPromos({ chainId: CHAIN_ID, promos })

    const durationMs = Date.now() - start
    console.log(`[sync-shufersal-promos] ✅ Done in ${durationMs}ms — promos: ${promosUpserted}`)

    return new Response(
      JSON.stringify({ ok: true, promosUpserted, durationMs }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    const durationMs = Date.now() - start
    console.error(`[sync-shufersal-promos] ❌ Error after ${durationMs}ms:`, err.message)
    return new Response(
      JSON.stringify({ ok: false, error: err.message, durationMs }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export const config: Config = {
  schedule: '30 3 * * *',
}
