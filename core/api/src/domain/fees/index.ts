import { FlatFeeStrategy } from "./strategies/flat"
import { PercentageFeeStrategy } from "./strategies/percentage"
import { TieredFeeStrategy } from "./strategies/tiered"
import { InternalAccountFeeStrategy } from "./strategies/internal"
import { ImbalanceFeeStrategy } from "./strategies/imbalance"

import {
  BtcPaymentAmount,
  AmountCalculator,
  paymentAmountFromNumber,
  ValidationError,
  WalletCurrency,
} from "@/domain/shared"

const calc = AmountCalculator()

const FEE_STRATEGIES = {
  flat: FlatFeeStrategy,
  percentage: PercentageFeeStrategy,
  tieredFlat: TieredFeeStrategy,
  internal: InternalAccountFeeStrategy,
  imbalance: ImbalanceFeeStrategy,
} as const

export const calculateCompositeFee = ({
  account,
  wallet,
  paymentAmount,
  networkFee,
  strategies,
}: CalculateCompositeFeeArgs): BtcPaymentAmount | ValidationError => {
  const zeroFee = paymentAmountFromNumber({ amount: 0, currency: WalletCurrency.Btc })
  if (zeroFee instanceof Error) return zeroFee

  let totalFee = networkFee.amount
  const baseArgs = { paymentAmount, networkFee, account, wallet }

  for (const { strategy: type, params } of strategies) {
    const factory = FEE_STRATEGIES[type as keyof typeof FEE_STRATEGIES]

    const strategy: IFeeStrategy | ValidationError = factory
      ? (factory as (p: typeof params) => IFeeStrategy | ValidationError)(params)
      : { calculate: () => zeroFee }
    if (strategy instanceof Error) return strategy

    const currentFee = strategy.calculate({ ...baseArgs, previousFee: totalFee })
    if (currentFee instanceof Error) return currentFee

    totalFee = calc.add(totalFee, currentFee)
  }

  return calc.max(calc.max(totalFee, networkFee.amount), zeroFee)
}
