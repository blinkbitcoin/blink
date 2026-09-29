import { fromObjectId, parseRepositoryError } from "./utils"

import { InactivityFeeNotice } from "./schema"

import {
  InactivityFeeNoticeNotFoundError,
  InactivityFeeNoticeStatus,
} from "@/domain/inactivity-fee"

export const InactivityFeeNoticesRepository = (): IInactivityFeeNoticesRepository => {
  const findActiveByAccountId = async (
    accountId: AccountId,
  ): Promise<
    InactivityFeeNotice | InactivityFeeNoticeNotFoundError | RepositoryError
  > => {
    try {
      const result = await InactivityFeeNotice.findOne({
        accountId,
        status: InactivityFeeNoticeStatus.Active,
      })
      if (!result) return new InactivityFeeNoticeNotFoundError(accountId)
      return noticeFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  // A second active row for the same account is refused by the partial unique index and comes
  // back as DuplicateKeyForPersistError: callers look up first and treat the race as an error.
  const insertActive = async ({
    accountId,
    issuedAt,
    templateVersion,
    source,
    sourceHash,
    bulletinIssued,
    pushSent,
  }: InsertActiveNoticeArgs): Promise<InactivityFeeNotice | RepositoryError> => {
    try {
      const now = new Date()
      const result = await InactivityFeeNotice.create({
        accountId,
        issuedAt,
        templateVersion,
        source,
        ...(sourceHash !== undefined ? { sourceHash } : {}),
        bulletinIssued,
        pushSent,
        status: InactivityFeeNoticeStatus.Active,
        createdAt: now,
        updatedAt: now,
      })
      return noticeFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const markBulletinIssued = async ({
    id,
    issuedAt,
    pushSent,
  }: MarkBulletinIssuedArgs): Promise<
    InactivityFeeNotice | InactivityFeeNoticeNotFoundError | RepositoryError
  > => {
    try {
      const result = await InactivityFeeNotice.findOneAndUpdate(
        { _id: id, status: InactivityFeeNoticeStatus.Active },
        { $set: { bulletinIssued: true, issuedAt, pushSent, updatedAt: new Date() } },
        { new: true },
      )
      if (!result) return new InactivityFeeNoticeNotFoundError(id)
      return noticeFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const supersede = async ({
    id,
    reason,
    supersededAt,
  }: SupersedeNoticeArgs): Promise<
    InactivityFeeNotice | InactivityFeeNoticeNotFoundError | RepositoryError
  > => {
    try {
      const result = await InactivityFeeNotice.findOneAndUpdate(
        { _id: id, status: InactivityFeeNoticeStatus.Active },
        {
          $set: {
            status: InactivityFeeNoticeStatus.Superseded,
            supersededReason: reason,
            supersededAt,
            updatedAt: new Date(),
          },
        },
        { new: true },
      )
      if (!result) return new InactivityFeeNoticeNotFoundError(id)
      return noticeFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  return {
    findActiveByAccountId,
    insertActive,
    markBulletinIssued,
    supersede,
  }
}

const noticeFromRaw = (
  result: InactivityFeeNoticeRecord & { _id: unknown },
): InactivityFeeNotice => ({
  id: fromObjectId<InactivityFeeNoticeId>(String(result._id)),
  accountId: result.accountId as AccountId,
  issuedAt: new Date(result.issuedAt),
  templateVersion: result.templateVersion as InactivityFeeTemplateVersion,
  bulletinIssued: result.bulletinIssued,
  pushSent: result.pushSent,
  status: result.status as InactivityFeeNoticeStatus,
  supersededAt: result.supersededAt ? new Date(result.supersededAt) : undefined,
  supersededReason: result.supersededReason
    ? (result.supersededReason as InactivityFeeSupersededReason)
    : undefined,
  source: result.source as InactivityFeeNoticeSource,
  sourceHash: result.sourceHash || undefined,
  createdAt: new Date(result.createdAt),
  updatedAt: new Date(result.updatedAt),
})
