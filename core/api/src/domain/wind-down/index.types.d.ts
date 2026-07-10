type WindDownStatus =
  (typeof import("./index").WindDownStatus)[keyof typeof import("./index").WindDownStatus]

type MatchCohortSignalsArgs = {
  phoneCountries: string[]
  deletedPhoneCountries: string[]
  creationIpCountry?: string
  affectedCountries: string[]
}

type DeriveWindDownStateArgs = {
  enabled: boolean
  exempt: boolean
  matched: boolean
  region: WindDownRegionConfig | undefined
}

type WindDownCohortMatch = {
  matched: boolean
  matchedCountry?: string
}

type WindDownState = {
  status: WindDownStatus
  receiveDisabledAt: string | null
  finalDeadline: string
  gateArmsAt: string
  timezone: string
}

type AccountWindDown = {
  status: WindDownStatus
  receiveDisabledAt: Date | null
  finalDeadline: Date
  gateArmsAt: Date
  timezone: string
}
