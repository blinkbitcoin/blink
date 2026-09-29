import {
  InactivityFeeRateSource,
  InactivityFeeRefundUnpairableError,
  unpairedDebits,
} from "@/domain/inactivity-fee"
import { toSats } from "@/domain/bitcoin"
import { toCents } from "@/domain/fiat"
import { LedgerTransactionType } from "@/domain/ledger"
import { ResourceExpiredLockServiceError } from "@/domain/lock"
import { usdPerBtcFromRatio } from "@/domain/payments"
import { paymentAmountFromNumber, WalletCurrency } from "@/domain/shared"

import { DealerPriceService } from "@/services/dealer-price"
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
  const refundPrice = lazyRefundPrice()

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
        error: new InactivityFeeRefundUnpairableError(
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
        refundPrice,
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

type RefundPrice = {
  ratio: WalletPriceRatio
  // USD per BTC
  rate: number
  rateSource: InactivityFeeRateSource
}

// One dealer mid-rate per refund call for one account, read on the first Dollar Balance refund
// that needs it and never for a Bitcoin Balance. Straight from the dealer, no price-service or
// cache fallback; an error is kept, so it fails that call's Dollar Balance refunds without
// asking again.
const lazyRefundPrice = (): (() => Promise<RefundPrice | ApplicationError>) => {
  let price: Promise<RefundPrice | ApplicationError> | undefined
  return () => {
    price ??= readRefundPrice()
    return price
  }
}

const readRefundPrice = async (): Promise<RefundPrice | ApplicationError> => {
  const ratio = await DealerPriceService().getCentsPerSatsExchangeMidRate()
  if (ratio instanceof Error) return ratio
  return {
    ratio,
    rate: usdPerBtcFromRatio(ratio),
    rateSource: InactivityFeeRateSource.DealerMid,
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
  refundPrice,
}: {
  wallet: Wallet
  debit: LedgerTransaction<WalletCurrency>
  refundExternalId: LedgerExternalId
  reason: InactivityFeeRefundReason
  runId: string
  signal: InactivityFeeAccountAbortSignal
  refundPrice: () => Promise<RefundPrice | ApplicationError>
}): Promise<boolean | ApplicationError> => {
  if (signal.aborted) return new ResourceExpiredLockServiceError(signal.error?.message)

  // The wallet's own unit comes from the debit row, no config. A Bitcoin Balance gets the
  // debit's sats and cents back exactly; a Dollar Balance gets the debit's cents, with the sats
  // the dealer covers priced at refund time, so the dealer carries no price move in between.
  const isBtc = wallet.currency === WalletCurrency.Btc
  if (debit.centsAmount === undefined || (isBtc && debit.satsAmount === undefined)) {
    return new InactivityFeeRefundUnpairableError(
      `fee row ${debit.id} carries no amounts`,
    )
  }
  const usd = paymentAmountFromNumber({
    amount: debit.centsAmount,
    currency: WalletCurrency.Usd,
  })
  if (usd instanceof Error) return usd

  // the external id index is not unique: the pair is looked up again under the lock. A voided
  // refund is absent here as it is to the pairing scan, so the debit it failed to reverse is
  // refunded again rather than counted as already paired.
  const existing = await LedgerService().getTransactionForWalletByExternalId({
    walletId: wallet.id,
    externalId: refundExternalId,
    excludeVoided: true,
    // external ids are caller-supplied on invoices: only a refund row pairs the debit
    type: LedgerTransactionType.InactivityFeeRefund,
  })
  if (existing instanceof Error) return existing
  if (existing !== undefined) return false

  let btc: BtcPaymentAmount
  let priced: { rate: number; rateSource: InactivityFeeRateSource } | undefined
  if (isBtc) {
    const debitSats = paymentAmountFromNumber({
      amount: debit.satsAmount ?? 0,
      currency: WalletCurrency.Btc,
    })
    if (debitSats instanceof Error) return debitSats
    btc = debitSats
  } else {
    const price = await refundPrice()
    if (price instanceof Error) return price
    // round-half, as a payment converts
    btc = price.ratio.convertFromUsd(usd)
    priced = { rate: price.rate, rateSource: price.rateSource }
  }

  // the lock may have been lost during the lookups
  if (signal.aborted) return new ResourceExpiredLockServiceError(signal.error?.message)

  const journal = await LedgerFacade.recordInactivityFeeRefund({
    walletDescriptor: {
      id: wallet.id,
      currency: wallet.currency,
      accountId: wallet.accountId,
    },
    amount: { btc, usd },
    externalId: refundExternalId,
    metadata: { refundReason: reason, noticeId: debit.noticeId, runId, ...priced },
    display: displayFromDebit({ debit }),
  })
  if (journal instanceof Error) return journal
  return true
}

// the debit row's own display fields, so both rows agree; none when the row carries none
const displayFromDebit = ({
  debit,
}: {
  debit: LedgerTransaction<WalletCurrency>
}): DisplayTxnAmounts | undefined => {
  if (debit.displayAmount === undefined || debit.displayCurrency === undefined) {
    return undefined
  }
  return {
    displayAmount: debit.displayAmount,
    displayFee: debit.displayFee ?? (0 as DisplayCurrencyBaseAmount),
    displayCurrency: debit.displayCurrency,
    ...(debit.displayCurrencyFractionDigits !== undefined
      ? { displayCurrencyFractionDigits: debit.displayCurrencyFractionDigits }
      : {}),
  }
}
