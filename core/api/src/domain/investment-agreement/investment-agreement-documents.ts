import { InvestmentAgreementDocument, InvestmentAgreementValue } from "./primitives"

const lockedTab = (
  label: string,
  value: InvestmentAgreementValue,
): InvestmentAgreementTabDefinition => ({ label, value, locked: true })

// Signing order: DOCUSIGN_TEMPLATE_ID lists one template id per document in this order
export const InvestmentAgreementDocuments: readonly InvestmentAgreementDocumentDefinition[] =
  [
    {
      document: InvestmentAgreementDocument.Membership,
      tabs: [
        lockedTab("full_legal_name", InvestmentAgreementValue.FullLegalName),
        lockedTab("country_of_residence", InvestmentAgreementValue.CountryOfResidence),
        lockedTab("email", InvestmentAgreementValue.Email),
        lockedTab(
          "total_subscription_usd",
          InvestmentAgreementValue.TotalSubscriptionUsd,
        ),
        lockedTab("sub_membership_tier", InvestmentAgreementValue.SubMembershipTier),
        lockedTab("sub_membership_term", InvestmentAgreementValue.SubMembershipTerm),
      ],
    },
    {
      document: InvestmentAgreementDocument.Subscription,
      tabs: [
        lockedTab("full_legal_name", InvestmentAgreementValue.FullLegalName),
        lockedTab("country_of_residence", InvestmentAgreementValue.CountryOfResidence),
        lockedTab("email", InvestmentAgreementValue.Email),
        lockedTab("price_per_unit_usd", InvestmentAgreementValue.PricePerUnitUsd),
        lockedTab("number_of_units", InvestmentAgreementValue.NumberOfUnits),
        lockedTab(
          "total_subscription_usd",
          InvestmentAgreementValue.TotalSubscriptionUsd,
        ),
        lockedTab("settlement_amount_btc", InvestmentAgreementValue.SettlementAmountBtc),
        lockedTab(
          "pre_money_valuation_usd",
          InvestmentAgreementValue.PreMoneyValuationUsd,
        ),
        lockedTab("btc_usd_rate", InvestmentAgreementValue.BtcUsdRate),
        lockedTab("rate_timestamp", InvestmentAgreementValue.RateTimestamp),
      ],
    },
    {
      document: InvestmentAgreementDocument.Joinder,
      tabs: [lockedTab("full_legal_name", InvestmentAgreementValue.FullLegalName)],
    },
  ]
