import { BtcMapPlaceSubmission } from "./schema"
import { parseRepositoryError } from "./utils"

import { BtcMapPlaceSubmissionStatus } from "@/domain/btcmap"
import { CouldNotFindBtcMapPlaceSubmissionError } from "@/domain/btcmap/errors"

interface IBtcMapPlaceSubmissionsRepository {
  findBySubmissionId(args: {
    submissionId: BtcMapSubmissionId
  }): Promise<BtcMapPlaceSubmission | RepositoryError>
  insertPending(args: {
    accountId: AccountId
    submissionId: BtcMapSubmissionId
    externalId: string
    lat: number
    lon: number
    category: BtcMapCategory
    name: BtcMapPlaceName
  }): Promise<BtcMapPlaceSubmission | RepositoryError>
  markSubmitted(args: {
    submissionId: BtcMapSubmissionId
    btcMapPlaceId: number
    lat: number
    lon: number
    category: BtcMapCategory
    name: BtcMapPlaceName
  }): Promise<BtcMapPlaceSubmission | RepositoryError>
}

export const BtcMapPlaceSubmissionsRepository = (): IBtcMapPlaceSubmissionsRepository => {
  const findBySubmissionId = async ({
    submissionId,
  }: {
    submissionId: BtcMapSubmissionId
  }): Promise<BtcMapPlaceSubmission | RepositoryError> => {
    try {
      // blink-scoped: submissions are shared across accounts, so the lookup
      // key is the submissionId alone
      const result = await BtcMapPlaceSubmission.findOne({ submissionId })
      if (!result) {
        return new CouldNotFindBtcMapPlaceSubmissionError(submissionId)
      }
      return translateToBtcMapPlaceSubmission(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const insertPending = async ({
    accountId,
    submissionId,
    externalId,
    lat,
    lon,
    category,
    name,
  }: {
    accountId: AccountId
    submissionId: BtcMapSubmissionId
    externalId: string
    lat: number
    lon: number
    category: BtcMapCategory
    name: BtcMapPlaceName
  }): Promise<BtcMapPlaceSubmission | RepositoryError> => {
    try {
      const result = await BtcMapPlaceSubmission.create({
        accountId,
        submissionId,
        externalId,
        lat,
        lon,
        category,
        name,
        status: BtcMapPlaceSubmissionStatus.Pending,
      })
      return translateToBtcMapPlaceSubmission(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  // btcmap's resubmit-patches semantics mean the latest fields win upstream,
  // so the record is updated to match what was actually submitted. The
  // original creator (accountId) is deliberately preserved on edits.
  const markSubmitted = async ({
    submissionId,
    btcMapPlaceId,
    lat,
    lon,
    category,
    name,
  }: {
    submissionId: BtcMapSubmissionId
    btcMapPlaceId: number
    lat: number
    lon: number
    category: BtcMapCategory
    name: BtcMapPlaceName
  }): Promise<BtcMapPlaceSubmission | RepositoryError> => {
    try {
      const result = await BtcMapPlaceSubmission.findOneAndUpdate(
        { submissionId },
        {
          status: BtcMapPlaceSubmissionStatus.Submitted,
          btcMapPlaceId,
          lat,
          lon,
          category,
          name,
          updatedAt: new Date(),
        },
        { new: true },
      )
      if (!result) {
        return new CouldNotFindBtcMapPlaceSubmissionError(submissionId)
      }
      return translateToBtcMapPlaceSubmission(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const translateToBtcMapPlaceSubmission = (
    record: BtcMapPlaceSubmissionRecord,
  ): BtcMapPlaceSubmission => ({
    accountId: record.accountId as AccountId,
    submissionId: record.submissionId as BtcMapSubmissionId,
    externalId: record.externalId,
    lat: record.lat,
    lon: record.lon,
    category: record.category as BtcMapCategory,
    name: record.name as BtcMapPlaceName,
    status: record.status as BtcMapPlaceSubmissionStatus,
    btcMapPlaceId: record.btcMapPlaceId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })

  return {
    findBySubmissionId,
    insertPending,
    markSubmitted,
  }
}
