import { toSats } from "@/domain/bitcoin"
import { toCents } from "@/domain/fiat"
import { checkedToLedgerExternalId, LedgerTransactionType } from "@/domain/ledger"
import { ResourceExpiredLockServiceError } from "@/domain/lock"
import {
  MigrationStateConflictError,
  PostMigrationDepositReleaseStatus,
} from "@/domain/migration-flow"
import {
  BtcWalletDescriptor,
  checkedToBtcPaymentAmount,
  WalletCurrency,
  ZERO_CENTS,
} from "@/domain/shared"
import { LedgerService } from "@/services/ledger"
import * as LedgerFacade from "@/services/ledger/facade"
import { LockService } from "@/services/lock"
import { PostMigrationDepositReleaseRepository } from "@/services/mongoose"

export const completePostMigrationDepositRelease = async ({
  txHash,
  vout,
  bankOwnerWalletId,
}: {
  txHash: OnChainTxHash
  vout: OnChainTxVout
  bankOwnerWalletId: WalletId
}): Promise<PostMigrationDepositRelease | ApplicationError> =>
  LockService().lockOnChainTxHashAndVout({ txHash, vout }, async (signal) => {
    const repo = PostMigrationDepositReleaseRepository()
    let release = await repo.findByOutput({ txHash, vout })
    if (release instanceof Error) return release
    if (release.status === PostMigrationDepositReleaseStatus.Failed) {
      return new MigrationStateConflictError(`release ${txHash}:${vout} is failed`)
    }
    if (!release.paymentHash) {
      return new MigrationStateConflictError("release has no bound payment hash")
    }

    const sweepExternalId = checkedToLedgerExternalId(
      `pmdr_${release.txHash}_${release.vout}`,
    )
    if (sweepExternalId instanceof Error) return sweepExternalId

    const receiptError = await validateReceipt(release)
    if (receiptError) return receiptError

    let sweepJournalId = release.sweepJournalId
    if (sweepJournalId) {
      const sweepError = await validateSweep({
        release,
        bankOwnerWalletId,
        sweepExternalId,
        sweepJournalId,
      })
      if (sweepError) return sweepError
    } else {
      const existingSweep = await LedgerService().getTransactionForWalletByExternalId({
        walletId: release.walletId,
        externalId: sweepExternalId,
      })
      if (existingSweep instanceof Error) return existingSweep

      if (existingSweep) {
        sweepJournalId = existingSweep.journalId
        const sweepError = await validateSweep({
          release,
          bankOwnerWalletId,
          sweepExternalId,
          sweepJournalId,
        })
        if (sweepError) return sweepError
      } else {
        if (signal.aborted) {
          return new ResourceExpiredLockServiceError(signal.error?.message)
        }

        const amount = checkedToBtcPaymentAmount(release.receiptAmountSats)
        if (amount instanceof Error) return amount
        const journal = await LedgerFacade.recordIntraledger({
          description: `post-migration deposit sweep ${release.caseReference}`,
          senderWalletDescriptor: BtcWalletDescriptor(release.walletId),
          recipientWalletDescriptor: BtcWalletDescriptor(bankOwnerWalletId),
          amount: { btc: amount, usd: ZERO_CENTS },
          externalId: sweepExternalId,
          metadata: {
            type: LedgerTransactionType.IntraLedger,
            pending: false,
            satsAmount: toSats(release.receiptAmountSats),
            centsAmount: toCents(0),
            satsFee: toSats(0),
            centsFee: toCents(0),
          },
          additionalDebitMetadata: {},
          additionalCreditMetadata: {},
          additionalInternalMetadata: {},
        })
        if (journal instanceof Error) return journal
        sweepJournalId = journal.journalId
      }

      release = await repo.recordSweep({ txHash, vout, sweepJournalId })
      if (release instanceof Error) return release
    }

    if (release.status === PostMigrationDepositReleaseStatus.Completed) return release
    return repo.updateStatus({
      txHash,
      vout,
      from: release.status,
      to: PostMigrationDepositReleaseStatus.Completed,
    })
  })

const validateReceipt = async (
  release: PostMigrationDepositRelease,
): Promise<ApplicationError | undefined> => {
  const receipt = await LedgerService().getTransactionForWalletByJournalId({
    walletId: release.walletId,
    journalId: release.receiptJournalId,
  })
  if (receipt instanceof Error) return receipt
  if (
    receipt.type !== LedgerTransactionType.OnchainReceipt ||
    receipt.pendingConfirmation ||
    receipt.walletId !== release.walletId ||
    receipt.currency !== WalletCurrency.Btc ||
    receipt.txHash !== release.txHash ||
    receipt.vout !== release.vout ||
    receipt.address !== release.address ||
    receipt.debit !== 0 ||
    receipt.credit !== release.receiptAmountSats
  ) {
    return new MigrationStateConflictError(
      `receipt journal does not match release ${release.txHash}:${release.vout}`,
    )
  }
}

const validateSweep = async ({
  release,
  bankOwnerWalletId,
  sweepExternalId,
  sweepJournalId,
}: {
  release: PostMigrationDepositRelease
  bankOwnerWalletId: WalletId
  sweepExternalId: LedgerExternalId
  sweepJournalId: LedgerJournalId
}): Promise<ApplicationError | undefined> => {
  const [customerTx, bankOwnerTx] = await Promise.all([
    LedgerService().getTransactionForWalletByJournalId({
      walletId: release.walletId,
      journalId: sweepJournalId,
    }),
    LedgerService().getTransactionForWalletByJournalId({
      walletId: bankOwnerWalletId,
      journalId: sweepJournalId,
    }),
  ])
  if (customerTx instanceof Error) return customerTx
  if (bankOwnerTx instanceof Error) return bankOwnerTx

  const matches =
    customerTx.type === LedgerTransactionType.IntraLedger &&
    customerTx.walletId === release.walletId &&
    customerTx.currency === WalletCurrency.Btc &&
    customerTx.externalId === sweepExternalId &&
    customerTx.debit === release.receiptAmountSats &&
    customerTx.credit === 0 &&
    bankOwnerTx.type === LedgerTransactionType.IntraLedger &&
    bankOwnerTx.walletId === bankOwnerWalletId &&
    bankOwnerTx.currency === WalletCurrency.Btc &&
    bankOwnerTx.externalId === sweepExternalId &&
    bankOwnerTx.journalId === customerTx.journalId &&
    bankOwnerTx.debit === 0 &&
    bankOwnerTx.credit === release.receiptAmountSats

  return matches
    ? undefined
    : new MigrationStateConflictError(
        `sweep journal does not match release ${release.txHash}:${release.vout}`,
      )
}
