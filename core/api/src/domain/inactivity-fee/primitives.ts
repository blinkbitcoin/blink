// Closed enum of reasons an account is not noticed / not charged. The notice job uses the
// account-level subset; the fee job (later story) adds the wallet-level ones on top.
export const InactivityFeeSkipReason = {
  ZeroBalance: "zero_balance",
  Active: "active",
  NoLiveNotice: "no_live_notice",
  NoticeTooYoung: "notice_too_young",
  RestrictedStatus: "restricted_status",
  ReceiveDisabledPreDeadline: "receive_disabled_pre_deadline",
  Level0PreDeadline: "level0_pre_deadline",
  SkipList: "skip_list",
  Jurisdiction: "jurisdiction",
  AlreadyDebited: "already_debited",
  FlagOff: "flag_off",
  // asOf is before inactivityFee.effectiveFrom, the date the notice copy and the app advertise
  BeforeEffectiveFrom: "before_effective_from",
} as const

export const InactivityFeeNoticeStatus = {
  Active: "active",
  Superseded: "superseded",
} as const

export const InactivityFeeSupersededReason = {
  Reactivation: "reactivation",
  Stale: "stale",
  Correction: "correction",
} as const

export const InactivityFeeNoticeSource = {
  NoticeJob: "notice-job",
  Import20260903: "import-2026-09-03",
} as const

// bump NoticeV1 when the notice copy changes
export const InactivityFeeTemplateVersion = {
  NoticeV1: "notice-v1",
  TermsUpdate20260903: "terms-update-2026-09-03",
} as const

// per-account result of one notice run
export const InactivityFeeNoticeOutcome = {
  Noticed: "noticed",
  Resent: "resent",
  AlreadyNoticed: "already_noticed",
  WouldNotice: "would_notice",
  Skipped: "skipped",
  SendFailed: "send_failed",
  // bulletin sent, row not flagged: warned but not live, needs a look before the next run
  SentUnflagged: "sent_unflagged",
  Error: "error",
} as const

// per-wallet result of one fee run; an account-level skip is one record without a wallet
export const InactivityFeeChargeOutcome = {
  Charged: "charged",
  WouldCharge: "would_charge",
  Skipped: "skipped",
  Error: "error",
  // the account lock lapsed during a post and the account came back meanwhile: refunded in-run
  Refunded: "refunded",
} as const

// stamped on every debit as `rateSource`
export const InactivityFeeRateSource = {
  DealerMid: "dealer-mid",
} as const

export const InactivityFeeRunKind = {
  Notice: "notice",
  Fee: "fee",
} as const

// stored on every refund row as `refundReason`
export const InactivityFeeRefundReason = {
  Activity: "activity",
  Claims: "claims",
} as const

export const InactivityFeeExternalIdKind = {
  Fee: "fee",
  Refund: "refund",
} as const

// prefix of a refund caller's run id
export const InactivityFeeRefundRunKind = {
  Reactivation: "reactivation",
  Claims: "claims",
} as const

export const InactivityFeeRunMode = {
  Live: "live",
  Dry: "dry",
} as const

// per-candidate verdict of the 2026-09-03 import; only `ok` is inserted
export const InactivityFeeImportVerdict = {
  Ok: "ok",
  NoActivityClock: "no_activity_clock",
  ActivityAfterIssue: "activity_after_issue",
  AlreadyActive: "already_active",
} as const
