import { InvestmentAgreementSigningStatus as DomainInvestmentAgreementSigningStatus } from "@/domain/investment-agreement"
import { GT } from "@/graphql/index"

const InvestmentAgreementSigningStatus = GT.Enum({
  name: "InvestmentAgreementSigningStatus",
  description: "Signing progress of an investment agreement.",
  values: {
    SIGNING_STARTED: {
      value: DomainInvestmentAgreementSigningStatus.SigningStarted,
      description: "The agreement is ready to be signed.",
    },
    COMPLETED: {
      value: DomainInvestmentAgreementSigningStatus.Completed,
      description: "Every party signed the agreement.",
    },
    DECLINED: {
      value: DomainInvestmentAgreementSigningStatus.Declined,
      description: "The investor declined to sign the agreement.",
    },
    VOIDED: {
      value: DomainInvestmentAgreementSigningStatus.Voided,
      description: "The agreement was voided before every party signed it.",
    },
    EXPIRED: {
      value: DomainInvestmentAgreementSigningStatus.Expired,
      description: "The agreement was replaced before the investor signed it.",
    },
  },
})

export default InvestmentAgreementSigningStatus
