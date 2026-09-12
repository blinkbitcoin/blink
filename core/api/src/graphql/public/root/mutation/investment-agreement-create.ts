import { InvestmentAgreement } from "@/app"

import { GT } from "@/graphql/index"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import InvestmentAgreementCreatePayload from "@/graphql/public/types/payload/investment-agreement-create"

const InvestmentAgreementCreateInput = GT.Input({
  name: "InvestmentAgreementCreateInput",
  fields: () => ({
    units: {
      type: GT.NonNull(GT.Int),
      description: "Number of units to subscribe.",
    },
  }),
})

const InvestmentAgreementCreateMutation = GT.Field<
  null,
  GraphQLPublicContextAuth,
  { input: { units: number } }
>({
  extensions: {
    complexity: 120,
  },
  description:
    "Prepares the investment agreement for the given units and returns a URL to sign it. Calling it again for the same units while the agreement is still being signed returns the same agreement with a new URL.",
  type: GT.NonNull(InvestmentAgreementCreatePayload),
  args: {
    input: { type: GT.NonNull(InvestmentAgreementCreateInput) },
  },
  resolve: async (_, args, { domainAccount, apiKeyId }) => {
    const { units } = args.input

    const result = await InvestmentAgreement.createInvestmentAgreement({
      accountId: domainAccount.id,
      units,
      apiKeyId,
    })

    if (result instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(result)] }
    }

    return {
      errors: [],
      investmentAgreement: result.agreement,
      signingUrl: result.signingUrl,
    }
  },
})

export default InvestmentAgreementCreateMutation
