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

    let minBankFee = "0"
    let minBankFeeThreshold = "0"
    const ratio = "0"

    const tieredFlatStrategy = onchainConfig.receive.feeStrategies.find(
      (s) => s.strategy === "tieredFlat",
    )
    if (tieredFlatStrategy) {
      const firstTier = tieredFlatStrategy.params.tiers[0]
      if (firstTier) {
        minBankFee = `${firstTier.amount}`
        minBankFeeThreshold = `${firstTier.maxAmount}`
      }
    }

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
          ratio,
        },
      },
    }
  },
})

export default GlobalsQuery
