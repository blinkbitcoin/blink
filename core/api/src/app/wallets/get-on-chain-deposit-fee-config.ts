import { getFeesConfig } from "@/config"

import { MerchantsRepository } from "@/services/mongoose"

const feesConfig = getFeesConfig()

export const getOnChainDepositFeeConfiguration = async ({
  account,
}: {
  account: Account
}): Promise<GetDepositFeeConfigurationResult> => {
  const defaultFees = {
    minBankFee: feesConfig.depositDefaultMin,
    minBankFeeThreshold: feesConfig.depositThreshold,
    ratio: feesConfig.depositRatioAsBasisPoints,
  }

  if (!account.username) {
    return defaultFees
  }

  const merchants = await MerchantsRepository().findByUsername(account.username)
  if (merchants instanceof Error) {
    return defaultFees
  }

  const hasValidatedMerchant = merchants.some((merchant) => merchant.validated)
  if (!hasValidatedMerchant) {
    return defaultFees
  }

  // Merchant-specific fees
  return {
    minBankFee: feesConfig.merchantDepositDefaultMin,
    minBankFeeThreshold: feesConfig.merchantDepositThreshold,
    ratio: feesConfig.merchantDepositRatioAsBasisPoints,
  }
}
