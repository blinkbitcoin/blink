import { parseRepositoryError } from "./utils"

import { PostMigrationDepositRelease as PostMigrationDepositReleaseModel } from "./schema"

import { CouldNotFindError, DuplicateKeyForPersistError } from "@/domain/errors"
import {
  MigrationStateConflictError,
  PostMigrationDepositReleaseStatus,
} from "@/domain/migration-flow"
import { toSats } from "@/domain/bitcoin"

export const PostMigrationDepositReleaseRepository =
  (): IPostMigrationDepositReleaseRepository => {
    const findByOutput = async ({
      txHash,
      vout,
    }: {
      txHash: OnChainTxHash
      vout: OnChainTxVout
    }): Promise<PostMigrationDepositRelease | RepositoryError> => {
      try {
        const result = await PostMigrationDepositReleaseModel.findOne({ txHash, vout })
        if (!result) {
          return new CouldNotFindError(`post-migration release ${txHash}:${vout}`)
        }
        return releaseFromRaw(result)
      } catch (err) {
        return parseRepositoryError(err)
      }
    }

    const upsertPrepared = async (
      args: PreparePostMigrationDepositReleaseArgs,
    ): Promise<PostMigrationDepositRelease | RepositoryError> => {
      try {
        const result = await PostMigrationDepositReleaseModel.findOneAndUpdate(
          { txHash: args.txHash, vout: args.vout },
          {
            $setOnInsert: {
              ...args,
              status: PostMigrationDepositReleaseStatus.Prepared,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        )
        return releaseFromRaw(result)
      } catch (err) {
        const parsed = parseRepositoryError(err)
        if (parsed instanceof DuplicateKeyForPersistError) {
          return findByOutput({ txHash: args.txHash, vout: args.vout })
        }
        return parsed
      }
    }

    const claimForRelease = async ({
      txHash,
      vout,
    }: {
      txHash: OnChainTxHash
      vout: OnChainTxVout
    }): Promise<PostMigrationDepositRelease | RepositoryError | MigrationFlowError> => {
      try {
        const result = await PostMigrationDepositReleaseModel.findOneAndUpdate(
          { txHash, vout, status: PostMigrationDepositReleaseStatus.Prepared },
          {
            $set: {
              status: PostMigrationDepositReleaseStatus.Processing,
              updatedAt: new Date(),
            },
          },
          { new: true },
        )
        if (!result) {
          return new MigrationStateConflictError(
            `release ${txHash}:${vout} is not prepared`,
          )
        }
        return releaseFromRaw(result)
      } catch (err) {
        return parseRepositoryError(err)
      }
    }

    const recordPayment = async ({
      txHash,
      vout,
      paymentHash,
      paymentRequest,
    }: {
      txHash: OnChainTxHash
      vout: OnChainTxVout
      paymentHash: PaymentHash
      paymentRequest: string
    }): Promise<PostMigrationDepositRelease | RepositoryError | MigrationFlowError> => {
      try {
        const result = await PostMigrationDepositReleaseModel.findOneAndUpdate(
          {
            txHash,
            vout,
            status: PostMigrationDepositReleaseStatus.Processing,
            paymentHash: { $exists: false },
          },
          { $set: { paymentHash, paymentRequest, updatedAt: new Date() } },
          { new: true },
        )
        if (!result) {
          return new MigrationStateConflictError(
            `release ${txHash}:${vout} cannot bind payment hash`,
          )
        }
        return releaseFromRaw(result)
      } catch (err) {
        return parseRepositoryError(err)
      }
    }

    const updateStatus = async ({
      txHash,
      vout,
      from,
      to,
      failureReason,
    }: {
      txHash: OnChainTxHash
      vout: OnChainTxVout
      from: PostMigrationDepositReleaseStatus
      to: PostMigrationDepositReleaseStatus
      failureReason?: string
    }): Promise<PostMigrationDepositRelease | RepositoryError | MigrationFlowError> => {
      try {
        const result = await PostMigrationDepositReleaseModel.findOneAndUpdate(
          { txHash, vout, status: from },
          {
            $set: {
              status: to,
              updatedAt: new Date(),
              ...(failureReason ? { failureReason } : {}),
            },
          },
          { new: true },
        )
        if (!result) {
          return new MigrationStateConflictError(
            `release ${txHash}:${vout} is not ${from}`,
          )
        }
        return releaseFromRaw(result)
      } catch (err) {
        return parseRepositoryError(err)
      }
    }

    return {
      findByOutput,
      upsertPrepared,
      claimForRelease,
      recordPayment,
      updateStatus,
    }
  }

const releaseFromRaw = (
  result: PostMigrationDepositReleaseRecord,
): PostMigrationDepositRelease => ({
  accountId: result.accountId as AccountId,
  walletId: result.walletId as WalletId,
  txHash: result.txHash as OnChainTxHash,
  vout: result.vout as OnChainTxVout,
  address: result.address as OnChainAddress,
  receiptJournalId: result.receiptJournalId as LedgerJournalId,
  receiptAmountSats: toSats(result.receiptAmountSats),
  payoutAmountSats: toSats(result.payoutAmountSats),
  lightningAddress: result.lightningAddress as LightningAddress,
  caseReference: result.caseReference,
  status: result.status as PostMigrationDepositReleaseStatus,
  paymentHash: (result.paymentHash as PaymentHash) || undefined,
  paymentRequest: result.paymentRequest || undefined,
  failureReason: result.failureReason || undefined,
  sweptAt: result.sweptAt || undefined,
  sweepJournalId: (result.sweepJournalId as LedgerJournalId) || undefined,
  createdAt: result.createdAt,
  updatedAt: result.updatedAt,
})
