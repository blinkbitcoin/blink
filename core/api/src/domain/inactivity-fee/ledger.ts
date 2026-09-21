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

// pairing is by key only: all months, no age limit; an unreadable, foreign or repeated key is malformed
export const unpairedDebits = ({
  transactions,
}: {
  transactions: LedgerTransaction<WalletCurrency>[]
}): UnpairedInactivityFeeDebits => {
  const refundKeys = new Set(
    transactions
      .filter((tx) => tx.type === LedgerTransactionType.InactivityFeeRefund)
      .map((tx) => tx.externalId),
  )

  const unpaired: UnpairedInactivityFeeDebit[] = []
  const malformed: LedgerTransaction<WalletCurrency>[] = []
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

    if (refundKeys.has(refundExternalId)) continue
    unpaired.push({ debit, walletId, month, refundExternalId })
  }

  return { unpaired, malformed }
}

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
