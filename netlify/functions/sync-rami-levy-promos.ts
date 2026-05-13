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

    const now = new Date()

    for (const p of promos) {
      // Skip inactive
      const isActive = p.AdditionalRestrictions?.AdditionalIsActive ?? 1
      if (String(isActive) === '0') continue

      // Dates — new format uses combined ISO datetime, old uses separate date+hour
      const endDate = p.PromotionEndDateTime
        ? new Date(p.PromotionEndDateTime)
        : parseDate(p.PromotionEndDate, p.PromotionEndHour)
      const startDate = p.PromotionStartDateTime
        ? new Date(p.PromotionStartDateTime)
        : parseDate(p.PromotionStartDate, p.PromotionStartHour)
      if (isNaN(endDate.getTime()) || endDate < now) continue

      const promotionId = String(p.PromotionID ?? p.PromotionId ?? '').trim()
      const description = String(p.PromotionDescription ?? '').trim()
      const clubRaw = String(p.ClubID ?? p.Clubs?.ClubId ?? '0').trim()
      const clubId = clubRaw.split(/\s*-\s*/)[0].trim()
      const isCoupon = String(p.AdditionalIsCoupon ?? p.AdditionalRestrictions?.AdditionalIsCoupon ?? '0') === '1'

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
              discountedPricePerMida = toFloat(item.DiscountedPricePerMida)
              minQty = parseFloat(String(item.MinQty ?? '1')) || 1
              maxQty = toFloat(item.MaxQty)
            }
          }

          if (itemCodes.length === 0) return
          const groupPromoId = groups.length > 1 ? `${promotionId}-G${gIdx}` : promotionId
          result.push({ promotionId: groupPromoId, description, discountedPrice, discountedPricePerMida, minQty, maxQty, minPurchaseAmount, startDate, endDate, isCoupon, clubId, itemCodes })
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
