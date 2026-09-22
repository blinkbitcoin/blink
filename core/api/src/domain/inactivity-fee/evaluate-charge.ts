import { isDormantAt } from "./predicate"
import { InactivityFeeSkipReason } from "./primitives"

import { AccountLevel, AccountStatus } from "@/domain/accounts"
import { WindDownStatus } from "@/domain/wind-down"

const noticeableStatuses: AccountStatus[] = [AccountStatus.Active, AccountStatus.Invited]

const skip = (reason: InactivityFeeSkipReason): AccountEligibility => ({
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

// Account-level eligibility, shared by the notice job and (later) the fee job. Pure: every
// input is loaded by the caller. The static checks first, then the ones that need context.
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
