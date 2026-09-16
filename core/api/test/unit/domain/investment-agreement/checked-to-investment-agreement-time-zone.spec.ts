import {
  checkedToInvestmentAgreementTimeZone,
  InvalidInvestmentAgreementTimeZoneError,
} from "@/domain/investment-agreement"

describe("checkedToInvestmentAgreementTimeZone", () => {
  it("accepts an IANA time zone", () => {
    expect(checkedToInvestmentAgreementTimeZone("America/Tegucigalpa")).toEqual(
      "America/Tegucigalpa",
    )
  })

  it("normalizes the time zone casing", () => {
    expect(checkedToInvestmentAgreementTimeZone("america/tegucigalpa")).toEqual(
      "America/Tegucigalpa",
    )
  })

  it.each([
    ["an unknown time zone", "Mars/Olympus_Mons"],
    ["an empty value", ""],
    ["an undefined value", undefined as unknown as string],
  ])("fails for %s", (_, timeZone) => {
    expect(checkedToInvestmentAgreementTimeZone(timeZone)).toBeInstanceOf(
      InvalidInvestmentAgreementTimeZoneError,
    )
  })
})
