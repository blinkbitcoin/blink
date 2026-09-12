import { InvestmentAgreementPaymentStatus as DomainInvestmentAgreementPaymentStatus } from "@/domain/investment-agreement"
import { GT } from "@/graphql/index"

const InvestmentAgreementPaymentStatus = GT.Enum({
  name: "InvestmentAgreementPaymentStatus",
  description: "Payment progress of an investment agreement.",
  values: {
    UNPAID: {
      value: DomainInvestmentAgreementPaymentStatus.Unpaid,
      description: "The settlement has not been paid yet.",
    },
    PAID: {
      value: DomainInvestmentAgreementPaymentStatus.Paid,
      description: "The settlement was paid.",
    },
    EXPIRED: {
      value: DomainInvestmentAgreementPaymentStatus.Expired,
      description: "The payment deadline passed before the settlement was paid.",
    },
  },
})

export default InvestmentAgreementPaymentStatus
