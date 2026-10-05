import { getCurrentPriceAsDisplayPriceRatio } from "@/app/prices"

import { DisplayAmountsConverter, UsdDisplayCurrency } from "@/domain/fiat"
import {
  evaluateCharge,
  InactivityFeeChargeOutcome,
  InactivityFeeDebitInvariantError,
  inactivityFeeExternalId,
  InactivityFeeSkipReason,
  isNoticeLive,
  sizeInactivityFee,
} from "@/domain/inactivity-fee"
import { LedgerTransactionType } from "@/domain/ledger"
import { ResourceExpiredLockServiceError } from "@/domain/lock"
import { toDisplayBaseAmount } from "@/domain/payments"
import { ErrorLevel, WalletCurrency, ZERO_CENTS, ZERO_SATS } from "@/domain/shared"

import { LedgerService } from "@/services/ledger"
import * as LedgerFacade from "@/services/ledger/facade"
import { LockService } from "@/services/lock"
import { AccountsRepository } from "@/services/mongoose"
import { addEventToCurrentSpan, recordExceptionInCurrentSpan } from "@/services/tracing"

// one price-service lookup per display currency per run, cached while pending so concurrent
// accounts share it; a failure is kept so it warns once
export type DisplayRatioCache = Map<
  DisplayCurrency,
  Promise<DisplayPriceRatio<"BTC", DisplayCurrency> | ApplicationError>
>

type ChargeWalletArgs = {
  account: Account
  notice: InactivityFeeNotice | undefined
  wallet: Wallet
  balance: BalanceAmount<WalletCurrency>
  ctx: InactivityFeeChargeContext
  asOf: Date
  // YYYY-MM of asOf, UTC
  month: string
  dryRun: boolean
  pinned: InactivityFeePinnedRate
  config: InactivityFeeConfig
  runId: string
  displayRatios: DisplayRatioCache
  signal: InactivityFeeAccountAbortSignal
}

// One wallet, under the account lock, from live reads only: the cheap predicate → the month
// key (a round trip, so only for a wallet nothing else has ruled out) → the wallet lock user
// sends take, nested inside the account lock (account → wallet, never the reverse) → account
// and balance read again and the predicate re-run → min(fee, balance) at the pinned rate →
// post. Dry-run runs the same path, wallet lock included, and skips exactly the post. Every
// failure is this wallet's outcome; the account's other wallet is unaffected.
export const chargeWallet = async ({
  account,
  notice,
  wallet,
  balance,
  ctx,
  asOf,
  month,
  dryRun,
  pinned,
  config,
  runId,
  displayRatios,
  signal,
}: ChargeWalletArgs): Promise<InactivityFeeChargeOutcomeRecord> => {
  const base = {
    accountId: account.id,
    walletId: wallet.id,
    currency: wallet.currency,
    noticeId: notice?.id,
  }

  const key = inactivityFeeExternalId({ walletId: wallet.id, month })
  if (key instanceof Error) {
    recordExceptionInCurrentSpan({ error: key })
    return { ...base, outcome: InactivityFeeChargeOutcome.Error, reason: key.name }
  }
  const externalId = key

  // the key and the amount travel with every failure: an ambiguous post failure is reconciled
  // by the key it may or may not have committed under
  const failed = (
    error: Error,
    { level, amount }: { level?: ErrorLevel; amount?: number } = {},
  ): InactivityFeeChargeOutcomeRecord => {
    recordExceptionInCurrentSpan({ error, level })
    return {
      ...base,
      outcome: InactivityFeeChargeOutcome.Error,
      reason: error.name,
      externalId,
      ...(amount !== undefined ? { amount } : {}),
    }
  }
  const skipped = (
    reason: InactivityFeeSkipReason,
  ): InactivityFeeChargeOutcomeRecord => ({
    ...base,
    outcome: InactivityFeeChargeOutcome.Skipped,
    reason,
    externalId,
  })

  // every check but already_debited, which alone needs the ledger
  const verdict = evaluateCharge({
    account,
    notice,
    balance,
    keyExists: false,
    asOf,
    dryRun,
    ctx,
    config,
  })
  if (verdict.outcome === "skip") return skipped(verdict.reason)

  // the external id index is not unique: existence is read here, under the lock
  const existing = await LedgerService().getTransactionForWalletByExternalId({
    walletId: wallet.id,
    externalId,
    // a voided debit was reversed: this month is chargeable again
    excludeVoided: true,
    // external ids are caller-supplied on invoices: only a fee row holds the month
    type: LedgerTransactionType.InactivityFee,
  })
  if (existing instanceof Error) return failed(existing)
  if (existing !== undefined) return skipped(InactivityFeeSkipReason.AlreadyDebited)

  // A user send holds this lock across its balance check and its post; the account lock alone
  // does not keep one out. Result kept aside so a late release cannot turn a posted debit into
  // an error.
  const finished: { record?: InactivityFeeChargeOutcomeRecord } = {}
  const locked = await LockService().lockWalletId(wallet.id, async (walletSignal) => {
    finished.record = await chargeUnderWalletLock({
      account,
      notice,
      wallet,
      ctx,
      asOf,
      dryRun,
      pinned,
      config,
      runId,
      displayRatios,
      signal,
      walletSignal,
      externalId,
      base,
      failed,
      skipped,
    })
    return finished.record
  })
  if (finished.record !== undefined) return finished.record
  return failed(locked instanceof Error ? locked : new Error("lock returned no result"))
}

type ChargeUnderWalletLockArgs = Omit<ChargeWalletArgs, "balance" | "month"> & {
  walletSignal: WalletIdAbortSignal
  externalId: LedgerExternalId
  base: Pick<
    InactivityFeeChargeOutcomeRecord,
    "accountId" | "walletId" | "currency" | "noticeId"
  >
  failed: (
    error: Error,
    options?: { level?: ErrorLevel; amount?: number },
  ) => InactivityFeeChargeOutcomeRecord
  skipped: (reason: InactivityFeeSkipReason) => InactivityFeeChargeOutcomeRecord
}

// Under both locks. What a send that held the wallet lock changed is what these reads see: a
// fresh activity clock settles the wallet as active, a lower balance re-sizes the fee.
const chargeUnderWalletLock = async ({
  account: accountRead,
  notice,
  wallet,
  ctx,
  asOf,
  dryRun,
  pinned,
  config,
  runId,
  displayRatios,
  signal,
  walletSignal,
  externalId,
  base,
  failed,
  skipped,
}: ChargeUnderWalletLockArgs): Promise<InactivityFeeChargeOutcomeRecord> => {
  const account = await AccountsRepository().findById(accountRead.id)
  if (account instanceof Error) return failed(account)

  const balance = await LedgerService().getWalletBalanceAmount(wallet)
  if (balance instanceof Error) return failed(balance)

  // the key was read before the wallet lock; it is read again below, just before the post
  const verdict = evaluateCharge({
    account,
    notice,
    balance,
    keyExists: false,
    asOf,
    dryRun,
    ctx,
    config,
  })
  if (verdict.outcome === "skip") return skipped(verdict.reason)

  const amount = sizeInactivityFee({
    balance,
    feeAmountUsdCents: config.feeAmountUsdCents,
    ratio: pinned.ratio,
  })
  const walletAmount = Number(
    wallet.currency === WalletCurrency.Btc ? amount.btc.amount : amount.usd.amount,
  )

  // Invariants the predicate already guarantees, re-checked at the post site so a regression
  // pages (Critical + alert event) and skips the wallet instead of posting.
  const alert = (kind: string): InactivityFeeChargeOutcomeRecord => {
    addEventToCurrentSpan(`inactivityfee.alert.${kind}`, {
      "inactivityfee.alert.accountId": account.id,
      "inactivityfee.alert.walletId": wallet.id,
      "inactivityfee.alert.externalId": externalId,
      "inactivityfee.alert.amount": walletAmount,
    })
    return failed(new InactivityFeeDebitInvariantError(`${kind}: ${externalId}`), {
      level: ErrorLevel.Critical,
      amount: walletAmount,
    })
  }
  if (BigInt(walletAmount) > balance.amount || walletAmount <= 0) {
    return alert("debit_over_balance")
  }
  if (notice === undefined || !isNoticeLive({ notice, account })) {
    return alert("debit_without_live_notice")
  }

  if (dryRun) {
    return {
      ...base,
      outcome: InactivityFeeChargeOutcome.WouldCharge,
      amount: walletAmount,
      externalId,
    }
  }

  const display = await displayAmountsFor({ account, amount, displayRatios })

  // the key is read once more, after the price lookup: a row that appeared since the predicate
  // read it would be a second debit for the month
  const appeared = await LedgerService().getTransactionForWalletByExternalId({
    walletId: wallet.id,
    externalId,
    excludeVoided: true,
    type: LedgerTransactionType.InactivityFee,
  })
  if (appeared instanceof Error) return failed(appeared, { amount: walletAmount })
  if (appeared !== undefined) return alert("second_debit_in_month")

  // last before the post: either lock may have been lost during the reads above
  for (const held of [signal, walletSignal]) {
    if (held.aborted) {
      return failed(new ResourceExpiredLockServiceError(held.error?.message), {
        amount: walletAmount,
      })
    }
  }

  const journal = await LedgerFacade.recordInactivityFee({
    walletDescriptor: {
      id: wallet.id,
      currency: wallet.currency,
      accountId: wallet.accountId,
    },
    amount,
    externalId,
    metadata: {
      rate: pinned.rate,
      rateSource: pinned.rateSource,
      configVersion: config.configVersion,
      noticeId: notice.id,
      runId,
    },
    display,
  })
  if (journal instanceof Error) return failed(journal, { amount: walletAmount })

  return {
    ...base,
    outcome: InactivityFeeChargeOutcome.Charged,
    amount: walletAmount,
    externalId,
  }
}

// Display only, never the debit amount: the account's display currency at the price service's
// ratio. USD needs nothing (the facade's default); any failure falls back to that USD display.
const displayAmountsFor = async ({
  account,
  amount,
  displayRatios,
}: {
  account: Account
  amount: InactivityFeeAmount
  displayRatios: DisplayRatioCache
}): Promise<DisplayTxnAmounts | undefined> => {
  const currency = account.displayCurrency
  if (currency === UsdDisplayCurrency) return undefined

  let pending = displayRatios.get(currency)
  if (pending === undefined) {
    pending = getCurrentPriceAsDisplayPriceRatio({ currency }).then(
      (looked) => {
        if (looked instanceof Error) {
          recordExceptionInCurrentSpan({ error: looked, level: ErrorLevel.Warn })
        }
        return looked
      },
      (err) => {
        // a throw is not cached: the next wallet looks up again
        displayRatios.delete(currency)
        throw err
      },
    )
    displayRatios.set(currency, pending)
  }
  const ratio = await pending
  if (ratio instanceof Error) return undefined

  const converted = DisplayAmountsConverter(ratio).convert({
    btcPaymentAmount: amount.btc,
    usdPaymentAmount: amount.usd,
    btcProtocolAndBankFee: ZERO_SATS,
    usdProtocolAndBankFee: ZERO_CENTS,
  })
  return {
    displayAmount: toDisplayBaseAmount(converted.displayAmount),
    displayFee: toDisplayBaseAmount(converted.displayFee),
    displayCurrency: converted.displayCurrency,
    displayCurrencyFractionDigits: ratio.fractionDigits,
  }
}
