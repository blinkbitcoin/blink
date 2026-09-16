type InvestmentAgreementError = import("./errors").InvestmentAgreementError
type InvestmentAgreementStateConflictError =
  import("./errors").InvestmentAgreementStateConflictError
type InvestmentAgreementInProgressError =
  import("./errors").InvestmentAgreementInProgressError

type InvestmentAgreementSigningStatus =
  (typeof import("./primitives").InvestmentAgreementSigningStatus)[keyof typeof import("./primitives").InvestmentAgreementSigningStatus]

type InvestmentAgreementPaymentStatus =
  (typeof import("./primitives").InvestmentAgreementPaymentStatus)[keyof typeof import("./primitives").InvestmentAgreementPaymentStatus]

type InvestmentAgreementCreationAction =
  (typeof import("./primitives").InvestmentAgreementCreationAction)[keyof typeof import("./primitives").InvestmentAgreementCreationAction]

type InvestmentAgreementId = string & { readonly brand: unique symbol }

type InvestmentAgreementStatuses = {
  signingStatus: InvestmentAgreementSigningStatus
  paymentStatus: InvestmentAgreementPaymentStatus
}

type InvestmentAgreementStatusTransition<T> = {
  status: T
  changed: boolean
}

type InvestmentAgreementSigningStep = {
  status: InvestmentAgreementSigningStatus
  recordedAt: Date
}

type InvestmentAgreementPaymentStep = {
  status: InvestmentAgreementPaymentStatus
  recordedAt: Date
}

type InvestmentAgreement = InvestmentAgreementStatuses & {
  id: InvestmentAgreementId
  accountId: AccountId
  envelopeId: ESignEnvelopeId
  terms: InvestmentAgreementTerms
  signingReuseUntil: Date
  paymentWindowHours: Hours
  paymentDeadline: Date | undefined
  signingSteps: InvestmentAgreementSigningStep[]
  paymentSteps: InvestmentAgreementPaymentStep[]
  createdAt: Date
  updatedAt: Date
}

type InvestmentAgreementCreationActionArgs = {
  latestAgreement: Pick<
    InvestmentAgreement,
    "signingStatus" | "paymentStatus" | "signingReuseUntil" | "terms"
  >
  units: InvestmentUnits
  now: Date
}

type InvestmentAgreementSigningSession = {
  agreement: InvestmentAgreement
  signingUrl: ESignSigningUrl
}

type PersistNewInvestmentAgreementArgs = {
  accountId: AccountId
  envelopeId: ESignEnvelopeId
  terms: InvestmentAgreementTerms
  signingReuseUntil: Date
  paymentWindowHours: Hours
  createdAt: Date
}

type UpdateInvestmentAgreementSigningStatusArgs = {
  id: InvestmentAgreementId
  from: InvestmentAgreementSigningStatus
  to: InvestmentAgreementSigningStatus
}

interface IInvestmentAgreementsRepository {
  persistNew(
    args: PersistNewInvestmentAgreementArgs,
  ): Promise<InvestmentAgreement | RepositoryError>
  findById(id: InvestmentAgreementId): Promise<InvestmentAgreement | RepositoryError>
  findLatestByAccountId(
    accountId: AccountId,
  ): Promise<InvestmentAgreement | RepositoryError>
  updateSigningStatus(
    args: UpdateInvestmentAgreementSigningStatusArgs,
  ): Promise<
    InvestmentAgreement | InvestmentAgreementStateConflictError | RepositoryError
  >
}

type InvestmentAgreementDocument =
  (typeof import("./primitives").InvestmentAgreementDocument)[keyof typeof import("./primitives").InvestmentAgreementDocument]

type InvestmentAgreementValue =
  (typeof import("./primitives").InvestmentAgreementValue)[keyof typeof import("./primitives").InvestmentAgreementValue]

type InvestmentUnits = number & { readonly brand: unique symbol }
type UsdCentsPerBtc = number & { readonly brand: unique symbol }
type InvestmentAgreementTimeZone = string & { readonly brand: unique symbol }

type InvestmentAgreementTabDefinition = {
  label: string
  value: InvestmentAgreementValue
  locked: boolean
}

type InvestmentAgreementDocumentDefinition = {
  document: InvestmentAgreementDocument
  tabs: readonly InvestmentAgreementTabDefinition[]
}

type InvestmentAgreementTerms = {
  units: InvestmentUnits
  pricePerUnitUsdCents: UsdCents
  totalUsdCents: UsdCents
  preMoneyValuationUsdCents: UsdCents
  btcUsdRateCents: UsdCentsPerBtc
  settlementSats: Satoshis
  quotedAt: Date
}

type InvestmentAgreementInvestor = {
  email: EmailAddress
  fullLegalName: string
  countryOfResidence: string
}

type InvestmentAgreementMembership = {
  tier: string
  term: string
}

type CalculateInvestmentAgreementTermsArgs = {
  units: InvestmentUnits
  pricePerUnitUsdCents: UsdCents
  preMoneyValuationUsdCents: UsdCents
  btcPrice: RealTimePrice<DisplayCurrency>
}

type InvestmentAgreementTabsArgs = {
  documents: readonly InvestmentAgreementDocumentDefinition[]
  terms: InvestmentAgreementTerms
  investor: InvestmentAgreementInvestor
  membership: InvestmentAgreementMembership
  rateTimeZone: InvestmentAgreementTimeZone
}
