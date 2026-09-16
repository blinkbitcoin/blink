type SkipFeeProbeFeeCapGroup = {
  pubkeys: Pubkey[]
  feeCapBasisPoints: bigint
}

type SkipFeeProbeConfig = {
  pubkey: Pubkey[]
  chanId: ChanId[]
  feeCapGroups: SkipFeeProbeFeeCapGroup[]
}

type CustodialMigrationFlowConfig = {
  enabled: boolean
  deMinimisThresholdSats: number
  recentDepositThresholdUsdCents: number
  recentDepositWindowDays: number
}

type InvestmentAgreementPlaceholderValues = {
  fullLegalName: string
  countryOfResidence: string
  subMembershipTier: string
  subMembershipTerm: string
}

type InvestmentAgreementConfig = {
  pricePerUnitUsdCents: UsdCents
  preMoneyValuationUsdCents: UsdCents
  minUnits: InvestmentUnits
  maxUnits: InvestmentUnits
  signingReuseWindowMinutes: number
  paymentWindowHours: number
  rateTimeZone: InvestmentAgreementTimeZone
  placeholderValues: InvestmentAgreementPlaceholderValues
}

type ESignEnv = Pick<
  typeof import("./env").env,
  | "ESIGN_PROVIDER"
  | "ESIGN_ENV"
  | "ESIGN_ALLOW_DEMO"
  | "DOCUSIGN_ACCOUNT_ID"
  | "DOCUSIGN_INTEGRATION_KEY"
  | "DOCUSIGN_USER_ID"
  | "DOCUSIGN_PRIVATE_KEY_BASE64"
  | "DOCUSIGN_PRIVATE_KEY_FILE"
  | "DOCUSIGN_BASE_URL"
  | "DOCUSIGN_OAUTH_URL"
  | "DOCUSIGN_TEMPLATE_ID"
  | "DOCUSIGN_SIGNER_ROLE"
  | "DOCUSIGN_RETURN_URL"
>

type MockESignConfig = {
  provider: "mock"
  returnUrl: string
}

type DocuSignESignConfig = {
  provider: "docusign"
  returnUrl: string
  accountId: string
  integrationKey: string
  userId: string
  privateKey: string
  apiBaseUrl: string
  oauthBaseUrl: string
  templateIds: ESignTemplateId[]
  signerRole: string
}

type ESignConfig = MockESignConfig | DocuSignESignConfig
