import { MigrationFlow } from "@/app"
import { InputValidationError } from "@/graphql/error"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import { GT } from "@/graphql/index"
import MigrationPayload from "@/graphql/public/types/payload/migration"
import LnPaymentRequest from "@/graphql/shared/types/scalar/ln-payment-request"
import SafeInt from "@/graphql/shared/types/scalar/safe-int"

const MigrationCommitInput = GT.Input({
  name: "MigrationCommitInput",
  fields: () => ({
    sparkPubkey: { type: GT.NonNull(GT.String) },
    proofSignature: { type: GT.NonNull(GT.String) },
    proofTimestamp: { type: GT.NonNull(SafeInt) },
    sparkInvoice: { type: GT.NonNull(LnPaymentRequest) },
    disclosureVersion: { type: GT.NonNull(GT.String) },
    backupAttested: { type: GT.NonNull(GT.Boolean) },
  }),
})

const MigrationCommitMutation = GT.Field<
  null,
  GraphQLPublicContextAuth,
  {
    input: {
      sparkPubkey: string
      proofSignature: string
      proofTimestamp: number
      sparkInvoice: string | InputValidationError
      disclosureVersion: string
      backupAttested: boolean
    }
  }
>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(MigrationPayload),
  args: {
    input: { type: GT.NonNull(MigrationCommitInput) },
  },
  resolve: async (_, args, { domainAccount, apiKeyId }) => {
    const {
      sparkPubkey,
      proofSignature,
      proofTimestamp,
      sparkInvoice,
      disclosureVersion,
      backupAttested,
    } = args.input
    if (sparkInvoice instanceof InputValidationError) {
      return { errors: [{ message: sparkInvoice.message }] }
    }

    const result = await MigrationFlow.commitMigrationFlow({
      accountId: domainAccount.id,
      apiKeyId,
      sparkPubkey,
      proofSignature,
      proofTimestamp,
      sparkInvoice,
      disclosureVersion,
      backupAttested,
    })

    if (result instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(result)] }
    }

    return {
      errors: [],
      migration: result,
    }
  },
})

export default MigrationCommitMutation
