import {
  formatRateTimestamp,
  formatSatsAsBtc,
  formatUsdCents,
} from "@/domain/investment-agreement"

describe("formatUsdCents", () => {
  it.each([
    [100_000, "1000.00"],
    [7_885_050, "78850.50"],
    [123_456_789, "1234567.89"],
    [5, "0.05"],
    [0, "0.00"],
  ])("formats %d cents as %s", (cents, expected) => {
    expect(formatUsdCents(cents as UsdCents)).toEqual(expected)
  })
})

describe("formatSatsAsBtc", () => {
  it.each([
    [1_268_223, "0.01268223"],
    [100_000_000, "1.00000000"],
    [250_000_000_123, "2500.00000123"],
    [1, "0.00000001"],
    [0, "0.00000000"],
  ])("formats %d sats as %s", (sats, expected) => {
    expect(formatSatsAsBtc(sats as Satoshis)).toEqual(expected)
  })
})

describe("formatRateTimestamp", () => {
  const honduras = "America/Tegucigalpa" as InvestmentAgreementTimeZone

  it.each([
    ["2026-09-09T10:00:00Z", "2026-09-09 04:00"],
    ["2026-09-09T19:05:00Z", "2026-09-09 13:05"],
    ["2026-09-10T03:30:00Z", "2026-09-09 21:30"],
    ["2026-09-10T06:00:00Z", "2026-09-10 00:00"],
  ])("formats %s in Honduras time as %s", (isoDate, expected) => {
    expect(formatRateTimestamp({ date: new Date(isoDate), timeZone: honduras })).toEqual(
      expected,
    )
  })

  it("formats in the given time zone", () => {
    expect(
      formatRateTimestamp({
        date: new Date("2026-09-10T03:30:00Z"),
        timeZone: "UTC" as InvestmentAgreementTimeZone,
      }),
    ).toEqual("2026-09-10 03:30")
  })
})
