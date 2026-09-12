import {
  InvestmentAgreementDocument,
  InvestmentAgreementDocuments,
} from "@/domain/investment-agreement"

const labelsOf = (document: InvestmentAgreementDocument): string[] =>
  InvestmentAgreementDocuments.filter((definition) => definition.document === document)
    .flatMap(({ tabs }) => tabs)
    .map(({ label }) => label)

describe("InvestmentAgreementDocuments", () => {
  it("lists the documents in signing order", () => {
    expect(InvestmentAgreementDocuments.map(({ document }) => document)).toEqual([
      InvestmentAgreementDocument.Membership,
      InvestmentAgreementDocument.Subscription,
      InvestmentAgreementDocument.Joinder,
    ])
  })

  it("defines the membership agreement tabs", () => {
    expect(labelsOf(InvestmentAgreementDocument.Membership)).toEqual([
      "full_legal_name",
      "country_of_residence",
      "email",
      "total_subscription_usd",
      "sub_membership_tier",
      "sub_membership_term",
    ])
  })

  it("defines the subscription agreement tabs", () => {
    expect(labelsOf(InvestmentAgreementDocument.Subscription)).toEqual([
      "full_legal_name",
      "country_of_residence",
      "email",
      "price_per_unit_usd",
      "number_of_units",
      "total_subscription_usd",
      "settlement_amount_btc",
      "pre_money_valuation_usd",
      "btc_usd_rate",
      "rate_timestamp",
    ])
  })

  it("defines the joinder tabs", () => {
    expect(labelsOf(InvestmentAgreementDocument.Joinder)).toEqual(["full_legal_name"])
  })

  it("locks every tab of every document", () => {
    const tabs = InvestmentAgreementDocuments.flatMap(({ tabs }) => tabs)
    expect(tabs.filter(({ locked }) => !locked)).toEqual([])
  })
})
