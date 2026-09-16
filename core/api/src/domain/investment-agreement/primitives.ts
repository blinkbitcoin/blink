export const InvestmentAgreementSigningStatus = {
  SigningStarted: "SIGNING_STARTED",
  Completed: "COMPLETED",
  Declined: "DECLINED",
  Voided: "VOIDED",
  Expired: "EXPIRED",
} as const

export const InvestmentAgreementPaymentStatus = {
  Unpaid: "UNPAID",
  Paid: "PAID",
  Expired: "EXPIRED",
} as const

export const InvestmentAgreementCreationAction = {
  CreateNew: "CREATE_NEW",
  ReuseSigning: "REUSE_SIGNING",
  CheckInvestorSignature: "CHECK_INVESTOR_SIGNATURE",
} as const

export const InvestmentAgreementDocument = {
  Membership: "MEMBERSHIP",
  Subscription: "SUBSCRIPTION",
  Joinder: "JOINDER",
} as const

export const InvestmentAgreementValue = {
  FullLegalName: "FULL_LEGAL_NAME",
  CountryOfResidence: "COUNTRY_OF_RESIDENCE",
  Email: "EMAIL",
  PricePerUnitUsd: "PRICE_PER_UNIT_USD",
  NumberOfUnits: "NUMBER_OF_UNITS",
  TotalSubscriptionUsd: "TOTAL_SUBSCRIPTION_USD",
  SettlementAmountBtc: "SETTLEMENT_AMOUNT_BTC",
  PreMoneyValuationUsd: "PRE_MONEY_VALUATION_USD",
  BtcUsdRate: "BTC_USD_RATE",
  RateTimestamp: "RATE_TIMESTAMP",
  SubMembershipTier: "SUB_MEMBERSHIP_TIER",
  SubMembershipTerm: "SUB_MEMBERSHIP_TERM",
} as const
