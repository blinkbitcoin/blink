import { gatherCohortSignals } from "./gather-cohort-signals"

import { getWindDownConfig } from "@/config"

import { AccountLevel } from "@/domain/accounts"
import { assessCohortResidency, matchedCohortCountry } from "@/domain/wind-down"
import { CouldNotFindWindDownCohortAssessmentError } from "@/domain/errors"

import { WindDownCohortAssessmentsRepository } from "@/services/mongoose"

const assessmentToMatch = ({
  assessment,
  levelZeroMatched,
}: {
  assessment: WindDownCohortAssessment
  levelZeroMatched: boolean
}): WindDownCohortMatch =>
  assessment.matched
    ? { matched: true, matchedCountry: assessment.assignedCountry }
    : { matched: levelZeroMatched }

const evaluateUnionCohortMatch = async ({
  account,
  affectedCountries,
  levelZeroMatched,
}: {
  account: Account
  affectedCountries: string[]
  levelZeroMatched: boolean
}): Promise<WindDownCohortMatch | ApplicationError> => {
  if (affectedCountries.length === 0) return { matched: levelZeroMatched }

  const signals = await gatherCohortSignals({
    accountId: account.id,
    kratosUserId: account.kratosUserId,
  })
  if (signals instanceof Error) return signals

  const matchedCountry = matchedCohortCountry({
    phoneCountry: signals.phoneCountry,
    // the union matcher predates the newest-first hole contract: restore stored order, drop holes
    deletedPhoneCountries: [...signals.deletedPhoneCountries]
      .reverse()
      .filter((country): country is string => country !== undefined),
    creationIpCountry: signals.creationIpCountry,
    affectedCountries,
  })

  if (matchedCountry !== undefined) return { matched: true, matchedCountry }

  return { matched: levelZeroMatched }
}

const evaluateAssessedCohortMatch = async ({
  account,
  ipEvidenceCutoff,
  affectedCountries,
  strictCountries,
  levelZeroMatched,
}: {
  account: Account
  ipEvidenceCutoff: Date
  affectedCountries: string[]
  strictCountries: string[]
  levelZeroMatched: boolean
}): Promise<WindDownCohortMatch | ApplicationError> => {
  const assessments = WindDownCohortAssessmentsRepository()

  const assessment = await assessments.findByAccountId(account.id)
  if (!(assessment instanceof Error)) {
    return assessmentToMatch({ assessment, levelZeroMatched })
  }
  if (!(assessment instanceof CouldNotFindWindDownCohortAssessmentError)) {
    return assessment
  }

  const signals = await gatherCohortSignals({
    accountId: account.id,
    kratosUserId: account.kratosUserId,
    ipEvidenceCutoff,
  })
  if (signals instanceof Error) return signals

  const verdict = assessCohortResidency({
    phoneCountry: signals.phoneCountry,
    newestDeletedPhoneCountry: signals.deletedPhoneCountries[0],
    creationIpCountry: signals.creationIpCountry,
    latestIpCountry: signals.latestIpCountry,
    affectedCountries,
    strictCountries,
  })

  const persisted = await assessments.persist({
    accountId: account.id,
    matched: verdict.matched,
    assignedCountry: verdict.assignedCountry,
    rule: verdict.rule,
    signals: {
      phoneCountry: signals.phoneCountry,
      newestDeletedPhoneCountry: signals.deletedPhoneCountries[0],
      creationIpCountry: signals.creationIpCountry,
      latestIpCountry: signals.latestIpCountry,
    },
  })
  if (persisted instanceof Error) return persisted

  // the persisted doc is authoritative: on a concurrent first assessment it is the winner's
  return assessmentToMatch({ assessment: persisted, levelZeroMatched })
}

export const evaluateWindDownCohortMatch = async ({
  account,
}: {
  account: Account
}): Promise<WindDownCohortMatch | ApplicationError> => {
  const config = getWindDownConfig()
  if (config.excludedAccountIds.includes(account.id)) return { matched: false }

  const levelZeroMatched = config.includeLevelZero && account.level === AccountLevel.Zero

  if (!config.usePersistedCohortFlag) {
    return evaluateUnionCohortMatch({
      account,
      affectedCountries: config.affectedCountries,
      levelZeroMatched,
    })
  }

  return evaluateAssessedCohortMatch({
    account,
    ipEvidenceCutoff: config.ipEvidenceCutoff,
    affectedCountries: config.affectedCountries,
    strictCountries: config.strictCountries,
    levelZeroMatched,
  })
}

export const isAccountInWindDownCohort = async ({
  account,
}: {
  account: Account
}): Promise<boolean | ApplicationError> => {
  const match = await evaluateWindDownCohortMatch({ account })
  if (match instanceof Error) return match

  return match.matched
}
