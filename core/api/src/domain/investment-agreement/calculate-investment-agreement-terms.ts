import { InvalidInvestmentAgreementBtcPriceError } from "./errors"

import { SATS_PER_BTC, toSats } from "@/domain/bitcoin"
import { CENTS_PER_USD, toCents, UsdDisplayCurrency } from "@/domain/fiat"
import { AmountCalculator, safeIntFromBigInt, WalletCurrency } from "@/domain/shared"

const calc = AmountCalculator()

export const calculateInvestmentAgreementTerms = ({
  units,
  pricePerUnitUsdCents,
  preMoneyValuationUsdCents,
  btcPrice,
}: CalculateInvestmentAgreementTermsArgs): InvestmentAgreementTerms | ValidationError => {
  const btcUsdRateCents = Math.round(btcPrice.price * SATS_PER_BTC * CENTS_PER_USD)
  const isUsdPrice = btcPrice.currency === UsdDisplayCurrency
  const isValidRate = Number.isSafeInteger(btcUsdRateCents) && btcUsdRateCents > 0
  if (!isUsdPrice || !isValidRate) {
    return new InvalidInvestmentAgreementBtcPriceError(
      `${btcPrice.price} ${btcPrice.currency}`,
    )
  }

  const totalUsdCents = toCents(units * pricePerUnitUsdCents)

  const settlement = calc.divCeil(
    {
      amount: BigInt(totalUsdCents) * BigInt(SATS_PER_BTC),
      currency: WalletCurrency.Btc,
    },
    BigInt(btcUsdRateCents),
  )
  const settlementSats = safeIntFromBigInt(settlement.amount)
  if (settlementSats instanceof Error) return settlementSats

  return {
    units,
    pricePerUnitUsdCents,
    totalUsdCents,
    preMoneyValuationUsdCents,
    btcUsdRateCents: btcUsdRateCents as UsdCentsPerBtc,
    settlementSats: toSats(settlementSats),
    quotedAt: btcPrice.timestamp,
  }
}
