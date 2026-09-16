import {
  InvestmentAgreementDocument,
  InvestmentAgreementDocuments,
  InvestmentAgreementTabConflictError,
  InvestmentAgreementValue,
  investmentAgreementTabs,
} from "@/domain/investment-agreement"

const terms: InvestmentAgreementTerms = {
  units: 1000 as InvestmentUnits,
  pricePerUnitUsdCents: 100 as UsdCents,
  totalUsdCents: 100_000 as UsdCents,
  preMoneyValuationUsdCents: 1_000_000_000 as UsdCents,
  btcUsdRateCents: 7_885_050 as UsdCentsPerBtc,
  settlementSats: 1_268_223 as Satoshis,
  quotedAt: new Date("2026-09-09T10:00:00Z"),
}

const investor: InvestmentAgreementInvestor = {
  email: "investor@blink.sv" as EmailAddress,
  fullLegalName: "TEST Investor Name",
  countryOfResidence: "TEST Country",
}

const membership: InvestmentAgreementMembership = {
  tier: "TEST Tier",
  term: "TEST Term",
}

const rateTimeZone = "America/Tegucigalpa" as InvestmentAgreementTimeZone

const tabsFor = (documents: readonly InvestmentAgreementDocumentDefinition[]) =>
  investmentAgreementTabs({ documents, terms, investor, membership, rateTimeZone })

describe("investmentAgreementTabs", () => {
  it("maps every document tab to its locked contract value", () => {
    expect(tabsFor(InvestmentAgreementDocuments)).toEqual({
      full_legal_name: { value: "TEST Investor Name", locked: true },
      country_of_residence: { value: "TEST Country", locked: true },
      email: { value: "investor@blink.sv", locked: true },
      total_subscription_usd: { value: "1000.00", locked: true },
      sub_membership_tier: { value: "TEST Tier", locked: true },
      sub_membership_term: { value: "TEST Term", locked: true },
      price_per_unit_usd: { value: "1.00", locked: true },
      number_of_units: { value: "1000", locked: true },
      settlement_amount_btc: { value: "0.01268223", locked: true },
      pre_money_valuation_usd: { value: "10000000.00", locked: true },
      btc_usd_rate: { value: "78850.50", locked: true },
      rate_timestamp: { value: "2026-09-09 04:00", locked: true },
    })
  })

  it("fails when two documents give the same label different values", () => {
    const result = tabsFor([
      {
        document: InvestmentAgreementDocument.Membership,
        tabs: [
          { label: "name", value: InvestmentAgreementValue.FullLegalName, locked: true },
        ],
      },
      {
        document: InvestmentAgreementDocument.Joinder,
        tabs: [{ label: "name", value: InvestmentAgreementValue.Email, locked: true }],
      },
    ])
    expect(result).toBeInstanceOf(InvestmentAgreementTabConflictError)
    expect(result).toHaveProperty("message", "name")
  })

  it("fails when two documents lock the same label differently", () => {
    expect(
      tabsFor([
        {
          document: InvestmentAgreementDocument.Membership,
          tabs: [{ label: "email", value: InvestmentAgreementValue.Email, locked: true }],
        },
        {
          document: InvestmentAgreementDocument.Joinder,
          tabs: [
            { label: "email", value: InvestmentAgreementValue.Email, locked: false },
          ],
        },
      ]),
    ).toBeInstanceOf(InvestmentAgreementTabConflictError)
  })
})
