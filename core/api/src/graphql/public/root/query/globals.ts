import {
  NETWORK,
  getGaloyBuildInformation,
  getLightningAddressDomain,
  getLightningAddressDomainAliases,
  getOnchainNetworkConfig,
} from "@/config"

import { Lightning } from "@/app"

import { getSupportedCountries } from "@/app/authentication/get-supported-countries"

import { GT } from "@/graphql/index"
import Globals from "@/graphql/public/types/object/globals"

const onchainConfig = getOnchainNetworkConfig()

const GlobalsQuery = GT.Field({
  type: Globals,
  resolve: async () => {
    let nodesIds = await Lightning.listNodesPubkeys()
    if (nodesIds instanceof Error) nodesIds = []
    let blockInfo: ApplicationError | BlockInfo | undefined =
      await Lightning.getBlockInfo()
    if (blockInfo instanceof Error) {
      blockInfo = undefined
    }

    const tieredFlatStrategy = onchainConfig.receive.feeStrategies.find(
      (s) => s.strategy === "tieredFlat",
    )
    const tiers = [...(tieredFlatStrategy?.params.tiers ?? [])]
      .sort((a, b) => (a.maxAmount ?? Infinity) - (b.maxAmount ?? Infinity))
      .map((tier) => ({
        maxAmount: tier.maxAmount === null ? undefined : `${tier.maxAmount}`,
        amount: `${tier.amount}`,
      }))

    const minBankFee = tiers[0]?.amount ?? "0"
    const minBankFeeThreshold = tiers[0]?.maxAmount ?? "0"
    const ratio = "0"

    return {
      nodesIds,
      network: NETWORK,
      blockInfo,
      lightningAddressDomain: getLightningAddressDomain(),
      lightningAddressDomainAliases: getLightningAddressDomainAliases(),
      buildInformation: getGaloyBuildInformation(),
      supportedCountries: getSupportedCountries(),
      feesInformation: {
        deposit: {
          minBankFee,
          minBankFeeThreshold,
          tiers,
          ratio,
        },
      },
    }
  },
})

export default GlobalsQuery
