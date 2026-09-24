import {
  InactivityFeeInvalidRateError,
  InactivityFeeRateSource,
} from "@/domain/inactivity-fee"
import { usdPerBtcFromRatio } from "@/domain/payments"
import { WalletCurrency } from "@/domain/shared"

import { DealerPriceService } from "@/services/dealer-price"

// One dealer mid-rate for the whole run, straight from the dealer: no price-service fallback,
// no cache, staleness is the dealer's own verdict. A rate under which the fee floors to 0 sats
// cannot size a debit and is refused here, before any lock is taken.
export const pinRate = async ({
  feeAmountUsdCents,
}: {
  feeAmountUsdCents: UsdCents
}): Promise<InactivityFeePinnedRate | ApplicationError> => {
  const ratio = await DealerPriceService().getCentsPerSatsExchangeMidRate()
  if (ratio instanceof Error) return ratio

  const rate = usdPerBtcFromRatio(ratio)
  const feeSats = ratio.convertFromUsdToFloor({
    amount: BigInt(feeAmountUsdCents),
    currency: WalletCurrency.Usd,
  })
  if (feeSats.amount <= 0n) {
    return new InactivityFeeInvalidRateError(
      `${feeAmountUsdCents} cents floors to 0 sats at ${rate} USD/BTC`,
    )
  }

  return { ratio, rate, rateSource: InactivityFeeRateSource.DealerMid }
}
