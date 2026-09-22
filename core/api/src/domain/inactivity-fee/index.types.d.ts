type ActivityKind =
  (typeof import("./index").ActivityKind)[keyof typeof import("./index").ActivityKind]

type BackfillActivitySource =
  (typeof import("./index").BackfillActivitySource)[keyof typeof import("./index").BackfillActivitySource]

type CalendarMonthsBeforeArgs = {
  date: Date
  months: number
}

type IsDormantAtArgs = {
  lastActivityAt: Date
  asOf: Date
}

type ResolveBackfillActivityArgs = {
  existing: Date | undefined
  createdAt: Date
  ledgerLast: Date | undefined
  ipsLast: Date | undefined
  ipsFloor: Date
}

type ResolvedBackfillActivity = {
  value: Date
  source: BackfillActivitySource
}

type InactivityFeeSkipReason =
  (typeof import("./index").InactivityFeeSkipReason)[keyof typeof import("./index").InactivityFeeSkipReason]

type InactivityFeeNoticeStatus =
  (typeof import("./index").InactivityFeeNoticeStatus)[keyof typeof import("./index").InactivityFeeNoticeStatus]

type InactivityFeeSupersededReason =
  (typeof import("./index").InactivityFeeSupersededReason)[keyof typeof import("./index").InactivityFeeSupersededReason]

type InactivityFeeNoticeSource =
  (typeof import("./index").InactivityFeeNoticeSource)[keyof typeof import("./index").InactivityFeeNoticeSource]

type InactivityFeeTemplateVersion =
  (typeof import("./index").InactivityFeeTemplateVersion)[keyof typeof import("./index").InactivityFeeTemplateVersion]

type InactivityFeeNoticeOutcome =
  (typeof import("./index").InactivityFeeNoticeOutcome)[keyof typeof import("./index").InactivityFeeNoticeOutcome]

type InactivityFeeRunKind =
  (typeof import("./index").InactivityFeeRunKind)[keyof typeof import("./index").InactivityFeeRunKind]

type InactivityFeeRunMode =
  (typeof import("./index").InactivityFeeRunMode)[keyof typeof import("./index").InactivityFeeRunMode]

type InactivityFeeImportVerdict =
  (typeof import("./index").InactivityFeeImportVerdict)[keyof typeof import("./index").InactivityFeeImportVerdict]

type InactivityFeeNoticeId = string & { readonly brand: unique symbol }

// one row per warning; at most one `active` row per account (partial unique index)
type InactivityFeeNotice = {
  readonly id: InactivityFeeNoticeId
  readonly accountId: AccountId
  issuedAt: Date
  templateVersion: InactivityFeeTemplateVersion
  bulletinIssued: boolean
  // "push requested" (the service accepted the event), never delivery; recorded, never read
  pushSent: boolean
  status: InactivityFeeNoticeStatus
  supersededAt?: Date
  supersededReason?: InactivityFeeSupersededReason
  source: InactivityFeeNoticeSource
  sourceHash?: string
  readonly createdAt: Date
  updatedAt: Date
}

type IsNoticeLiveArgs = {
  notice: InactivityFeeNotice
  account: Account
}

type InactivityFeeEligibilityContext = {
  activeNotice: InactivityFeeNotice | undefined
  // one entry per custodial wallet of the account
  balances: BalanceAmount<WalletCurrency>[]
  // undefined when wind-down is off, no region is armed, or the account is not in the cohort
  windDownStatus: WindDownStatus | undefined
  // attributed jurisdiction (phone + IP evidence); undefined when not evaluated or no evidence
  assignedCountry: string | undefined
}

type EvaluateAccountStaticChecksArgs = {
  account: Account
  asOf: Date
  config: InactivityFeeConfig
}

type EvaluateAccountEligibilityArgs = {
  account: Account
  asOf: Date
  ctx: InactivityFeeEligibilityContext
  config: InactivityFeeConfig
}

type AccountEligibility =
  | { outcome: "eligible" }
  | { outcome: "skip"; reason: InactivityFeeSkipReason }

type InactivityFeeRunCounts = {
  scanned: number
  // accounts with no activity clock at all (never backfilled): never scanned
  accountsWithoutClock: number
  byOutcome: Record<string, number>
  bySkipReason: Record<string, number>
}

// informational summary of one run; never provenance (the notice rows are)
type InactivityFeeRun = {
  runId: string
  kind: InactivityFeeRunKind
  asOf: Date
  mode: InactivityFeeRunMode
  // an on-demand `--live` for a date other than today is downgraded to dry
  forcedDry: boolean
  startedAt: Date
  finishedAt: Date
  configVersion: string
  skipListHash: string
  counts: InactivityFeeRunCounts
  error?: string
}

type InsertActiveNoticeArgs = {
  accountId: AccountId
  issuedAt: Date
  templateVersion: InactivityFeeTemplateVersion
  source: InactivityFeeNoticeSource
  sourceHash?: string
  bulletinIssued: boolean
  pushSent: boolean
}

type MarkBulletinIssuedArgs = {
  id: InactivityFeeNoticeId
  // the send time; re-stamped on an in-place resend so liveness and the copy's date agree
  issuedAt: Date
  pushSent: boolean
}

type SupersedeNoticeArgs = {
  id: InactivityFeeNoticeId
  reason: InactivityFeeSupersededReason
  supersededAt: Date
}

interface IInactivityFeeNoticesRepository {
  findActiveByAccountId(
    accountId: AccountId,
  ): Promise<InactivityFeeNotice | InactivityFeeNoticeNotFoundError | RepositoryError>
  insertActive(
    args: InsertActiveNoticeArgs,
  ): Promise<InactivityFeeNotice | RepositoryError>
  markBulletinIssued(
    args: MarkBulletinIssuedArgs,
  ): Promise<InactivityFeeNotice | InactivityFeeNoticeNotFoundError | RepositoryError>
  supersede(
    args: SupersedeNoticeArgs,
  ): Promise<InactivityFeeNotice | InactivityFeeNoticeNotFoundError | RepositoryError>
}

interface IInactivityFeeRunsRepository {
  persistRun(run: InactivityFeeRun): Promise<InactivityFeeRun | RepositoryError>
}

type InactivityFeeNoticeNotFoundError =
  import("./errors").InactivityFeeNoticeNotFoundError

// one line per scanned account, the unit the CSV writer and the counts are built from
type InactivityFeeNoticeOutcomeRecord = {
  accountId: AccountId
  outcome: InactivityFeeNoticeOutcome
  // skip reason, or the error name for send_failed / error
  reason?: string
  noticeId?: InactivityFeeNoticeId
}

type RunNoticeJobArgs = {
  asOf: Date
  dryRun: boolean
  runId: string
  // label only: the caller downgraded a live request to dry (on-demand, asOf not today)
  forcedDry?: boolean
  onOutcome?: (record: InactivityFeeNoticeOutcomeRecord) => Promise<void> | void
}
