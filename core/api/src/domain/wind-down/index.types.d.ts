type WindDownStatus =
  (typeof import("./index").WindDownStatus)[keyof typeof import("./index").WindDownStatus]

type CohortCountry = string & { readonly brand: unique symbol }

type MatchCohortSignalsArgs = {
  phoneCountry?: string
  deletedPhoneCountries: string[]
  creationIpCountry?: string
  affectedCountries: string[]
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
