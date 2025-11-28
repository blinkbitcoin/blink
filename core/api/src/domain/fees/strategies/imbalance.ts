import {
  BtcPaymentAmount,
  AmountCalculator,
  paymentAmountFromNumber,
  ValidationError,
  WalletCurrency,
  BigIntFloatConversionError,
} from "@/domain/shared"

import { toSats } from "@/domain/bitcoin"
import { toCents } from "@/domain/fiat"

const calc = AmountCalculator()

const MS_PER_HOUR = (60 * 60 * 1000) as MilliSeconds
const MS_PER_DAY = (24 * MS_PER_HOUR) as MilliSeconds

export const ImbalanceCalculator = ({
  netInVolumeAmountInboundNetworkFn,
  netInVolumeAmountOutboundNetworkFn,
  sinceDaysAgo,
  priceRatio,
}: ImbalanceCalculatorArgs): ImbalanceCalculator => {
  const since = new Date(new Date().getTime() - sinceDaysAgo * MS_PER_DAY)

  const getNetInboundFlow = async <T extends WalletCurrency>({
    netInVolumeAmountFn,
    wallet,
    since,
  }: {
    netInVolumeAmountFn: NewGetVolumeAmountSinceFn
    wallet: WalletDescriptor<T>
    since: Date
  }) => {
    const volumeAmount = await netInVolumeAmountFn({
      walletDescriptor: wallet,
      timestamp: since,
    })
    if (volumeAmount instanceof Error) return volumeAmount

    return wallet.currency === WalletCurrency.Btc
      ? toSats(volumeAmount.amount)
      : toCents(volumeAmount.amount)
  }

  const getSwapOutImbalanceBtcAmount = async <T extends WalletCurrency>(
    wallet: WalletDescriptor<T>,
  ): Promise<BtcPaymentAmount | LedgerServiceError | ValidationError> => {
    const lnNetInbound = await getNetInboundFlow({
      since,
      wallet,
      netInVolumeAmountFn: netInVolumeAmountInboundNetworkFn,
    })
    if (lnNetInbound instanceof Error) return lnNetInbound

    const onChainNetInbound = await getNetInboundFlow({
      since,
      wallet,
      netInVolumeAmountFn: netInVolumeAmountOutboundNetworkFn,
    })
    if (onChainNetInbound instanceof Error) return onChainNetInbound

    const imbalance = paymentAmountFromNumber<T>({
      amount: lnNetInbound - onChainNetInbound,
      currency: wallet.currency,
    })
    if (imbalance instanceof Error) return imbalance

    if (wallet.currency === WalletCurrency.Usd) {
      return priceRatio.convertFromUsd(imbalance as UsdPaymentAmount)
    }
    return imbalance as BtcPaymentAmount
  }

  return {
    getSwapOutImbalanceBtcAmount,
  }
}

export const ImbalanceFeeStrategy = (
  config: ImbalanceFeeStrategyParams,
): IFeeStrategy | ValidationError => {
  if (!Number.isInteger(config.ratioAsBasisPoints)) {
    return new ValidationError(
      `Invalid ratioAsBasisPoints for imbalance fee: ${config.ratioAsBasisPoints}`,
    )
  }

  if (!Number.isInteger(config.daysLookback)) {
    return new ValidationError(
      `Invalid daysLookback for imbalance fee: ${config.daysLookback}`,
    )
  }

  const thresholdAmount = paymentAmountFromNumber({
    amount: config.threshold,
    currency: WalletCurrency.Btc,
  })
  if (thresholdAmount instanceof BigIntFloatConversionError) {
    return new ValidationError(`Invalid threshold for imbalance fee: ${config.threshold}`)
  }
  if (thresholdAmount instanceof Error) return thresholdAmount

  const minFeeAmount = paymentAmountFromNumber({
    amount: config.minFee,
    currency: WalletCurrency.Btc,
  })
  if (minFeeAmount instanceof BigIntFloatConversionError) {
    return new ValidationError(`Invalid minFee for imbalance fee: ${config.minFee}`)
  }
  if (minFeeAmount instanceof Error) return minFeeAmount

  const calculate = async ({
    paymentAmount,
    imbalanceFns,
    wallet,
  }: FeeCalculationArgs): Promise<BtcPaymentAmount | ValidationError> => {
    const zeroAmount = paymentAmountFromNumber({
      amount: 0,
      currency: WalletCurrency.Btc,
    })
    if (zeroAmount instanceof Error) return zeroAmount

    let actualImbalance: BtcPaymentAmount | undefined
    if (imbalanceFns) {
      const imbalanceCalculator = ImbalanceCalculator({
        ...imbalanceFns,
        sinceDaysAgo: config.daysLookback,
      })
      const swapOutImbalance =
        await imbalanceCalculator.getSwapOutImbalanceBtcAmount(wallet)
      if (swapOutImbalance instanceof Error) return swapOutImbalance
      actualImbalance = swapOutImbalance
    }

    if (!actualImbalance) {
      return zeroAmount
    }

    const amountWithImbalanceCalcs = calc.sub(
      calc.add(actualImbalance, paymentAmount),
      thresholdAmount,
    )

    const baseAmount = calc.max(
      calc.min(amountWithImbalanceCalcs, paymentAmount),
      zeroAmount,
    )

    const calculatedFee = calc.mulBasisPoints(
      baseAmount,
      BigInt(config.ratioAsBasisPoints),
    )

    return calc.max(minFeeAmount, calculatedFee)
  }

  return {
    calculate,
  }
}
