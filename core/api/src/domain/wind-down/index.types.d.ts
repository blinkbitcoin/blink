type WindDownStatus =
  (typeof import("./index").WindDownStatus)[keyof typeof import("./index").WindDownStatus]

type WindDownCohortRule =
  (typeof import("./index").WindDownCohortRule)[keyof typeof import("./index").WindDownCohortRule]

type CohortCountry = string & { readonly brand: unique symbol }

type MatchCohortSignalsArgs = {
  phoneCountry?: string
  deletedPhoneCountries: string[]
  creationIpCountry?: string
  affectedCountries: string[]
}

// deletedPhoneCountries is newest-first; undefined marks an unparseable number
type WindDownCohortSignals = {
  phoneCountry?: string
  deletedPhoneCountries: (string | undefined)[]
  creationIpCountry?: string
  latestIpCountry?: string
}

type AssessCohortResidencyArgs = {
  phoneCountry?: string
  newestDeletedPhoneCountry?: string
  creationIpCountry?: string
  latestIpCountry?: string
  affectedCountries: string[]
  strictCountries: string[]
}

type CohortResidencyVerdict = {
  matched: boolean
  assignedCountry?: CohortCountry
  rule: WindDownCohortRule
}

type WindDownCohortAssessmentSignals = {
  phoneCountry?: string
  newestDeletedPhoneCountry?: string
  creationIpCountry?: string
  latestIpCountry?: string
}

type WindDownCohortAssessment = {
  accountId: AccountId
  matched: boolean
  assignedCountry?: CohortCountry
  rule: WindDownCohortRule
  signals: WindDownCohortAssessmentSignals
  createdAt: Date
}

type PersistWindDownCohortAssessmentArgs = {
  accountId: AccountId
  matched: boolean
  assignedCountry?: CohortCountry
  rule: WindDownCohortRule
  signals: WindDownCohortAssessmentSignals
}

interface IWindDownCohortAssessmentsRepository {
  findByAccountId(
    accountId: AccountId,
  ): Promise<WindDownCohortAssessment | RepositoryError>
  persist(
    args: PersistWindDownCohortAssessmentArgs,
  ): Promise<WindDownCohortAssessment | RepositoryError>
}

type DeriveWindDownStateArgs = {
  enabled: boolean
  matched: boolean
  region: WindDownRegionConfig | undefined
}

type WindDownCohortMatch = {
  matched: boolean
  matchedCountry?: CohortCountry
}

type WindDownState = {
  status: WindDownStatus
  receiveDisabledAt: Date
  finalDeadline: Date
  gateArmsAt: Date
  timezone: string
}
