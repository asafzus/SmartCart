import type { Config } from '@netlify/functions'
import { XMLParser } from 'fast-xml-parser'
import { gunzipSync } from 'zlib'
import { syncPromos } from '../../src/lib/sync-utils.ts'
import type { ParsedPromo } from '../../src/lib/sync-utils.ts'

const CHAIN_ID = 'victory'
const CHAIN_EDI = '7290696200003'
const API_BASE = 'https://laibcatalog.co.il/webapi'
const STORE_ID = '039'

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: true,
  trimValues: true,
})

function toFloat(val: any): number | undefined {
  const n = parseFloat(String(val ?? ''))
  return isNaN(n) || n <= 0 ? undefined : n
}

async function getVictoryPromoFileUrl(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/getfiles?edi=${CHAIN_EDI}`, {
    headers: { 'User-Agent': 'SmartCart/1.0' },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`getfiles failed: ${res.status}`)
  const files: any[] = await res.json()

  // Filter for PromoFull files for our pinned store
  const promoFiles = files
    .filter((f: any) =>
      (f.fileType?.toLowerCase().includes('promofull') || f.fileName?.toLowerCase().includes('promofull')) &&
      f.fileName?.includes(`-${STORE_ID}-`)
    )
    .sort((a: any, b: any) => {
      const dateA = a.fileName?.match(/(\d{8}-\d{6})/)?.[1] ?? ''
      const dateB = b.fileName?.match(/(\d{8}-\d{6})/)?.[1] ?? ''
      return dateB.localeCompare(dateA) // newest first
    })

  if (promoFiles.length === 0) throw new Error(`No PromoFull file found for store ${STORE_ID}`)
  const promoFile = promoFiles[0]

  return `${API_BASE}/${CHAIN_EDI}/${promoFile.fileName}`
}

async function fetchVictoryPromos(): Promise<ParsedPromo[]> {
  const fileUrl = await getVictoryPromoFileUrl()
  const filename = fileUrl.split('/').pop() ?? fileUrl
  console.log(`[sync-victory-promos] File: ${filename}`)

  const res = await fetch(fileUrl, {
    headers: { 'User-Agent': 'SmartCart/1.0' },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`File download failed: ${res.status}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  const xml = fileUrl.endsWith('.gz')
    ? gunzipSync(buffer).toString('utf-8')
    : buffer.toString('utf-8')

  const parsed = xmlParser.parse(xml)
  const root = parsed?.Root ?? parsed?.root
  let promos = root?.Promotions?.Promotion ?? []
  if (!Array.isArray(promos)) promos = [promos]

  const result: ParsedPromo[] = []
  const now = new Date()

  for (const p of promos) {
    // Dates — Victory uses ISO datetime strings (e.g. "2024-01-01T00:00:00")
    const startDate = new Date(p.PromotionStartDateTime ?? p.PromotionStartDate ?? '')
    const endDate   = new Date(p.PromotionEndDateTime   ?? p.PromotionEndDate   ?? '')
    if (isNaN(endDate.getTime()) || endDate < now) continue

    const promotionId = String(p.PromotionID ?? p.PromotionId ?? '').trim()
    const description = String(p.PromotionDescription ?? '').trim()
    const clubId      = String(p.ClubID ?? p.ClubId ?? '0').trim()

    // Victory has no coupons
    const isCoupon = false

    // New format: Groups > Group > PromotionItems > PromotionItem
    if (p.Groups) {
      let groups = p.Groups.Group ?? []
      if (!Array.isArray(groups)) groups = [groups]

      groups.forEach((group: any, gIdx: number) => {
        const minPurchaseAmount = toFloat(group.MinPurchaseAmount)

        let items = group.PromotionItems?.PromotionItem ?? []
        if (!Array.isArray(items)) items = [items]

        const itemCodes: string[] = []
        let discountedPrice: number | undefined
        let discountedPricePerMida: number | undefined
        let minQty = 1
        let maxQty: number | undefined

        for (const item of items) {
          if (!item?.ItemCode) continue
          itemCodes.push(String(item.ItemCode).trim())

          if (discountedPrice === undefined) {
            discountedPrice = toFloat(item.DiscountedPrice)
            discountedPricePerMida = toFloat(item.DiscountedPricePerMida ?? item.DiscountedPricePerUnit)
            minQty = parseFloat(String(item.MinQty ?? '1')) || 1
            maxQty = toFloat(item.MaxQty)
          }
        }

        if (itemCodes.length === 0) return

        const groupPromoId = groups.length > 1 ? `${promotionId}-G${gIdx}` : promotionId

        result.push({
          promotionId: groupPromoId,
          description,
          discountedPrice,
          discountedPricePerMida,
          minQty,
          maxQty,
          minPurchaseAmount,
          startDate,
          endDate,
          isCoupon,
          clubId,
          itemCodes,
        })
      })

    // Old format: flat PromotionItems > Item
    } else {
      const items = p.PromotionItems?.Item ?? []
      const itemArr = Array.isArray(items) ? items : [items]
      const itemCodes = itemArr.filter((i: any) => i?.ItemCode).map((i: any) => String(i.ItemCode).trim())
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
  console.log(`[sync-victory-promos] Starting...`)

  try {
    const promos = await fetchVictoryPromos()
    console.log(`[sync-victory-promos] Parsed ${promos.length} promos`)

    const { promosUpserted } = await syncPromos({ chainId: CHAIN_ID, promos })

    const durationMs = Date.now() - start
    console.log(`[sync-victory-promos] ✅ Done in ${durationMs}ms — promos: ${promosUpserted}`)

    return new Response(
      JSON.stringify({ ok: true, promosUpserted, durationMs }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    const durationMs = Date.now() - start
    console.error(`[sync-victory-promos] ❌ Error after ${durationMs}ms:`, err.message)
    return new Response(
      JSON.stringify({ ok: false, error: err.message, durationMs }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// Scheduled via GitHub Actions — see .github/workflows/sync-victory-promos.yml
export const config: Config = {}
