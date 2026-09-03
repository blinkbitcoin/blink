import { getCurrencyMajorExponent, majorToMinorUnit } from "@/domain/fiat"

describe("majorToMinorUnit", () => {
  it("should handle float correctly", () => {
    let amount = 68.85
    let fractionDigits = 2
    let result = majorToMinorUnit({ amount, fractionDigits })
    expect(result).toBe(6885)

    amount = 0.000638418984375
    result = majorToMinorUnit({ amount, fractionDigits })
    expect(result).toBe(0.0638418984375)

    amount = 68.85
    fractionDigits = 0
    result = majorToMinorUnit({ amount, fractionDigits })
    expect(result).toBe(68.85)

    amount = 0.000638418984375
    result = majorToMinorUnit({ amount, fractionDigits })
    expect(result).toBe(0.000638418984375)
  })

  it("should handle bigint correctly", () => {
    const amount = BigInt(10)
    let fractionDigits = 2
    let result = majorToMinorUnit({ amount, fractionDigits })
    expect(result).toBe(1000)

    fractionDigits = 0
    result = majorToMinorUnit({ amount, fractionDigits })
    expect(result).toBe(10)
  })

  it("uses price-service fraction digits instead of runtime ICU data", () => {
    expect(majorToMinorUnit({ amount: 2.78, fractionDigits: 2 })).toBe(278)
    expect(majorToMinorUnit({ amount: 1.23, fractionDigits: 0 })).toBe(1.23)
  })

  it("preserves exact decimal strings", () => {
    expect(majorToMinorUnit({ amount: "1039005.13", fractionDigits: 2 })).toBe(103900513)
  })
})

describe("getCurrencyMajorExponent", () => {
  it.each([
    ["USD", 2],
    ["JPY", 0],
    ["BHD", 3],
    ["CLF", 4],
  ])("returns the runtime ICU precision for %s", (currency, expected) => {
    expect(getCurrencyMajorExponent(currency as DisplayCurrency)).toBe(expected)
  })

  it("uses standard precision for non-standard currencies", () => {
    expect(getCurrencyMajorExponent("INVALID" as DisplayCurrency)).toBe(2)
  })
})
