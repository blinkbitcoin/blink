import {
  calculateInvestmentAgreementTerms,
  InvalidInvestmentAgreementBtcPriceError,
} from "@/domain/investment-agreement"
import { BigIntToNumberConversionError } from "@/domain/shared"

const quotedAt = new Date("2026-09-09T10:00:00Z")

const termsFor = ({
  units,
  usdPerSat,
  currency = "USD",
}: {
  units: number
  usdPerSat: number
  currency?: string
}) =>
  calculateInvestmentAgreementTerms({
    units: units as InvestmentUnits,
    pricePerUnitUsdCents: 100 as UsdCents,
    preMoneyValuationUsdCents: 1_000_000_000 as UsdCents,
    btcPrice: {
      timestamp: quotedAt,
      currency: currency as DisplayCurrency,
      price: usdPerSat,
    },
  })

describe("calculateInvestmentAgreementTerms", () => {
  it("computes the contract terms from the units and the btc price", () => {
    expect(termsFor({ units: 1000, usdPerSat: 0.000788505 })).toEqual({
      units: 1000,
      pricePerUnitUsdCents: 100,
      totalUsdCents: 100_000,
      preMoneyValuationUsdCents: 1_000_000_000,
      btcUsdRateCents: 7_885_050,
      settlementSats: 1_268_223,
      quotedAt,
    })
  })

  it("keeps an exact settlement without rounding", () => {
    expect(termsFor({ units: 1000, usdPerSat: 0.0001 })).toHaveProperty(
      "settlementSats",
      10_000_000,
    )
  })

  it("rounds the settlement up to the next sat when the division is not exact", () => {
    const flooredSats = 1_268_222
    expect(termsFor({ units: 1000, usdPerSat: 0.000788505 })).toHaveProperty(
      "settlementSats",
      flooredSats + 1,
    )
  })

  it.each([
    [0.0007885050049, 7_885_050],
    [0.00078850505, 7_885_051],
  ])("rounds a price of %d usd per sat to %d cents per btc", (usdPerSat, rateCents) => {
    expect(termsFor({ units: 1, usdPerSat })).toHaveProperty("btcUsdRateCents", rateCents)
  })

  it("derives the settlement from the rounded rate shown in the contract", () => {
    expect(termsFor({ units: 1, usdPerSat: 9.96e-9 })).toMatchObject({
      btcUsdRateCents: 100,
      settlementSats: 100_000_000,
    })
  })

  it("fails for a price not quoted in usd", () => {
    expect(
      termsFor({ units: 1000, usdPerSat: 0.000788505, currency: "EUR" }),
    ).toBeInstanceOf(InvalidInvestmentAgreementBtcPriceError)
  })

  it.each([
    ["a zero price", 0],
    ["a negative price", -0.0001],
    ["a price below half a cent per btc", 4e-11],
    ["a NaN price", NaN],
    ["an infinite price", Infinity],
  ])("fails for %s", (_, usdPerSat) => {
    expect(termsFor({ units: 1000, usdPerSat })).toBeInstanceOf(
      InvalidInvestmentAgreementBtcPriceError,
    )
  })

  it("fails when the settlement exceeds the safe integer range", () => {
    expect(termsFor({ units: 1_000_000, usdPerSat: 1e-10 })).toBeInstanceOf(
      BigIntToNumberConversionError,
    )
  })
})
