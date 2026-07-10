type WindDownStatus =
  (typeof import("./index").WindDownStatus)[keyof typeof import("./index").WindDownStatus]

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
  matchedCountry?: string
}

type WindDownState = {
  status: WindDownStatus
  receiveDisabledAt: string
  finalDeadline: string
  gateArmsAt: string
  timezone: string
}

type AccountWindDown = {
  status: WindDownStatus
  receiveDisabledAt: Date
  finalDeadline: Date
  gateArmsAt: Date
  timezone: string
}
