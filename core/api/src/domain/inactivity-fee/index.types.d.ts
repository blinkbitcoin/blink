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

type InactivityFeeChargeOutcome =
  (typeof import("./index").InactivityFeeChargeOutcome)[keyof typeof import("./index").InactivityFeeChargeOutcome]

type InactivityFeeRateSource =
  (typeof import("./index").InactivityFeeRateSource)[keyof typeof import("./index").InactivityFeeRateSource]

type InactivityFeeRunKind =
  (typeof import("./index").InactivityFeeRunKind)[keyof typeof import("./index").InactivityFeeRunKind]

type InactivityFeeRunMode =
  (typeof import("./index").InactivityFeeRunMode)[keyof typeof import("./index").InactivityFeeRunMode]

type InactivityFeeRefundReason =
  (typeof import("./index").InactivityFeeRefundReason)[keyof typeof import("./index").InactivityFeeRefundReason]

type InactivityFeeExternalIdKind =
  (typeof import("./index").InactivityFeeExternalIdKind)[keyof typeof import("./index").InactivityFeeExternalIdKind]

type InactivityFeeRefundRunKind =
  (typeof import("./index").InactivityFeeRefundRunKind)[keyof typeof import("./index").InactivityFeeRefundRunKind]

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

// the context the charge predicate needs beyond the account, notice and wallet
type InactivityFeeChargeContext = Pick<
  InactivityFeeEligibilityContext,
  "windDownStatus" | "assignedCountry"
>

type EvaluateChargeAccountChecksArgs = {
  account: Account
  notice: InactivityFeeNotice | undefined
  asOf: Date
  // flag_off is a live-run verdict: a dry run reports what the flag holds back
  dryRun: boolean
  config: InactivityFeeConfig
}

type EvaluateChargeArgs = EvaluateChargeAccountChecksArgs & {
  balance: BalanceAmount<WalletCurrency>
  // the month key already exists on this wallet
  keyExists: boolean
  ctx: InactivityFeeChargeContext
}

type ChargeVerdict =
  | { outcome: "charge" }
  | { outcome: "skip"; reason: InactivityFeeSkipReason }

type InactivityFeeAmount = {
  btc: BtcPaymentAmount
  usd: UsdPaymentAmount
}

type SizeInactivityFeeArgs = {
  balance: BalanceAmount<WalletCurrency>
  feeAmountUsdCents: UsdCents
  ratio: WalletPriceRatio
}

// one dealer mid-rate for the whole run
type InactivityFeePinnedRate = {
  ratio: WalletPriceRatio
  // USD per BTC
  rate: number
  rateSource: InactivityFeeRateSource
}

type InactivityFeeWalletBalance = {
  wallet: Wallet
  balance: BalanceAmount<WalletCurrency>
}

// what the context loader returns: the eligibility context plus the wallets it read
type InactivityFeeLoadedContext = InactivityFeeEligibilityContext & {
  wallets: InactivityFeeWalletBalance[]
}

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
  // fee runs only: the pinned rate (USD per BTC) and what was posted
  rate?: number
  rateSource?: string
  debited?: InactivityFeeRunDebited
  // the first and last charge key produced, in scan order: a sample, not an ordered range and
  // not a selector — `runId` on every row is what picks out a run's debits
  firstExternalIdSeen?: string
  lastExternalIdSeen?: string
}

// live posts only; sats from Bitcoin Balances, cents from Dollar Balances
type InactivityFeeRunDebited = {
  count: number
  sats: number
  cents: number
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
  // every active row issued at or before the cutoff; a driver error throws from the `for await`
  listActiveIssuedBefore(args: { cutoff: Date }): AsyncGenerator<InactivityFeeNotice>
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

// one line per wallet verdict, or one per account when an account-level check fails (no wallet)
type InactivityFeeChargeOutcomeRecord = {
  accountId: AccountId
  walletId?: WalletId
  currency?: WalletCurrency
  outcome: InactivityFeeChargeOutcome
  // skip reason, or the error name for error
  reason?: string
  // the wallet's own unit: sats or cents
  amount?: number
  externalId?: LedgerExternalId
  noticeId?: InactivityFeeNoticeId
}

type RunFeeJobArgs = {
  asOf: Date
  dryRun: boolean
  runId: string
  // label only: the caller downgraded a live request to dry (on-demand, asOf not today)
  forcedDry?: boolean
  onOutcome?: (record: InactivityFeeChargeOutcomeRecord) => Promise<void> | void
}

type InactivityFeeMonthKey = string & { readonly brand: unique symbol }

type InactivityFeeExternalIdArgs = {
  walletId: WalletId
  // YYYY-MM, UTC: the month of the debit, for a refund too
  month: string
}

type UnpairedInactivityFeeDebit = {
  debit: LedgerTransaction<WalletCurrency>
  walletId: WalletId
  month: InactivityFeeMonthKey
  refundExternalId: LedgerExternalId
}

type UnpairedInactivityFeeDebits = {
  unpaired: UnpairedInactivityFeeDebit[]
  // rows that cannot be paired safely: an unreadable, foreign or repeated key, a refund that is
  // not its debit's mirror; never refunded blindly
  malformed: LedgerTransaction<WalletCurrency>[]
}

type InactivityFeeMemoArgs = {
  currency: WalletCurrency
  sats: number | bigint
  cents: number | bigint
  // USD per BTC
  rate: number
}

type InactivityFeeRefundMemoArgs = {
  currency: WalletCurrency
  sats: number | bigint
  cents: number | bigint
}

type RefundInactivityFeesArgs = {
  accountId: AccountId
  reason: InactivityFeeRefundReason
  runId: string
  // handed over by a caller that already holds the account lock
  signal?: InactivityFeeAccountAbortSignal
}

type InactivityFeeRefundFailure = {
  walletId: WalletId
  // the refund key, when the failure is about one debit
  externalId?: LedgerExternalId
  error: Error
}

type InactivityFeeRefundResult = {
  refundedSats: Satoshis
  refundedCents: UsdCents
  failures: InactivityFeeRefundFailure[]
}

type ReactivateAccountResult = {
  refundedSats: Satoshis
  refundedCents: UsdCents
  noticeSuperseded: boolean
}
