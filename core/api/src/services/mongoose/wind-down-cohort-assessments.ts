import { parseRepositoryError } from "./utils"

import { WindDownCohortAssessment } from "./schema"

import {
  CouldNotFindWindDownCohortAssessmentError,
  DuplicateKeyForPersistError,
} from "@/domain/errors"

export const WindDownCohortAssessmentsRepository =
  (): IWindDownCohortAssessmentsRepository => {
    const findByAccountId = async (
      accountId: AccountId,
    ): Promise<WindDownCohortAssessment | RepositoryError> => {
      try {
        const result = await WindDownCohortAssessment.findOne({ accountId })
        if (!result) return new CouldNotFindWindDownCohortAssessmentError(accountId)
        return assessmentFromRaw(result)
      } catch (err) {
        return parseRepositoryError(err)
      }
    }

    const persist = async ({
      accountId,
      matched,
      assignedCountry,
      rule,
      signals,
    }: PersistWindDownCohortAssessmentArgs): Promise<
      WindDownCohortAssessment | RepositoryError
    > => {
      try {
        const result = await WindDownCohortAssessment.findOneAndUpdate(
          { accountId },
          {
            $setOnInsert: {
              accountId,
              matched,
              ...(assignedCountry !== undefined ? { assignedCountry } : {}),
              rule,
              signals,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        )
        return assessmentFromRaw(result)
      } catch (err) {
        const parsed = parseRepositoryError(err)
        if (parsed instanceof DuplicateKeyForPersistError) {
          return findByAccountId(accountId)
        }
        return parsed
      }
    }

    return {
      findByAccountId,
      persist,
    }
  }

const assessmentFromRaw = (
  result: WindDownCohortAssessmentRecord,
): WindDownCohortAssessment => ({
  accountId: result.accountId as AccountId,
  matched: result.matched,
  assignedCountry: (result.assignedCountry as CohortCountry) || undefined,
  rule: result.rule,
  signals: {
    phoneCountry: result.signals?.phoneCountry || undefined,
    newestDeletedPhoneCountry: result.signals?.newestDeletedPhoneCountry || undefined,
    creationIpCountry: result.signals?.creationIpCountry || undefined,
    latestIpCountry: result.signals?.latestIpCountry || undefined,
  },
  createdAt: result.createdAt,
})
