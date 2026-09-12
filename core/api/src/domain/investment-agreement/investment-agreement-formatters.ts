import { SATS_PER_BTC } from "@/domain/bitcoin"
import { CENTS_PER_USD } from "@/domain/fiat"

const USD_FRACTION_DIGITS = 2
const BTC_FRACTION_DIGITS = 8

const formatMinorUnits = ({
  amount,
  minorUnitsPerMajorUnit,
  fractionDigits,
}: {
  amount: number
  minorUnitsPerMajorUnit: number
  fractionDigits: number
}): string => {
  const majorUnits = Math.floor(amount / minorUnitsPerMajorUnit)
  const minorUnits = String(amount % minorUnitsPerMajorUnit).padStart(fractionDigits, "0")
  return `${majorUnits}.${minorUnits}`
}

export const formatUsdCents = (cents: UsdCents | UsdCentsPerBtc): string =>
  formatMinorUnits({
    amount: cents,
    minorUnitsPerMajorUnit: CENTS_PER_USD,
    fractionDigits: USD_FRACTION_DIGITS,
  })

export const formatSatsAsBtc = (sats: Satoshis): string =>
  formatMinorUnits({
    amount: sats,
    minorUnitsPerMajorUnit: SATS_PER_BTC,
    fractionDigits: BTC_FRACTION_DIGITS,
  })

export const formatRateTimestamp = ({
  date,
  timeZone,
}: {
  date: Date
  timeZone: InvestmentAgreementTimeZone
}): string => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  )
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}
