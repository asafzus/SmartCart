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

function toFloat(val: any): number | undefined {
  const n = parseFloat(String(val ?? ''))
  return isNaN(n) || n <= 0 ? undefined : n
}

export function parseShufersalPromos(xml: string): ParsedPromo[] {
  const parsed = xmlParser.parse(xml)
  const root = parsed?.Root ?? parsed?.root ?? parsed?.[Object.keys(parsed)[0]]
  let promos = root?.Promotions?.Promotion ?? []
  if (!Array.isArray(promos)) promos = [promos]

  const result: ParsedPromo[] = []
  const now = new Date()

  for (const p of promos) {
    // ── Dates — new format uses combined ISO datetime, old uses separate date+hour ──
    const endDate = p.PromotionEndDateTime
      ? new Date(p.PromotionEndDateTime)
      : new Date(`${p.PromotionEndDate ?? ''}T${(p.PromotionEndHour ?? '00:00').slice(0, 5)}:00`)
    const startDate = p.PromotionStartDateTime
      ? new Date(p.PromotionStartDateTime)
      : new Date(`${p.PromotionStartDate ?? ''}T${(p.PromotionStartHour ?? '00:00').slice(0, 5)}:00`)
    if (isNaN(endDate.getTime()) || endDate < now) continue

    // ── Skip inactive (old format only — new format omits this field) ─────────
    const isActive = p.AdditionalRestrictions?.AdditionalIsActive ?? 1
    if (String(isActive) === '0') continue

    // ── Shared fields ─────────────────────────────────────────────────────────
    const promotionId = String(p.PromotionID ?? p.PromotionId ?? '').trim()
    const description = String(p.PromotionDescription ?? '').trim()

    // ClubID: new format → "0 - כלל הלקוחות" (strip suffix), old → nested Clubs.ClubId
    const clubRaw = String(p.ClubID ?? p.Clubs?.ClubId ?? p.Clubs?.Clubid ?? '0').trim()
    const clubId = clubRaw.split(/\s*-\s*/)[0].trim()

    // isCoupon: new format → direct field, old → nested in AdditionalRestrictions
    const isCoupon = String(p.AdditionalIsCoupon ?? p.AdditionalRestrictions?.AdditionalIsCoupon ?? '0') === '1'

    // ── New format: Groups > Group > PromotionItems > PromotionItem ───────────
    // Each item gets its own ParsedPromo entry so it carries its own DiscountedPrice
    if (p.Groups) {
      let groups = p.Groups.Group ?? []
      if (!Array.isArray(groups)) groups = [groups]

      groups.forEach((group: any, gIdx: number) => {
        const minPurchaseAmount = toFloat(group.MinPurchaseAmount)
        const groupPromoId = groups.length > 1 ? `${promotionId}-G${gIdx}` : promotionId

        let items = group.PromotionItems?.PromotionItem ?? []
        if (!Array.isArray(items)) items = [items]

        for (const item of items) {
          if (!item?.ItemCode) continue

          result.push({
            promotionId: groupPromoId,
            description,
            discountedPrice:        toFloat(item.DiscountedPrice),
            discountedPricePerMida: toFloat(item.DiscountedPricePerMida),
            minQty:                 parseFloat(String(item.MinQty ?? '1')) || 1,
            maxQty:                 toFloat(item.MaxQty),
            minPurchaseAmount,
            startDate,
            endDate,
            isCoupon,
            clubId,
            itemCodes: [String(item.ItemCode).trim()],
          })
        }
      })

    // ── Old format: flat PromotionItems > Item ────────────────────────────────
    } else {
      const items = p.PromotionItems?.Item ?? []
      const itemArr = Array.isArray(items) ? items : [items]
      const itemCodes = itemArr
        .filter((i: any) => i?.ItemCode)
        .map((i: any) => String(i.ItemCode).trim())
      if (itemCodes.length === 0) continue

      result.push({
        promotionId,
        description,
        discountedPrice:        toFloat(p.DiscountedPrice),
        discountedPricePerMida: toFloat(p.DiscountedPricePerMida),
        minQty:                 parseFloat(String(p.MinQty ?? '1')) || 1,
        maxQty:                 toFloat(p.MaxQty),
        minPurchaseAmount:      toFloat(p.MinPurchaseAmnt),
        startDate,
        endDate,
        isCoupon,
        clubId,
        itemCodes,
      })
    }
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
