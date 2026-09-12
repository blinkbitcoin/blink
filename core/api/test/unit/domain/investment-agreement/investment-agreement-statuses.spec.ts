import {
  InvestmentAgreementPaymentStatus,
  InvestmentAgreementSigningStatus,
  isInvestmentAgreementActive,
} from "@/domain/investment-agreement"

const { SigningStarted, Completed, Declined, Voided } = InvestmentAgreementSigningStatus
const SigningExpired = InvestmentAgreementSigningStatus.Expired
const { Unpaid, Paid } = InvestmentAgreementPaymentStatus
const PaymentExpired = InvestmentAgreementPaymentStatus.Expired

describe("isInvestmentAgreementActive", () => {
  test.each([
    [SigningStarted, Unpaid, true],
    [SigningStarted, Paid, true],
    [SigningStarted, PaymentExpired, false],
    [Completed, Unpaid, true],
    [Completed, Paid, false],
    [Completed, PaymentExpired, false],
    [Declined, Unpaid, false],
    [Declined, Paid, false],
    [Declined, PaymentExpired, false],
    [Voided, Unpaid, false],
    [Voided, Paid, false],
    [Voided, PaymentExpired, false],
    [SigningExpired, Unpaid, false],
    [SigningExpired, Paid, false],
    [SigningExpired, PaymentExpired, false],
  ])(
    "signing %s with payment %s is active: %s",
    (signingStatus, paymentStatus, active) => {
      expect(isInvestmentAgreementActive({ signingStatus, paymentStatus })).toBe(active)
    },
  )
})
