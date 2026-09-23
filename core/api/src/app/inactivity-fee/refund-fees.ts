import { InactivityFeeRefundFailedError, unpairedDebits } from "@/domain/inactivity-fee"
import { toSats } from "@/domain/bitcoin"
import { toCents } from "@/domain/fiat"
import { ResourceExpiredLockServiceError } from "@/domain/lock"
import { paymentAmountFromNumber, WalletCurrency } from "@/domain/shared"

import { LedgerService } from "@/services/ledger"
import * as LedgerFacade from "@/services/ledger/facade"
import { LockService } from "@/services/lock"
import { WalletsRepository } from "@/services/mongoose"
import { addAttributesToCurrentSpan } from "@/services/tracing"

// the only caller of recordInactivityFeeRefund: one refund per unpaired debit, failures are per debit
export const refundInactivityFees = async ({
  accountId,
  reason,
  runId,
  signal,
}: RefundInactivityFeesArgs): Promise<InactivityFeeRefundResult | ApplicationError> => {
  if (signal !== undefined) {
    return refundUnderLock({ accountId, reason, runId, signal })
  }
  // kept aside so a lock released late cannot turn posted refunds into an error
  const finished: { result?: InactivityFeeRefundResult | ApplicationError } = {}
  const locked = await LockService().lockInactivityFeeAccount(
    accountId,
    async (signal) => {
      finished.result = await refundUnderLock({ accountId, reason, runId, signal })
      return finished.result
    },
  )
  return finished.result ?? locked
}

const refundUnderLock = async ({
  accountId,
  reason,
  runId,
  signal,
}: Omit<RefundInactivityFeesArgs, "signal"> & {
  signal: InactivityFeeAccountAbortSignal
}): Promise<InactivityFeeRefundResult | ApplicationError> => {
  // closed accounts keep their wallets
  const wallets = await WalletsRepository().listByAccountId(accountId)
  if (wallets instanceof Error) return wallets

  let refundedSats = 0
  let refundedCents = 0
  const failures: InactivityFeeRefundFailure[] = []

  for (const wallet of wallets) {
    const transactions = await LedgerService().listInactivityFeeTransactionsByWalletId(
      wallet.id,
    )
    if (transactions instanceof Error) {
      failures.push({ walletId: wallet.id, error: transactions })
      continue
    }

    const { unpaired, malformed } = unpairedDebits({ transactions })
    for (const row of malformed) {
      failures.push({
        walletId: wallet.id,
        error: new InactivityFeeRefundFailedError(
          `row ${row.id} cannot be paired safely: ${row.externalId ?? "no key"}`,
        ),
      })
    }

    for (const { debit, refundExternalId } of unpaired) {
      const refunded = await refundDebit({
        wallet,
        debit,
        refundExternalId,
        reason,
        runId,
        signal,
      })
      if (refunded instanceof Error) {
        failures.push({
          walletId: wallet.id,
          externalId: refundExternalId,
          error: refunded,
        })
        continue
      }
      if (!refunded) continue
      if (wallet.currency === WalletCurrency.Btc) refundedSats += debit.satsAmount ?? 0
      else refundedCents += debit.centsAmount ?? 0
    }
  }

  addAttributesToCurrentSpan({
    "inactivityfee.refund.accountId": accountId,
    "inactivityfee.refund.reason": reason,
    "inactivityfee.refund.runId": runId,
    "inactivityfee.refund.sats": String(refundedSats),
    "inactivityfee.refund.cents": String(refundedCents),
    "inactivityfee.refund.failures": String(failures.length),
  })

  return {
    refundedSats: toSats(refundedSats),
    refundedCents: toCents(refundedCents),
    failures,
  }
}

// true = posted, false = the pair was already there
const refundDebit = async ({
  wallet,
  debit,
  refundExternalId,
  reason,
  runId,
  signal,
}: {
  wallet: Wallet
  debit: LedgerTransaction<WalletCurrency>
  refundExternalId: LedgerExternalId
  reason: InactivityFeeRefundReason
  runId: string
  signal: InactivityFeeAccountAbortSignal
}): Promise<boolean | ApplicationError> => {
  if (signal.aborted) return new ResourceExpiredLockServiceError(signal.error?.message)

  // the amounts of the debit row itself: no config, no rate
  if (debit.satsAmount === undefined || debit.centsAmount === undefined) {
    return new InactivityFeeRefundFailedError(`fee row ${debit.id} carries no amounts`)
  }
  const btc = paymentAmountFromNumber({
    amount: debit.satsAmount,
    currency: WalletCurrency.Btc,
  })
  if (btc instanceof Error) return btc
  const usd = paymentAmountFromNumber({
    amount: debit.centsAmount,
    currency: WalletCurrency.Usd,
  })
  if (usd instanceof Error) return usd

  // the external id index is not unique: the pair is looked up again under the lock
  const existing = await LedgerService().getTransactionForWalletByExternalId({
    walletId: wallet.id,
    externalId: refundExternalId,
  })
  if (existing instanceof Error) return existing
  if (existing !== undefined) return false

  // the lock may have been lost during the lookup
  if (signal.aborted) return new ResourceExpiredLockServiceError(signal.error?.message)

  const journal = await LedgerFacade.recordInactivityFeeRefund({
    walletDescriptor: {
      id: wallet.id,
      currency: wallet.currency,
      accountId: wallet.accountId,
    },
    amount: { btc, usd },
    externalId: refundExternalId,
    metadata: { refundReason: reason, noticeId: debit.noticeId, runId },
  })
  if (journal instanceof Error) return journal
  return true
}
