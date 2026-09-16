import InvestmentAgreement from "../object/investment-agreement"

import IError from "@/graphql/shared/types/abstract/error"
import { GT } from "@/graphql/index"

const InvestmentAgreementCreatePayload = GT.Object({
  name: "InvestmentAgreementCreatePayload",
  fields: () => ({
    errors: {
      type: GT.NonNullList(IError),
    },
    investmentAgreement: {
      type: InvestmentAgreement,
    },
    signingUrl: {
      type: GT.String,
      description:
        "Short-lived URL to sign the agreement. Request a new one if it expires before signing.",
    },
  }),
})

export default InvestmentAgreementCreatePayload
