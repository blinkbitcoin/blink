import { FlatFeeStrategy } from "./strategies/flat"
import { PercentageFeeStrategy } from "./strategies/percentage"
import { TieredFeeStrategy } from "./strategies/tiered"
import { ExemptAccountFeeStrategy } from "./strategies/exempt-account"
import { ImbalanceFeeStrategy } from "./strategies/imbalance"
import { ExponentialDecayStrategy } from "./strategies/exponential-decay"

import {
  getOnchainNetworkConfig,
  getLightningNetworkConfig,
  getIntraledgerNetworkConfig,
} from "@/config"

import {
  AmountCalculator,
  paymentAmountFromNumber,
  ValidationError,
  WalletCurrency,
  ZERO_SATS,
} from "@/domain/shared"

const ZERO_NETWORK_FEE = { amount: ZERO_SATS, feeRate: 0 }

const calc = AmountCalculator()

const FEE_STRATEGIES = {
  flat: FlatFeeStrategy,
  percentage: PercentageFeeStrategy,
  tieredFlat: TieredFeeStrategy,
  exemptAccount: ExemptAccountFeeStrategy,
  imbalance: ImbalanceFeeStrategy,
  exponentialDecay: ExponentialDecayStrategy,
} as const

export const calculateCompositeFee = async ({
  accountId,
  accountRole,
  wallet,
  paymentAmount,
  networkFee,
  strategies,
  imbalanceFns,
  isValidatedMerchant,
}: CalculateCompositeFeeArgs): Promise<FeeDetails | ValidationError> => {
  const zeroFee = paymentAmountFromNumber({ amount: 0, currency: WalletCurrency.Btc })
  if (zeroFee instanceof Error) return zeroFee

  let feeDetails: FeeDetails = {
    bankFee: zeroFee,
    minerFee: networkFee.amount,
    totalFee: networkFee.amount,
  }

  const baseArgs = {
    paymentAmount,
    networkFee,
    accountId,
    accountRole,
    wallet,
    imbalanceFns,
    isValidatedMerchant,
  }

  for (const { strategy: type, params } of strategies) {
    const factory = FEE_STRATEGIES[type as keyof typeof FEE_STRATEGIES]

    const strategy = factory
      ? (factory as (p: typeof params) => IFeeStrategy | ValidationError)(params)
      : { calculate: async () => zeroFee }
    if (strategy instanceof Error) return strategy

    const fee = await strategy.calculate({ ...baseArgs, previousFee: feeDetails })
    if (fee instanceof Error) return fee

    const bankFee = calc.add(feeDetails.bankFee, fee)
    feeDetails = {
      minerFee: networkFee.amount,
      bankFee,
      totalFee: calc.add(bankFee, networkFee.amount),
    }
  }
  const bankFee = calc.max(feeDetails.bankFee, zeroFee)
  const totalFee = calc.add(bankFee, networkFee.amount)
  return {
    minerFee: networkFee.amount,
    bankFee,
    totalFee: calc.max(totalFee, zeroFee),
  }
}

export const DepositFeeCalculator = (): DepositFeeCalculator => {
  const onChainFee = async ({
    paymentAmount,
    accountId,
    accountRole,
    wallet,
    isValidatedMerchant,
  }: OnChainDepositFeeArgs): Promise<FeeDetails | ValidationError> => {
    const { receive: onchainReceiveConfig } = getOnchainNetworkConfig()
    const strategies = onchainReceiveConfig.feeStrategies
    return calculateCompositeFee({
      accountId,
      accountRole,
      wallet,
      paymentAmount,
      networkFee: ZERO_NETWORK_FEE,
      strategies,
      isValidatedMerchant,
    })
  }

  const lightningFee = async ({
    paymentAmount,
    accountId,
    accountRole,
    wallet,
    isValidatedMerchant,
  }: LightningDepositFeeArgs): Promise<FeeDetails | ValidationError> => {
    const { receive: lightningReceiveConfig } = getLightningNetworkConfig()
    const strategies = lightningReceiveConfig.feeStrategies
    return calculateCompositeFee({
      accountId,
      accountRole,
      wallet,
      paymentAmount,
      networkFee: ZERO_NETWORK_FEE,
      strategies,
      isValidatedMerchant,
    })
  }

  const intraledgerFee = async ({
    paymentAmount,
    accountId,
    accountRole,
    wallet,
    isValidatedMerchant,
  }: IntraledgerDepositFeeArgs): Promise<FeeDetails | ValidationError> => {
    const { receive: intraledgerReceiveConfig } = getIntraledgerNetworkConfig()
    const strategies = intraledgerReceiveConfig.feeStrategies
    return calculateCompositeFee({
      accountId,
      accountRole,
      wallet,
      paymentAmount,
      networkFee: ZERO_NETWORK_FEE,
      strategies,
      isValidatedMerchant,
    })
  }

  return {
    onChainFee,
    lightningFee,
    intraledgerFee,
  }
}

export const WithdrawalFeeCalculator = (): WithdrawalFeeCalculator => {
  const onChainFee = async ({
    paymentAmount,
    accountId,
    accountRole,
    wallet,
    networkFee,
    speed,
    imbalanceFns,
  }: OnChainWithdrawalFeeArgs): Promise<WithdrawalFeeResult | ValidationError> => {
    const { send: onchainSendConfig } = getOnchainNetworkConfig()
    const strategies = onchainSendConfig.payoutSpeeds[speed].feeStrategies
    return calculateCompositeFee({
      accountId,
      accountRole,
      wallet,
      paymentAmount,
      networkFee,
      strategies,
      imbalanceFns,
      isValidatedMerchant: false,
    })
  }

  const lightningFee = async ({
    paymentAmount,
    accountId,
    accountRole,
    wallet,
    networkFee,
    imbalanceFns,
  }: LightningWithdrawalFeeArgs): Promise<WithdrawalFeeResult | ValidationError> => {
    const { send: lightningSendConfig } = getLightningNetworkConfig()
    const strategies = lightningSendConfig.feeStrategies
    return calculateCompositeFee({
      accountId,
      accountRole,
      wallet,
      paymentAmount,
      networkFee,
      strategies,
      imbalanceFns,
      isValidatedMerchant: false,
    })
  }

  const intraledgerFee = async ({
    paymentAmount,
    accountId,
    accountRole,
    wallet,
    imbalanceFns,
  }: IntraledgerWithdrawalFeeArgs): Promise<WithdrawalFeeResult | ValidationError> => {
    const { send: intraledgerSendConfig } = getIntraledgerNetworkConfig()
    const strategies = intraledgerSendConfig.feeStrategies
    return calculateCompositeFee({
      accountId,
      accountRole,
      wallet,
      paymentAmount,
      networkFee: ZERO_NETWORK_FEE,
      strategies,
      imbalanceFns,
      isValidatedMerchant: false,
    })
  }

  return {
    onChainFee,
    lightningFee,
    intraledgerFee,
  }
}
