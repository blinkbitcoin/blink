import {
  InvestmentAgreementPaymentStatus,
  InvestmentAgreementSigningStatus,
} from "./primitives"

// Active while the agreement can still end signed by both parties and paid
export const isInvestmentAgreementActive = ({
  signingStatus,
  paymentStatus,
}: InvestmentAgreementStatuses): boolean => {
  const isSigning =
    signingStatus === InvestmentAgreementSigningStatus.SigningStarted &&
    paymentStatus !== InvestmentAgreementPaymentStatus.Expired
  const isAwaitingPayment =
    signingStatus === InvestmentAgreementSigningStatus.Completed &&
    paymentStatus === InvestmentAgreementPaymentStatus.Unpaid
  return isSigning || isAwaitingPayment
}
