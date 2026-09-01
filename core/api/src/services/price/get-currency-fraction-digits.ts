import { listCachedPriceCurrencies } from "./list-currencies"

import { InvalidPriceCurrencyError } from "@/domain/price"

// Price service schema limit; all ISO 4217 currencies fit within this range.
const MAX_FRACTION_DIGITS = 4

const checkedFractionDigits = (
  fractionDigits: number,
): number | InvalidPriceCurrencyError => {
  if (
    !Number.isInteger(fractionDigits) ||
    fractionDigits < 0 ||
    fractionDigits > MAX_FRACTION_DIGITS
  ) {
    return new InvalidPriceCurrencyError()
  }

  return fractionDigits
}

export const getCurrencyFractionDigits = async ({
  currency,
  fractionDigits,
}: {
  currency: DisplayCurrency
  fractionDigits?: number
}): Promise<number | PriceServiceError | InvalidPriceCurrencyError> => {
  if (fractionDigits !== undefined) return checkedFractionDigits(fractionDigits)

  const currencies = await listCachedPriceCurrencies()
  if (currencies instanceof Error) return currencies

  const priceCurrency = currencies.find(
    ({ code }) => code.toUpperCase() === currency.toUpperCase(),
  )
  if (!priceCurrency) return new InvalidPriceCurrencyError()

  return checkedFractionDigits(priceCurrency.fractionDigits)
}
