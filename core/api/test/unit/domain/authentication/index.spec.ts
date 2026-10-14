import { getSupportedCountries, validOneTimeAuthCodeValue } from "@/domain/authentication"
import { PhoneCodeInvalidError } from "@/domain/phone-provider/errors"

describe("getSupportedCountries", () => {
  it("returns supported countries", () => {
    const countries = getSupportedCountries({
      allCountries: ["CA", "US", "SV"] as CountryCode[],
      unsupportedSmsCountries: ["CA", "SV"] as CountryCode[],
      unsupportedWhatsAppCountries: ["US", "SV"] as CountryCode[],
      unsupportedTelegramCountries: ["US", "CA"] as CountryCode[],
    })

    expect(countries).toEqual([
      {
        id: "CA",
        supportedAuthChannels: ["whatsapp"],
      },
      {
        id: "US",
        supportedAuthChannels: ["sms"],
      },
      {
        id: "SV",
        supportedAuthChannels: ["telegram"],
      },
    ])
  })
})

describe("validOneTimeAuthCodeValue", () => {
  it("accepts exactly six digits", () => {
    expect(validOneTimeAuthCodeValue("123456")).toBe("123456")
  })

  it("rejects a six-digit prefix with trailing characters", () => {
    // The previous regex was unanchored (/^[0-9]{6}/i), so anything that merely
    // *started* with six digits was accepted and passed downstream verbatim.
    expect(validOneTimeAuthCodeValue("123456abc")).toBeInstanceOf(PhoneCodeInvalidError)
    expect(validOneTimeAuthCodeValue("1234567")).toBeInstanceOf(PhoneCodeInvalidError)
    expect(validOneTimeAuthCodeValue("123456 ")).toBeInstanceOf(PhoneCodeInvalidError)
    expect(validOneTimeAuthCodeValue("123456\n")).toBeInstanceOf(PhoneCodeInvalidError)
  })

  it("rejects codes that are too short or non-numeric", () => {
    expect(validOneTimeAuthCodeValue("12345")).toBeInstanceOf(PhoneCodeInvalidError)
    expect(validOneTimeAuthCodeValue("")).toBeInstanceOf(PhoneCodeInvalidError)
    expect(validOneTimeAuthCodeValue("abcdef")).toBeInstanceOf(PhoneCodeInvalidError)
  })
})
