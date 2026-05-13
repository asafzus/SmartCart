import { useTranslation } from 'react-i18next'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PromoInfo {
  promotionId: string
  description: string
  discountedPrice: number | null
  discountedPricePerMida: number | null
  minQty: number
  maxQty: number | null
  minPurchaseAmount: number | null
  startDate: string
  endDate: string
  isCoupon: boolean
  clubId: string
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PromoPopupProps {
  chainName: string
  promos: PromoInfo[]
  onClose: () => void
}

export default function PromoPopup({ chainName, promos, onClose }: PromoPopupProps) {
  const { t, i18n } = useTranslation()
  const isHe = i18n.language === 'he'

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[60]" onClick={onClose} />
      <div
        className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-surface-container-lowest rounded-2xl z-[60] shadow-2xl max-h-[80vh] overflow-y-auto"
        dir={isHe ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-lg pt-lg pb-md border-b border-outline-variant">
          <p className="font-jakarta font-bold text-body-lg text-on-surface">{chainName}</p>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Promo list */}
        <div className="px-lg py-md space-y-md">
          {promos.map((promo, i) => {
            const isCoupon = promo.isCoupon
            const isMembersOnly = promo.clubId !== '0'
            const perItemPrice =
              promo.discountedPrice != null ? promo.discountedPrice / (promo.minQty || 1) : null
            const endDate = new Date(promo.endDate).toLocaleDateString(
              isHe ? 'he-IL' : 'en-IL',
              { day: '2-digit', month: '2-digit', year: '2-digit' }
            )

            return (
              <div
                key={promo.promotionId ?? i}
                className="bg-surface-container rounded-xl p-md space-y-xs"
              >
                {/* Badges */}
                <div className="flex items-center gap-xs flex-wrap">
                  {isCoupon ? (
                    <span className="text-xs px-xs py-0.5 rounded-full font-semibold font-jakarta bg-tertiary-container text-on-tertiary-container">
                      {t('item.coupon')}
                    </span>
                  ) : (
                    <span className="text-xs px-xs py-0.5 rounded-full font-semibold font-jakarta bg-secondary-container text-on-secondary-container">
                      {t('item.promo')}
                    </span>
                  )}
                  {isMembersOnly && (
                    <span className="text-xs px-xs py-0.5 rounded-full font-semibold font-jakarta bg-surface-container-high text-on-surface-variant">
                      🏷️ {t('item.membersOnly')}
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="font-jakarta text-body-md text-on-surface font-semibold">
                  {promo.description}
                </p>

                {/* Deal details */}
                <div className="space-y-0.5">
                  {promo.discountedPrice != null && (
                    <p className="font-jakarta text-body-md text-secondary font-semibold">
                      {promo.minQty > 1
                        ? t('item.promoMinQty', {
                            qty: promo.minQty,
                            total: promo.discountedPrice.toFixed(2),
                          })
                        : `₪${promo.discountedPrice.toFixed(2)}`}
                    </p>
                  )}
                  {promo.minQty > 1 && perItemPrice != null && (
                    <p className="font-jakarta text-label-sm text-on-surface-variant">
                      {isHe
                        ? `₪${perItemPrice.toFixed(2)} ליחידה`
                        : `₪${perItemPrice.toFixed(2)} per item`}
                    </p>
                  )}
                  {promo.maxQty != null && (
                    <p className="font-jakarta text-label-sm text-on-surface-variant">
                      {isHe ? `מקסימום ${promo.maxQty} יחידות` : `Max ${promo.maxQty} units`}
                    </p>
                  )}
                  {promo.minPurchaseAmount != null && promo.minPurchaseAmount > 0 && (
                    <p className="font-jakarta text-label-sm text-on-surface-variant">
                      {isHe
                        ? `מינימום רכישה ₪${promo.minPurchaseAmount.toFixed(2)}`
                        : `Min. purchase ₪${promo.minPurchaseAmount.toFixed(2)}`}
                    </p>
                  )}
                </div>

                {/* End date */}
                <p className="font-jakarta text-label-sm text-outline">
                  {isHe ? `בתוקף עד ${endDate}` : `Valid until ${endDate}`}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
