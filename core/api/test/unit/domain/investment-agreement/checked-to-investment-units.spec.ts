import {
  checkedToInvestmentUnits,
  InvalidInvestmentUnitsError,
} from "@/domain/investment-agreement"

const minUnits = 1 as InvestmentUnits
const maxUnits = 100_000 as InvestmentUnits

describe("checkedToInvestmentUnits", () => {
  it("accepts the minimum units", () => {
    expect(checkedToInvestmentUnits({ units: 1, minUnits, maxUnits })).toEqual(1)
  })

  it("accepts the maximum units", () => {
    expect(checkedToInvestmentUnits({ units: 100_000, minUnits, maxUnits })).toEqual(
      100_000,
    )
  })

  it("fails for units below the minimum", () => {
    expect(checkedToInvestmentUnits({ units: 0, minUnits, maxUnits })).toBeInstanceOf(
      InvalidInvestmentUnitsError,
    )
  })

  it("fails for units above the maximum", () => {
    expect(
      checkedToInvestmentUnits({ units: 100_001, minUnits, maxUnits }),
    ).toBeInstanceOf(InvalidInvestmentUnitsError)
  })

  it("fails for fractional units with the rejected value in the message", () => {
    const result = checkedToInvestmentUnits({ units: 1.5, minUnits, maxUnits })
    expect(result).toBeInstanceOf(InvalidInvestmentUnitsError)
    expect(result).toHaveProperty("message", "1.5")
  })

  it.each([
    ["undefined", undefined as unknown as number],
    ["null", null as unknown as number],
    ["NaN", NaN],
  ])("fails for %s units", (_, units) => {
    expect(checkedToInvestmentUnits({ units, minUnits, maxUnits })).toBeInstanceOf(
      InvalidInvestmentUnitsError,
    )
  })
})
