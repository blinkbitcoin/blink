import { randomUUID } from "crypto"

import { InvalidInactivityFeeExternalIdError } from "./errors"
import { formatIsoDate } from "./notice"
import { InactivityFeeExternalIdKind, InactivityFeeRefundRunKind } from "./primitives"

import { LedgerTransactionType } from "@/domain/ledger"
import { WalletCurrency } from "@/domain/shared"

const MONTH_KEY = "\\d{4}-(?:0[1-9]|1[0-2])"
const MonthKeyRegex = new RegExp(`^${MONTH_KEY}$`)
// the wallet id part has no underscore, so a refund key can never read as a debit key
const ExternalIdRegex: Record<InactivityFeeExternalIdKind, RegExp> = {
  [InactivityFeeExternalIdKind.Fee]: new RegExp(`^ifee_([a-z0-9-]+)_(${MONTH_KEY})$`),
  [InactivityFeeExternalIdKind.Refund]: new RegExp(
    `^ifee_refund_([a-z0-9-]+)_(${MONTH_KEY})$`,
  ),
}
const ExternalIdPrefix: Record<InactivityFeeExternalIdKind, string> = {
  [InactivityFeeExternalIdKind.Fee]: "ifee",
  [InactivityFeeExternalIdKind.Refund]: "ifee_refund",
}

// YYYY-MM in UTC: the month a debit belongs to
export const inactivityFeeMonthKey = ({ date }: { date: Date }): string =>
  date.toISOString().slice(0, 7)

export const checkedToInactivityFeeMonthKey = (
  month: string,
): InactivityFeeMonthKey | ValidationError =>
  MonthKeyRegex.test(month)
    ? (month as InactivityFeeMonthKey)
    : new InvalidInactivityFeeExternalIdError(`invalid month: ${month}`)

// the key must be of the given kind and, when a wallet is given, name that wallet
export const checkedToInactivityFeeExternalId = ({
  externalId,
  kind,
  walletId,
}: {
  externalId: string
  kind: InactivityFeeExternalIdKind
  walletId?: WalletId
}): LedgerExternalId | ValidationError => {
  const match = ExternalIdRegex[kind].exec(externalId)
  if (match === null) return new InvalidInactivityFeeExternalIdError(externalId)
  if (walletId !== undefined && match[1] !== walletId) {
    return new InvalidInactivityFeeExternalIdError(externalId)
  }
  return externalId as LedgerExternalId
}

const externalIdFor = ({
  kind,
  walletId,
  month,
}: {
  kind: InactivityFeeExternalIdKind
  walletId: WalletId
  month: string
}): LedgerExternalId | ValidationError =>
  checkedToInactivityFeeExternalId({
    externalId: `${ExternalIdPrefix[kind]}_${walletId}_${month}`,
    kind,
    walletId,
  })

export const inactivityFeeExternalId = ({
  walletId,
  month,
}: InactivityFeeExternalIdArgs): LedgerExternalId | ValidationError =>
  externalIdFor({ kind: InactivityFeeExternalIdKind.Fee, walletId, month })

export const inactivityFeeRefundExternalId = ({
  walletId,
  month,
}: InactivityFeeExternalIdArgs): LedgerExternalId | ValidationError =>
  externalIdFor({ kind: InactivityFeeExternalIdKind.Refund, walletId, month })

// works on either kind: a refund is keyed on its debit's month
export const monthKeyFromExternalId = ({
  externalId,
}: {
  externalId: string
}): InactivityFeeMonthKey | ValidationError => {
  const match =
    ExternalIdRegex[InactivityFeeExternalIdKind.Fee].exec(externalId) ??
    ExternalIdRegex[InactivityFeeExternalIdKind.Refund].exec(externalId)
  if (match === null) return new InvalidInactivityFeeExternalIdError(externalId)
  return checkedToInactivityFeeMonthKey(match[2])
}

// pairing is by key only: all months, no age limit. A row that cannot be paired safely is handed
// back: an unreadable, foreign or repeated key, and a refund that is not its debit's mirror
export const unpairedDebits = ({
  transactions,
}: {
  transactions: LedgerTransaction<WalletCurrency>[]
}): UnpairedInactivityFeeDebits => {
  const malformed: LedgerTransaction<WalletCurrency>[] = []

  // a refund row is a credit leg carrying its own wallet's refund key; every row under a key is kept
  const refunds = new Map<string, LedgerTransaction<WalletCurrency>[]>()
  for (const refund of transactions) {
    if (refund.type !== LedgerTransactionType.InactivityFeeRefund) continue
    const key = refundKeyOf(refund)
    if (key instanceof Error) {
      malformed.push(refund)
      continue
    }
    refunds.set(key, [...(refunds.get(key) ?? []), refund])
  }

  const unpaired: UnpairedInactivityFeeDebit[] = []
  const seen = new Set<string>()
  for (const debit of transactions) {
    if (debit.type !== LedgerTransactionType.InactivityFee) continue

    const { walletId } = debit
    // a fee row is a debit leg carrying its own wallet's debit key, once
    const feeKey =
      walletId === undefined || !(debit.debit > 0)
        ? new InvalidInactivityFeeExternalIdError(debit.externalId)
        : checkedToInactivityFeeExternalId({
            externalId: debit.externalId ?? "",
            kind: InactivityFeeExternalIdKind.Fee,
            walletId,
          })
    const month =
      feeKey instanceof Error ? feeKey : monthKeyFromExternalId({ externalId: feeKey })
    if (walletId === undefined || month instanceof Error || seen.has(String(feeKey))) {
      malformed.push(debit)
      continue
    }
    seen.add(String(feeKey))

    const refundExternalId = inactivityFeeRefundExternalId({ walletId, month })
    if (refundExternalId instanceof Error) {
      malformed.push(debit)
      continue
    }

    const paired = refunds.get(refundExternalId)
    if (paired === undefined) {
      unpaired.push({ debit, walletId, month, refundExternalId })
      continue
    }
    // one refund per key, for exactly the debit's amounts; anything else is for someone to look at
    if (paired.length !== 1 || !mirrors({ debit, refund: paired[0] }))
      malformed.push(debit)
  }

  return { unpaired, malformed }
}

const refundKeyOf = (
  refund: LedgerTransaction<WalletCurrency>,
): LedgerExternalId | ValidationError =>
  refund.walletId === undefined || !(refund.credit > 0)
    ? new InvalidInactivityFeeExternalIdError(refund.externalId)
    : checkedToInactivityFeeExternalId({
        externalId: refund.externalId ?? "",
        kind: InactivityFeeExternalIdKind.Refund,
        walletId: refund.walletId,
      })

const mirrors = ({
  debit,
  refund,
}: {
  debit: LedgerTransaction<WalletCurrency>
  refund: LedgerTransaction<WalletCurrency>
}): boolean =>
  refund.satsAmount === debit.satsAmount && refund.centsAmount === debit.centsAmount

const wholeNumber = (value: number | bigint): string =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)

const dollars = (cents: number | bigint): string =>
  `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(cents) / 100)}`

// server-composed history label; rate is USD per BTC
export const inactivityFeeMemo = ({
  currency,
  sats,
  cents,
  rate,
}: InactivityFeeMemoArgs): string =>
  currency === WalletCurrency.Btc
    ? `Inactivity fee — ${dollars(cents)} (${wholeNumber(sats)} sats at $${wholeNumber(rate)}/BTC)`
    : `Inactivity fee — ${dollars(cents)}`

export const inactivityFeeRefundMemo = ({
  currency,
  sats,
  cents,
}: InactivityFeeRefundMemoArgs): string =>
  currency === WalletCurrency.Btc
    ? `Inactivity fee refund — ${wholeNumber(sats)} sats`
    : `Inactivity fee refund — ${dollars(cents)}`

const refundRunId = ({
  kind,
  asOf,
}: {
  kind: InactivityFeeRefundRunKind
  asOf: Date
}): string => `${kind}-${formatIsoDate({ date: asOf })}-${randomUUID()}`

export const reactivationRunId = ({ asOf }: { asOf: Date }): string =>
  refundRunId({ kind: InactivityFeeRefundRunKind.Reactivation, asOf })

export const claimsRunId = ({ asOf }: { asOf: Date }): string =>
  refundRunId({ kind: InactivityFeeRefundRunKind.Claims, asOf })
