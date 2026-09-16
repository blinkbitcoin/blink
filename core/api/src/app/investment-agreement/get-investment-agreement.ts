import { INVESTMENT_AGREEMENT_ENABLED } from "@/config"

import { InvestmentAgreementDisabledError } from "@/domain/investment-agreement"

import { InvestmentAgreementsRepository } from "@/services/mongoose"

export const getInvestmentAgreement = async ({
  accountId,
}: {
  accountId: AccountId
}): Promise<InvestmentAgreement | ApplicationError> => {
  if (!INVESTMENT_AGREEMENT_ENABLED) return new InvestmentAgreementDisabledError()

  return InvestmentAgreementsRepository().findLatestByAccountId(accountId)
}
