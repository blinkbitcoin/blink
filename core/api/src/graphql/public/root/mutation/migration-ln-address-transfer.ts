import { MigrationFlow } from "@/app"

import { GT } from "@/graphql/index"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import MigrationLnAddressTransferPayload from "@/graphql/public/types/payload/migration-ln-address-transfer"
import SafeInt from "@/graphql/shared/types/scalar/safe-int"

const MigrationLnAddressTransferInput = GT.Input({
  name: "MigrationLnAddressTransferInput",
  fields: () => ({
    sparkPubkey: { type: GT.NonNull(GT.String) },
    proofSignature: { type: GT.NonNull(GT.String) },
    proofTimestamp: { type: GT.NonNull(SafeInt) },
  }),
})

const MigrationLnAddressTransferMutation = GT.Field<
  null,
  GraphQLPublicContextAuth,
  {
    input: {
      sparkPubkey: string
      proofSignature: string
      proofTimestamp: number
    }
  }
>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(MigrationLnAddressTransferPayload),
  args: {
    input: { type: GT.NonNull(MigrationLnAddressTransferInput) },
  },
  resolve: async (_, args, { domainAccount, apiKeyId }) => {
    const { sparkPubkey, proofSignature, proofTimestamp } = args.input

    const results = await MigrationFlow.transferLnAddressesToSpark({
      account: domainAccount,
      apiKeyId,
      sparkPubkey,
      proofSignature,
      proofTimestamp,
    })

    if (results instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(results)], results: [] }
    }

    return {
      errors: [],
      results,
    }
  },
})

export default MigrationLnAddressTransferMutation
