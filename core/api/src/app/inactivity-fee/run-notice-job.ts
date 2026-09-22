import { issueNotice } from "./issue-notice"
import { loadEligibilityContext } from "./load-eligibility-context"

import { getInactivityFeeConfig, getWindDownConfig } from "@/config"

import {
  dormancyCutoffAt,
  evaluateAccountEligibility,
  evaluateAccountStaticChecks,
  InactivityFeeNoticeNotFoundError,
  InactivityFeeNoticeOutcome,
  InactivityFeeNoticeSentButUnflaggedError,
  InactivityFeeNoticeSource,
  InactivityFeeRunAbortedError,
  InactivityFeeRunKind,
  InactivityFeeRunMode,
  InactivityFeeSupersededReason,
  InactivityFeeTemplateVersion,
  isNoticeLive,
  skipListHash,
} from "@/domain/inactivity-fee"
import { NotificationsError } from "@/domain/notifications"
import { ErrorLevel, parseErrorFromUnknown } from "@/domain/shared"

import {
  AccountsRepository,
  InactivityFeeNoticesRepository,
  InactivityFeeRunsRepository,
} from "@/services/mongoose"
import {
  addAttributesToCurrentSpan,
  asyncRunInSpan,
  recordExceptionInCurrentSpan,
} from "@/services/tracing"

// The monthly notice run: every account whose last activity is 12 calendar months before
// asOf gets one evaluation in its own child span. A per-account failure is that account's
// outcome and the scan continues; only a failure of the scan itself aborts the run — and the
// onOutcome sink (the CSV writer) is part of the scan, so its failure aborts too. Config is
// read once here and threaded through. Dry-run evaluates and reports, writes no notice row
// and sends nothing; the run summary is written either way.
export const runNoticeJob = async ({
  asOf,
  dryRun,
  runId,
  forcedDry = false,
  onOutcome,
}: RunNoticeJobArgs): Promise<InactivityFeeRun | ApplicationError> => {
  const config = getInactivityFeeConfig()
  const windDownConfig = getWindDownConfig()
  const startedAt = new Date()
  const mode = dryRun ? InactivityFeeRunMode.Dry : InactivityFeeRunMode.Live
  const cutoff = dormancyCutoffAt(asOf)
  const counts: InactivityFeeRunCounts = {
    scanned: 0,
    accountsWithoutClock: 0,
    byOutcome: {},
    bySkipReason: {},
  }

  addAttributesToCurrentSpan({
    "inactivityfee.run.id": runId,
    "inactivityfee.run.asOf": asOf.toISOString(),
    "inactivityfee.run.cutoff": cutoff.toISOString(),
    "inactivityfee.run.mode": mode,
    "inactivityfee.run.forcedDry": String(forcedDry),
  })

  const withoutClock = await AccountsRepository().countWithoutActivityClock()
  let error: Error | undefined
  if (withoutClock instanceof Error) {
    error = withoutClock
  } else {
    counts.accountsWithoutClock = withoutClock
    const scanned = await scanDormantAccounts({
      cutoff,
      counts,
      onOutcome,
      evaluate: (account) =>
        evaluateAccountInSpan({ account, asOf, dryRun, config, windDownConfig }),
    })
    if (scanned instanceof Error) error = scanned
  }

  const run: InactivityFeeRun = {
    runId,
    kind: InactivityFeeRunKind.Notice,
    asOf,
    mode,
    forcedDry,
    startedAt,
    finishedAt: new Date(),
    configVersion: config.configVersion,
    skipListHash: skipListHash({ skipAccountIds: config.skipAccountIds }),
    counts,
    ...(error !== undefined ? { error: `${error.name}: ${error.message}` } : {}),
  }

  addAttributesToCurrentSpan({
    // as strings: the span helper drops falsy values, and a zero count is a fact worth keeping
    "inactivityfee.run.scanned": String(counts.scanned),
    "inactivityfee.run.accountsWithoutClock": String(counts.accountsWithoutClock),
    ...prefixed("inactivityfee.run.outcome.", counts.byOutcome),
    ...prefixed("inactivityfee.run.skip.", counts.bySkipReason),
  })

  const persisted = await InactivityFeeRunsRepository().persistRun(run)
  if (persisted instanceof Error) {
    recordExceptionInCurrentSpan({ error: persisted, level: ErrorLevel.Critical })
  }
  if (error !== undefined) {
    return new InactivityFeeRunAbortedError(
      `${runId} aborted after ${counts.scanned} account(s): ${error.name}: ${error.message}`,
    )
  }
  if (persisted instanceof Error) return persisted
  return run
}

const prefixed = (prefix: string, values: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [prefix + key, String(value)]),
  )

const scanDormantAccounts = async ({
  cutoff,
  counts,
  onOutcome,
  evaluate,
}: {
  cutoff: Date
  counts: InactivityFeeRunCounts
  onOutcome: RunNoticeJobArgs["onOutcome"]
  evaluate: (account: Account) => Promise<InactivityFeeNoticeOutcomeRecord>
}): Promise<true | Error> => {
  try {
    for await (const account of AccountsRepository().listDormantAccounts({ cutoff })) {
      counts.scanned += 1
      const record = await evaluate(account)
      counts.byOutcome[record.outcome] = (counts.byOutcome[record.outcome] ?? 0) + 1
      if (record.outcome === InactivityFeeNoticeOutcome.Skipped && record.reason) {
        counts.bySkipReason[record.reason] = (counts.bySkipReason[record.reason] ?? 0) + 1
      }
      if (onOutcome) await onOutcome(record)
    }
    return true
  } catch (err) {
    return parseErrorFromUnknown(err)
  }
}

// one child span per account (span events are capped per span, a 130k-account run would
// drop them); the span itself failing is the account's outcome, not the run's
const evaluateAccountInSpan = async (args: {
  account: Account
  asOf: Date
  dryRun: boolean
  config: InactivityFeeConfig
  windDownConfig: WindDownConfig
}): Promise<InactivityFeeNoticeOutcomeRecord> => {
  try {
    return await asyncRunInSpan(
      "app.inactivityfee.evaluateAccount",
      { attributes: { "account.id": args.account.id } },
      async () => {
        let record: InactivityFeeNoticeOutcomeRecord
        try {
          record = await processAccount(args)
        } catch (err) {
          record = errorOutcome({
            account: args.account,
            error: parseErrorFromUnknown(err),
          })
        }
        addAttributesToCurrentSpan({
          "outcome": record.outcome,
          "reason": record.reason,
          "notice.id": record.noticeId,
        })
        return record
      },
    )
  } catch (err) {
    return errorOutcome({ account: args.account, error: parseErrorFromUnknown(err) })
  }
}

const errorOutcome = ({
  account,
  error,
  outcome = InactivityFeeNoticeOutcome.Error,
  noticeId,
}: {
  account: Account
  error: Error
  outcome?: InactivityFeeNoticeOutcome
  noticeId?: InactivityFeeNoticeId
}): InactivityFeeNoticeOutcomeRecord => {
  recordExceptionInCurrentSpan({
    error,
    level:
      outcome === InactivityFeeNoticeOutcome.SendFailed ||
      outcome === InactivityFeeNoticeOutcome.SentUnflagged
        ? ErrorLevel.Warn
        : undefined,
  })
  return { accountId: account.id, outcome, reason: error.name, noticeId }
}

// static checks → notice row → context checks → send, cheapest first so a rejected or
// already-noticed account costs no wallet or ledger reads. Row states: live ⇒ nothing to do;
// non-issued ⇒ the earlier send failed, re-send the same row; issued but not live ⇒ stale (the
// account acted after it and went dormant again), supersede it and start a fresh one; none ⇒
// fresh one.
const processAccount = async ({
  account,
  asOf,
  dryRun,
  config,
  windDownConfig,
}: {
  account: Account
  asOf: Date
  dryRun: boolean
  config: InactivityFeeConfig
  windDownConfig: WindDownConfig
}): Promise<InactivityFeeNoticeOutcomeRecord> => {
  const skipped = (
    reason: InactivityFeeSkipReason,
  ): InactivityFeeNoticeOutcomeRecord => ({
    accountId: account.id,
    outcome: InactivityFeeNoticeOutcome.Skipped,
    reason,
  })

  const staticVerdict = evaluateAccountStaticChecks({ account, asOf, config })
  if (staticVerdict.outcome === "skip") return skipped(staticVerdict.reason)

  const notices = InactivityFeeNoticesRepository()
  const found = await notices.findActiveByAccountId(account.id)
  if (found instanceof Error && !(found instanceof InactivityFeeNoticeNotFoundError)) {
    return errorOutcome({ account, error: found })
  }
  const existing = found instanceof Error ? undefined : found
  if (existing !== undefined && isNoticeLive({ notice: existing, account })) {
    return {
      accountId: account.id,
      outcome: InactivityFeeNoticeOutcome.AlreadyNoticed,
      noticeId: existing.id,
    }
  }

  const ctx = await loadEligibilityContext({
    account,
    activeNotice: existing,
    config,
    windDownConfig,
  })
  if (ctx instanceof Error) return errorOutcome({ account, error: ctx })

  const verdict = evaluateAccountEligibility({ account, asOf, ctx, config })
  if (verdict.outcome === "skip") return skipped(verdict.reason)

  if (dryRun) {
    return {
      accountId: account.id,
      outcome: InactivityFeeNoticeOutcome.WouldNotice,
      noticeId: existing?.id,
    }
  }

  // The account is the snapshot the cursor yielded, and the checks above take wallet, ledger
  // and cohort reads — a user who came back in that window would still be warned. Re-read as
  // late as possible, before anything is written or sent. What remains is the insert plus the
  // send, and a row written in that sliver is non-live anyway: issuedAt is the run's asOf,
  // which predates the activity. Serialising the rest would mean locking every login.
  const fresh = await AccountsRepository().findById(account.id)
  if (fresh instanceof Error) return errorOutcome({ account, error: fresh })
  const freshVerdict = evaluateAccountStaticChecks({ account: fresh, asOf, config })
  if (freshVerdict.outcome === "skip") return skipped(freshVerdict.reason)

  let notice = existing
  if (notice !== undefined && notice.bulletinIssued) {
    const superseded = await notices.supersede({
      id: notice.id,
      reason: InactivityFeeSupersededReason.Stale,
      supersededAt: asOf,
    })
    if (superseded instanceof Error) {
      return errorOutcome({ account, error: superseded, noticeId: notice.id })
    }
    notice = undefined
  }

  const resend = notice !== undefined
  if (notice === undefined) {
    const inserted = await notices.insertActive({
      accountId: account.id,
      issuedAt: asOf,
      templateVersion: InactivityFeeTemplateVersion.NoticeV1,
      source: InactivityFeeNoticeSource.NoticeJob,
      bulletinIssued: false,
      pushSent: false,
    })
    if (inserted instanceof Error) return errorOutcome({ account, error: inserted })
    notice = inserted
  }

  const issued = await issueNotice({ notice, account, issuedAt: asOf, config })
  if (issued instanceof Error) {
    return errorOutcome({
      account,
      error: issued,
      outcome:
        issued instanceof NotificationsError
          ? InactivityFeeNoticeOutcome.SendFailed
          : issued instanceof InactivityFeeNoticeSentButUnflaggedError
            ? InactivityFeeNoticeOutcome.SentUnflagged
            : InactivityFeeNoticeOutcome.Error,
      noticeId: notice.id,
    })
  }

  return {
    accountId: account.id,
    outcome: resend
      ? InactivityFeeNoticeOutcome.Resent
      : InactivityFeeNoticeOutcome.Noticed,
    noticeId: issued.id,
  }
}
