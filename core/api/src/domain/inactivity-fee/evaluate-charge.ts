import { feeChargeCutoff } from "./notice"
import { isDormantAt, isNoticeLive } from "./predicate"
import { InactivityFeeSkipReason } from "./primitives"

import { AccountLevel, AccountStatus } from "@/domain/accounts"
import { WalletCurrency } from "@/domain/shared"
import { WindDownStatus } from "@/domain/wind-down"

const noticeableStatuses: AccountStatus[] = [AccountStatus.Active, AccountStatus.Invited]

const skip = (
  reason: InactivityFeeSkipReason,
): { outcome: "skip"; reason: InactivityFeeSkipReason } => ({
  outcome: "skip",
  reason,
})

// The checks that need nothing but the account row and the config: run first so a rejected
// account costs no wallet, ledger or notice lookups. Only the first matching reason is reported.
export const evaluateAccountStaticChecks = ({
  account,
  asOf,
  config,
}: EvaluateAccountStaticChecksArgs): AccountEligibility => {
  if (!noticeableStatuses.includes(account.status)) {
    return skip(InactivityFeeSkipReason.RestrictedStatus)
  }
  if (config.skipAccountIds.includes(account.id)) {
    return skip(InactivityFeeSkipReason.SkipList)
  }
  if (
    account.lastActivityAt === undefined ||
    !isDormantAt({ lastActivityAt: account.lastActivityAt, asOf })
  ) {
    return skip(InactivityFeeSkipReason.Active)
  }
  if (
    account.level === AccountLevel.Zero &&
    asOf.getTime() < config.level0Deadline.getTime()
  ) {
    return skip(InactivityFeeSkipReason.Level0PreDeadline)
  }
  return { outcome: "eligible" }
}

// the checks that need the loaded context (wind-down, jurisdiction); shared by both predicates
const evaluateContextChecks = ({
  ctx,
  config,
}: {
  ctx: InactivityFeeChargeContext
  config: InactivityFeeConfig
}): AccountEligibility => {
  if (ctx.windDownStatus === WindDownStatus.ReceiveDisabled) {
    return skip(InactivityFeeSkipReason.ReceiveDisabledPreDeadline)
  }
  if (
    ctx.assignedCountry !== undefined &&
    config.notPermittedCountries.some((country) => country === ctx.assignedCountry)
  ) {
    return skip(InactivityFeeSkipReason.Jurisdiction)
  }
  return { outcome: "eligible" }
}

// Account-level eligibility for the notice job. Pure: every input is loaded by the caller.
// The static checks first, then the ones that need context.
export const evaluateAccountEligibility = ({
  account,
  asOf,
  ctx,
  config,
}: EvaluateAccountEligibilityArgs): AccountEligibility => {
  const staticVerdict = evaluateAccountStaticChecks({ account, asOf, config })
  if (staticVerdict.outcome === "skip") return staticVerdict

  if (!ctx.balances.some((balance) => balance.amount > 0n)) {
    return skip(InactivityFeeSkipReason.ZeroBalance)
  }
  return evaluateContextChecks({ ctx, config })
}

// The account half of the charge predicate: flag, effective date, account row, notice. Cheap
// enough to settle an account before any wallet, ledger or context read.
//
// flag_off is a live-run verdict — a dry run reports what the flag holds back. before_effective_from
// is not: the dry run is the CCO's would-charge package, and before the date the notice copy and
// the app advertise there is nothing that would be charged, so it applies to dry runs too.
export const evaluateChargeAccountChecks = ({
  account,
  notice,
  asOf,
  dryRun,
  config,
}: EvaluateChargeAccountChecksArgs): AccountEligibility => {
  if (!dryRun && !config.liveCharging) return skip(InactivityFeeSkipReason.FlagOff)
  // inclusive: the fee applies from that instant
  if (asOf.getTime() < config.effectiveFrom.getTime()) {
    return skip(InactivityFeeSkipReason.BeforeEffectiveFrom)
  }

  const staticVerdict = evaluateAccountStaticChecks({ account, asOf, config })
  if (staticVerdict.outcome === "skip") return staticVerdict

  if (notice === undefined || !isNoticeLive({ notice, account })) {
    return skip(InactivityFeeSkipReason.NoLiveNotice)
  }
  if (notice.issuedAt.getTime() > feeChargeCutoff({ asOf }).getTime()) {
    return skip(InactivityFeeSkipReason.NoticeTooYoung)
  }
  return { outcome: "eligible" }
}

// The one charge predicate: all ten checks for one wallet, in this order, from values the
// caller read under the account lock. Pure; the first failing check is the reason.
export const evaluateCharge = ({
  account,
  notice,
  balance,
  keyExists,
  asOf,
  dryRun,
  ctx,
  config,
}: EvaluateChargeArgs): ChargeVerdict => {
  const accountVerdict = evaluateChargeAccountChecks({
    account,
    notice,
    asOf,
    dryRun,
    config,
  })
  if (accountVerdict.outcome === "skip") return accountVerdict

  const contextVerdict = evaluateContextChecks({ ctx, config })
  if (contextVerdict.outcome === "skip") return contextVerdict

  if (balance.amount <= 0n) return skip(InactivityFeeSkipReason.ZeroBalance)
  if (keyExists) return skip(InactivityFeeSkipReason.AlreadyDebited)
  return { outcome: "charge" }
}

// min(fee, balance) in the wallet's own unit, the other leg at the pinned rate: a Bitcoin
// Balance pays floor(fee at the rate) sats, a Dollar Balance pays the fee in cents. Never
// above the balance, never negative.
export const sizeInactivityFee = ({
  balance,
  feeAmountUsdCents,
  ratio,
}: SizeInactivityFeeArgs): InactivityFeeAmount => {
  const fee: UsdPaymentAmount = {
    amount: BigInt(feeAmountUsdCents),
    currency: WalletCurrency.Usd,
  }
  const available = balance.amount > 0n ? balance.amount : 0n

  if (balance.currency === WalletCurrency.Btc) {
    const feeSats = ratio.convertFromUsdToFloor(fee)
    if (feeSats.amount <= available) return { btc: feeSats, usd: fee }
    const btc: BtcPaymentAmount = { amount: available, currency: WalletCurrency.Btc }
    return { btc, usd: ratio.convertFromBtc(btc) }
  }

  const usd: UsdPaymentAmount =
    fee.amount <= available ? fee : { amount: available, currency: WalletCurrency.Usd }
  return { btc: ratio.convertFromUsd(usd), usd }
}
