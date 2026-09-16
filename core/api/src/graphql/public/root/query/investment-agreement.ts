import { InvestmentAgreement } from "@/app"

import { CouldNotFindInvestmentAgreementError } from "@/domain/errors"

import { GT } from "@/graphql/index"
import { mapError } from "@/graphql/error-map"
import InvestmentAgreementObject from "@/graphql/public/types/object/investment-agreement"

const InvestmentAgreementQuery = GT.Field<null, GraphQLPublicContextAuth>({
  type: InvestmentAgreementObject,
  description: "Latest investment agreement of the account, or null when it has none.",
  resolve: async (_source, _args, { domainAccount }) => {
    const result = await InvestmentAgreement.getInvestmentAgreement({
      accountId: domainAccount.id,
    })

    if (result instanceof CouldNotFindInvestmentAgreementError) return null

    if (result instanceof Error) {
      throw mapError(result)
    }

    return result
  },
})

export default InvestmentAgreementQuery
