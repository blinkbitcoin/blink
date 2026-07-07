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
    sparkPubkey: {
      type: GT.NonNull(GT.String),
      description: "Spark identity pubkey of the destination wallet, hex encoded.",
    },
    proofSignature: {
      type: GT.NonNull(GT.String),
      description:
        "Signature over the migration proof-of-possession challenge, made with the Spark identity key.",
    },
    proofTimestamp: {
      type: GT.NonNull(SafeInt),
      description:
        "Timestamp of the signed challenge, in milliseconds since the Unix epoch.",
    },
    sparkInvoice: {
      type: GT.NonNull(LnPaymentRequest),
      description: "No-amount BOLT11 invoice minted by the destination Spark wallet.",
    },
    disclosureVersion: {
      type: GT.NonNull(GT.String),
      description: "Version of the migration disclosure accepted by the user.",
    },
    backupAttested: {
      type: GT.NonNull(GT.Boolean),
      description: "User attested to having backed up the destination wallet.",
    },
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
  resolve: async (_, args, { domainAccount }) => {
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
