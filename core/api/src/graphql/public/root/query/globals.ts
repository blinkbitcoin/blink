import {
  NETWORK,
  getFeesConfig,
  getGaloyBuildInformation,
  getLightningAddressDomain,
  getLightningAddressDomainAliases,
} from "@/config"

import { Lightning } from "@/app"

import { getSupportedCountries } from "@/app/authentication/get-supported-countries"

import { GT } from "@/graphql/index"
import Globals from "@/graphql/public/types/object/globals"

const feesConfig = getFeesConfig()

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
          minBankFee: `${feesConfig.depositDefaultMin.amount}`,
          minBankFeeThreshold: `${feesConfig.depositThreshold.amount}`,
          ratio: `${feesConfig.depositRatioAsBasisPoints}`,
        },
      },
    }
  },
})

export default GlobalsQuery
