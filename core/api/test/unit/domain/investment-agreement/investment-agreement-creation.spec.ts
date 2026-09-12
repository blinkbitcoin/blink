import { ESignRecipientStatus } from "@/domain/esign"
import {
  InvestmentAgreementCreationAction,
  InvestmentAgreementInProgressError,
  InvestmentAgreementPaymentStatus,
  InvestmentAgreementSigningStatus,
  investmentAgreementCreationAction,
  supersededInvestmentAgreementSigningStatus,
} from "@/domain/investment-agreement"

const now = new Date("2026-09-11T12:00:00Z")
const units = 1000 as InvestmentUnits

const terms: InvestmentAgreementTerms = {
  units,
  pricePerUnitUsdCents: 100 as UsdCents,
  totalUsdCents: 100_000 as UsdCents,
  preMoneyValuationUsdCents: 1_000_000_000 as UsdCents,
  btcUsdRateCents: 7_885_050 as UsdCentsPerBtc,
  settlementSats: 1_268_223 as Satoshis,
  quotedAt: new Date("2026-09-11T11:55:00Z"),
}

const agreementSigning = {
  signingStatus: InvestmentAgreementSigningStatus.SigningStarted,
  paymentStatus: InvestmentAgreementPaymentStatus.Unpaid,
  signingReuseUntil: new Date("2026-09-11T12:10:00Z"),
  terms,
}

describe("investmentAgreementCreationAction", () => {
  test.each([
    [InvestmentAgreementSigningStatus.Completed, InvestmentAgreementPaymentStatus.Paid],
    [
      InvestmentAgreementSigningStatus.Completed,
      InvestmentAgreementPaymentStatus.Expired,
    ],
    [InvestmentAgreementSigningStatus.Declined, InvestmentAgreementPaymentStatus.Unpaid],
    [InvestmentAgreementSigningStatus.Voided, InvestmentAgreementPaymentStatus.Paid],
    [InvestmentAgreementSigningStatus.Expired, InvestmentAgreementPaymentStatus.Unpaid],
  ])(
    "creates a new agreement when the latest one is closed (signing %s, payment %s)",
    (signingStatus, paymentStatus) => {
      expect(
        investmentAgreementCreationAction({
          latestAgreement: { ...agreementSigning, signingStatus, paymentStatus },
          units,
          now,
        }),
      ).toEqual(InvestmentAgreementCreationAction.CreateNew)
    },
  )

  it("reuses the signing session for the same units within the reuse window", () => {
    expect(
      investmentAgreementCreationAction({
        latestAgreement: agreementSigning,
        units,
        now,
      }),
    ).toEqual(InvestmentAgreementCreationAction.ReuseSigning)
  })

  it("checks the investor signature once the reuse window has elapsed", () => {
    expect(
      investmentAgreementCreationAction({
        latestAgreement: agreementSigning,
        units,
        now: agreementSigning.signingReuseUntil,
      }),
    ).toEqual(InvestmentAgreementCreationAction.CheckInvestorSignature)
  })

  it("checks the investor signature for different units within the reuse window", () => {
    expect(
      investmentAgreementCreationAction({
        latestAgreement: agreementSigning,
        units: 2000 as InvestmentUnits,
        now,
      }),
    ).toEqual(InvestmentAgreementCreationAction.CheckInvestorSignature)
  })

  test.each([
    [
      InvestmentAgreementSigningStatus.SigningStarted,
      InvestmentAgreementPaymentStatus.Paid,
    ],
    [InvestmentAgreementSigningStatus.Completed, InvestmentAgreementPaymentStatus.Unpaid],
  ])(
    "fails while the latest agreement is in progress (signing %s, payment %s)",
    (signingStatus, paymentStatus) => {
      expect(
        investmentAgreementCreationAction({
          latestAgreement: { ...agreementSigning, signingStatus, paymentStatus },
          units,
          now,
        }),
      ).toBeInstanceOf(InvestmentAgreementInProgressError)
    },
  )
})

describe("supersededInvestmentAgreementSigningStatus", () => {
  it("expires the agreement when the investor has not signed", () => {
    expect(
      supersededInvestmentAgreementSigningStatus(ESignRecipientStatus.Pending),
    ).toEqual(InvestmentAgreementSigningStatus.Expired)
  })

  it("declines the agreement when the investor declined", () => {
    expect(
      supersededInvestmentAgreementSigningStatus(ESignRecipientStatus.Declined),
    ).toEqual(InvestmentAgreementSigningStatus.Declined)
  })

  it("fails when the investor already signed", () => {
    expect(
      supersededInvestmentAgreementSigningStatus(ESignRecipientStatus.Completed),
    ).toBeInstanceOf(InvestmentAgreementInProgressError)
  })

  it("fails closed for an unknown investor status", () => {
    expect(
      supersededInvestmentAgreementSigningStatus("unknown" as ESignRecipientStatus),
    ).toBeInstanceOf(InvestmentAgreementInProgressError)
  })
})
