import { InvestmentAgreementInProgressError } from "./errors"
import { isInvestmentAgreementActive } from "./investment-agreement-statuses"
import {
  InvestmentAgreementCreationAction,
  InvestmentAgreementPaymentStatus,
  InvestmentAgreementSigningStatus,
} from "./primitives"

import { ESignRecipientStatus } from "@/domain/esign"

export const investmentAgreementCreationAction = ({
  latestAgreement,
  units,
  now,
}: InvestmentAgreementCreationActionArgs):
  | InvestmentAgreementCreationAction
  | InvestmentAgreementInProgressError => {
  if (!isInvestmentAgreementActive(latestAgreement)) {
    return InvestmentAgreementCreationAction.CreateNew
  }

  const { signingStatus, paymentStatus, signingReuseUntil, terms } = latestAgreement
  const isAwaitingInvestorSignature =
    signingStatus === InvestmentAgreementSigningStatus.SigningStarted &&
    paymentStatus === InvestmentAgreementPaymentStatus.Unpaid
  if (!isAwaitingInvestorSignature) {
    return new InvestmentAgreementInProgressError(`${signingStatus} ${paymentStatus}`)
  }

  const isWithinReuseWindow = now < signingReuseUntil
  const isSameUnits = terms.units === units
  if (isWithinReuseWindow && isSameUnits) {
    return InvestmentAgreementCreationAction.ReuseSigning
  }

  return InvestmentAgreementCreationAction.CheckInvestorSignature
}

export const supersededInvestmentAgreementSigningStatus = (
  investorStatus: ESignRecipientStatus,
): InvestmentAgreementSigningStatus | InvestmentAgreementInProgressError => {
  switch (investorStatus) {
    case ESignRecipientStatus.Pending:
      return InvestmentAgreementSigningStatus.Expired
    case ESignRecipientStatus.Declined:
      return InvestmentAgreementSigningStatus.Declined
    case ESignRecipientStatus.Completed:
    default:
      return new InvestmentAgreementInProgressError(investorStatus)
  }
}
