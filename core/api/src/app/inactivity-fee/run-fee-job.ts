import { chargeWallet } from "./charge-wallet"
import { loadChargeAccount } from "./load-charge-context"
import { loadEligibilityContext } from "./load-eligibility-context"
import { pinRate } from "./pin-rate"

import { getInactivityFeeConfig, getWindDownConfig } from "@/config"

import {
  evaluateChargeAccountChecks,
  feeChargeCutoff,
  formatIsoDate,
  InactivityFeeChargeOutcome,
  inactivityFeeMonthKey,
  InactivityFeeRunAbortedError,
  InactivityFeeRunInProgressError,
  InactivityFeeRunKind,
  InactivityFeeRunMode,
  InactivityFeeSkipReason,
  skipListHash,
} from "@/domain/inactivity-fee"
import { ResourceAttemptsRedlockServiceError } from "@/domain/lock"
import { ErrorLevel, parseErrorFromUnknown, WalletCurrency } from "@/domain/shared"

import { LockService } from "@/services/lock"
import {
  InactivityFeeNoticesRepository,
  InactivityFeeRunsRepository,
} from "@/services/mongoose"
import {
  addAttributesToCurrentSpan,
  asyncRunInSpan,
  recordExceptionInCurrentSpan,
} from "@/services/tracing"

// The monthly fee run: one dealer mid-rate pinned at the start (any rate error aborts before
// any lock or debit), then every account with an active notice old enough to charge gets one
// evaluation in its own child span, under its account lock, from live reads. A per-wallet
// failure is that wallet's outcome and the scan continues; only a failure of the scan itself
// aborts the run — and the onOutcome sink (the CSV writer) is part of the scan. Config is read
// once here and threaded through. Dry-run runs the identical path and skips only the post;
// the run summary is written either way.
export const runFeeJob = async (
  args: RunFeeJobArgs,
): Promise<InactivityFeeRun | ApplicationError> => {
  // a dry run posts nothing, so it is never locked
  if (args.dryRun) return runFeeJobUnlocked(args)

  // Keeps a second live run for the same day from starting while this one holds the lock. It is
  // not what makes a debit safe: the callback never reads the abort signal, so a lock that
  // lapses mid-run stops nothing, and a dry run takes no run lock at all. The account lock plus
  // the month key are the guard against a double debit. Result kept aside for a late release.
  const finished: { run?: InactivityFeeRun | ApplicationError } = {}
  const locked = await LockService().lockInactivityFeeRun(
    { kind: InactivityFeeRunKind.Fee, asOf: args.asOf },
    async () => {
      finished.run = await runFeeJobUnlocked(args)
      return finished.run
    },
  )
  if (finished.run !== undefined) return finished.run
  if (locked instanceof ResourceAttemptsRedlockServiceError) {
    return new InactivityFeeRunInProgressError(
      `a live fee run for ${formatIsoDate({ date: args.asOf })} is already in progress`,
    )
  }
  return locked
}

type RunTally = {
  counts: InactivityFeeRunCounts
  debited: InactivityFeeRunDebited
  firstExternalIdSeen?: string
  lastExternalIdSeen?: string
}

const runFeeJobUnlocked = async ({
  asOf,
  dryRun,
  runId,
  forcedDry = false,
  onOutcome,
}: RunFeeJobArgs): Promise<InactivityFeeRun | ApplicationError> => {
  const config = getInactivityFeeConfig()
  const windDownConfig = getWindDownConfig()
  const startedAt = new Date()
  const mode = dryRun ? InactivityFeeRunMode.Dry : InactivityFeeRunMode.Live
  const month = inactivityFeeMonthKey({ date: asOf })
  const cutoff = feeChargeCutoff({ asOf })
  const tally: RunTally = {
    // the worklist is the notice index, so the activity-clock count is not a fact of this run
    counts: { scanned: 0, accountsWithoutClock: 0, byOutcome: {}, bySkipReason: {} },
    debited: { count: 0, sats: 0, cents: 0 },
  }

  addAttributesToCurrentSpan({
    "inactivityfee.run.id": runId,
    "inactivityfee.run.asOf": asOf.toISOString(),
    "inactivityfee.run.month": month,
    "inactivityfee.run.cutoff": cutoff.toISOString(),
    "inactivityfee.run.mode": mode,
    "inactivityfee.run.forcedDry": String(forcedDry),
  })

  let error: Error | undefined
  const pinned = await pinRate({ feeAmountUsdCents: config.feeAmountUsdCents })
  if (pinned instanceof Error) {
    error = pinned
  } else {
    addAttributesToCurrentSpan({
      "inactivityfee.run.rate": String(pinned.rate),
      "inactivityfee.run.rateSource": pinned.rateSource,
    })
    const displayRatios = new Map()
    const scanned = await scanNoticedAccounts({
      cutoff,
      tally,
      onOutcome,
      evaluate: (accountId) =>
        evaluateAccountInSpan({
          accountId,
          asOf,
          month,
          dryRun,
          pinned,
          config,
          windDownConfig,
          runId,
          displayRatios,
        }),
    })
    if (scanned instanceof Error) error = scanned
  }

  const run: InactivityFeeRun = {
    runId,
    kind: InactivityFeeRunKind.Fee,
    asOf,
    mode,
    forcedDry,
    startedAt,
    finishedAt: new Date(),
    configVersion: config.configVersion,
    skipListHash: skipListHash({ skipAccountIds: config.skipAccountIds }),
    counts: tally.counts,
    ...(pinned instanceof Error
      ? {}
      : { rate: pinned.rate, rateSource: pinned.rateSource }),
    debited: tally.debited,
    ...(tally.firstExternalIdSeen !== undefined
      ? {
          firstExternalIdSeen: tally.firstExternalIdSeen,
          lastExternalIdSeen: tally.lastExternalIdSeen,
        }
      : {}),
    ...(error !== undefined ? { error: `${error.name}: ${error.message}` } : {}),
  }

  addAttributesToCurrentSpan({
    // as strings: the span helper drops falsy values, and a zero count is a fact worth keeping
    "inactivityfee.run.scanned": String(tally.counts.scanned),
    "inactivityfee.run.debited.count": String(tally.debited.count),
    "inactivityfee.run.debited.sats": String(tally.debited.sats),
    "inactivityfee.run.debited.cents": String(tally.debited.cents),
    ...prefixed("inactivityfee.run.outcome.", tally.counts.byOutcome),
    ...prefixed("inactivityfee.run.skip.", tally.counts.bySkipReason),
  })

  const persisted = await InactivityFeeRunsRepository().persistRun(run)
  if (persisted instanceof Error) {
    recordExceptionInCurrentSpan({ error: persisted, level: ErrorLevel.Critical })
  }
  if (error !== undefined) {
    return new InactivityFeeRunAbortedError(
      `${runId} aborted after ${tally.counts.scanned} account(s): ${error.name}: ${error.message}`,
    )
  }
  if (persisted instanceof Error) return persisted
  return run
}

const prefixed = (prefix: string, values: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [prefix + key, String(value)]),
  )

// the worklist: accounts with an active row issued at or before the cutoff, a superset that
// decides nothing; every decision is re-made under the account lock
const scanNoticedAccounts = async ({
  cutoff,
  tally,
  onOutcome,
  evaluate,
}: {
  cutoff: Date
  tally: RunTally
  onOutcome: RunFeeJobArgs["onOutcome"]
  evaluate: (accountId: AccountId) => Promise<InactivityFeeChargeOutcomeRecord[]>
}): Promise<true | Error> => {
  try {
    const notices = InactivityFeeNoticesRepository()
    for await (const notice of notices.listActiveIssuedBefore({ cutoff })) {
      tally.counts.scanned += 1
      const records = await evaluate(notice.accountId)
      for (const record of records) {
        count(tally, record)
        if (onOutcome) await onOutcome(record)
      }
    }
    return true
  } catch (err) {
    return parseErrorFromUnknown(err)
  }
}

const count = (tally: RunTally, record: InactivityFeeChargeOutcomeRecord) => {
  const { counts, debited } = tally
  counts.byOutcome[record.outcome] = (counts.byOutcome[record.outcome] ?? 0) + 1
  if (record.outcome === InactivityFeeChargeOutcome.Skipped && record.reason) {
    counts.bySkipReason[record.reason] = (counts.bySkipReason[record.reason] ?? 0) + 1
  }
  if (record.outcome === InactivityFeeChargeOutcome.Charged) {
    debited.count += 1
    if (record.currency === WalletCurrency.Btc) debited.sats += record.amount ?? 0
    else debited.cents += record.amount ?? 0
  }
  // The first and last charge key this run produced, in scan order — a sample for eyeballing a
  // report, not an ordered range and not a selector: `runId`, stamped on every row, is what
  // picks out a run's debits.
  if (
    record.externalId !== undefined &&
    (record.outcome === InactivityFeeChargeOutcome.Charged ||
      record.outcome === InactivityFeeChargeOutcome.WouldCharge)
  ) {
    tally.firstExternalIdSeen ??= record.externalId
    tally.lastExternalIdSeen = record.externalId
  }
}

type AccountArgs = {
  accountId: AccountId
  asOf: Date
  month: string
  dryRun: boolean
  pinned: InactivityFeePinnedRate
  config: InactivityFeeConfig
  windDownConfig: WindDownConfig
  runId: string
  displayRatios: Map<
    DisplayCurrency,
    DisplayPriceRatio<"BTC", DisplayCurrency> | ApplicationError
  >
}

// one child span per account (span events are capped per span, a six-figure run would drop
// them); the span itself failing is the account's outcome, not the run's
const evaluateAccountInSpan = async (
  args: AccountArgs,
): Promise<InactivityFeeChargeOutcomeRecord[]> => {
  try {
    return await asyncRunInSpan(
      "app.inactivityfee.chargeAccount",
      { attributes: { "account.id": args.accountId } },
      async () => {
        let records: InactivityFeeChargeOutcomeRecord[]
        try {
          records = await processAccountLocked(args)
        } catch (err) {
          records = [
            errorOutcome({
              accountId: args.accountId,
              error: parseErrorFromUnknown(err),
            }),
          ]
        }
        addAttributesToCurrentSpan({
          "inactivityfee.account.outcome": unique(
            records.map((record) => record.outcome),
          ),
          "inactivityfee.account.reason": unique(records.map((record) => record.reason)),
          ...Object.fromEntries(
            records
              .filter((record) => record.walletId !== undefined)
              .flatMap((record) => {
                const prefix = `inactivityfee.wallet.${record.currency}`
                return [
                  [`${prefix}.id`, record.walletId],
                  [`${prefix}.outcome`, record.outcome],
                  [`${prefix}.reason`, record.reason],
                  [`${prefix}.amount`, record.amount],
                  [`${prefix}.externalId`, record.externalId],
                ]
              }),
          ),
        })
        return records
      },
    )
  } catch (err) {
    return [
      errorOutcome({ accountId: args.accountId, error: parseErrorFromUnknown(err) }),
    ]
  }
}

const unique = (values: (string | undefined)[]): string | undefined => {
  const seen = [...new Set(values.filter((value) => value !== undefined))]
  return seen.length > 0 ? seen.join(",") : undefined
}

const errorOutcome = ({
  accountId,
  error,
}: {
  accountId: AccountId
  error: Error
}): InactivityFeeChargeOutcomeRecord => {
  recordExceptionInCurrentSpan({ error })
  return { accountId, outcome: InactivityFeeChargeOutcome.Error, reason: error.name }
}

// The account lock, default policy: a reactivation handler holding it is waited for, and what
// it changed is what the reads below see. Records are collected into an array the caller holds,
// so neither a lock released late nor a throw part-way through can turn a debit that already
// posted into an account-level error and drop it from the report and the totals.
const processAccountLocked = async (
  args: AccountArgs,
): Promise<InactivityFeeChargeOutcomeRecord[]> => {
  const records: InactivityFeeChargeOutcomeRecord[] = []
  let ran = false
  const locked = await LockService().lockInactivityFeeAccount(
    args.accountId,
    async (signal) => {
      ran = true
      try {
        await processAccount({ ...args, signal, records })
      } catch (err) {
        records.push(
          errorOutcome({ accountId: args.accountId, error: parseErrorFromUnknown(err) }),
        )
      }
      return records
    },
  )
  if (ran) return records
  return [
    errorOutcome({
      accountId: args.accountId,
      error: locked instanceof Error ? locked : new Error("lock returned no result"),
    }),
  ]
}

// Under the lock, cheapest first: account row + notice → account-level checks (one record,
// no wallet, when they fail) → wallets, balances, wind-down, jurisdiction → one verdict per
// wallet, appended as it is produced. An account without wallets holds nothing.
const processAccount = async ({
  accountId,
  asOf,
  month,
  dryRun,
  pinned,
  config,
  windDownConfig,
  runId,
  displayRatios,
  signal,
  records,
}: AccountArgs & {
  signal: InactivityFeeAccountAbortSignal
  records: InactivityFeeChargeOutcomeRecord[]
}): Promise<void> => {
  const loaded = await loadChargeAccount({ accountId })
  if (loaded instanceof Error) {
    records.push(errorOutcome({ accountId, error: loaded }))
    return
  }
  const { account, notice } = loaded

  const skipped = (reason: InactivityFeeSkipReason) => {
    records.push({
      accountId,
      outcome: InactivityFeeChargeOutcome.Skipped,
      reason,
      noticeId: notice?.id,
    })
  }

  const accountVerdict = evaluateChargeAccountChecks({
    account,
    notice,
    asOf,
    dryRun,
    config,
  })
  if (accountVerdict.outcome === "skip") return skipped(accountVerdict.reason)

  const ctx = await loadEligibilityContext({
    account,
    activeNotice: notice,
    config,
    windDownConfig,
  })
  if (ctx instanceof Error) {
    records.push(errorOutcome({ accountId, error: ctx }))
    return
  }
  if (ctx.wallets.length === 0) return skipped(InactivityFeeSkipReason.ZeroBalance)

  for (const { wallet, balance } of ctx.wallets) {
    try {
      records.push(
        await chargeWallet({
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
        }),
      )
    } catch (err) {
      // this wallet only: an earlier wallet's debit is already in `records` and stays there
      const error = parseErrorFromUnknown(err)
      recordExceptionInCurrentSpan({ error })
      records.push({
        accountId,
        walletId: wallet.id,
        currency: wallet.currency,
        outcome: InactivityFeeChargeOutcome.Error,
        reason: error.name,
        noticeId: notice?.id,
      })
    }
  }
}
