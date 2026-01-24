jest.mock("@/config", () => ({
  PRELUDE_API_KEY: "test_prelude_key",
}))

jest.mock("@/services/tracing", () => ({
  wrapAsyncFunctionsToRunInSpan: jest.fn(({ fns }) => fns),
}))

import { KnownPreludeErrorMessages } from "@/services/phone-provider/prelude-service"

describe("KnownPreludeErrorMessages", () => {
  describe("InvalidPhoneNumber", () => {
    const pattern = KnownPreludeErrorMessages.InvalidPhoneNumber

    it("matches 'invalid phone number'", () => {
      expect(pattern.test("invalid phone number")).toBe(true)
    })

    it("matches 'Invalid Phone Number' (case insensitive)", () => {
      expect(pattern.test("Invalid Phone Number")).toBe(true)
    })

    it("matches 'invalid target'", () => {
      expect(pattern.test("invalid target")).toBe(true)
    })

    it("matches 'does not belong to a valid, assigned number range'", () => {
      const errorMessage =
        "The provided phone number does not belong to a valid, assigned number range."
      expect(pattern.test(errorMessage)).toBe(true)
    })

    it("matches 'does not belong to a valid assigned number range' (without comma)", () => {
      const errorMessage =
        "The provided phone number does not belong to a valid assigned number range."
      expect(pattern.test(errorMessage)).toBe(true)
    })
  })

  describe("RestrictedRegion", () => {
    const pattern = KnownPreludeErrorMessages.RestrictedRegion

    it("matches 'region not supported'", () => {
      expect(pattern.test("region not supported")).toBe(true)
    })

    it("matches 'country blocked'", () => {
      expect(pattern.test("country blocked")).toBe(true)
    })
  })

  describe("UnsubscribedRecipient", () => {
    const pattern = KnownPreludeErrorMessages.UnsubscribedRecipient

    it("matches 'unsubscribed'", () => {
      expect(pattern.test("unsubscribed")).toBe(true)
    })

    it("matches 'opted out'", () => {
      expect(pattern.test("opted out")).toBe(true)
    })
  })

  describe("BadConnection", () => {
    const pattern = KnownPreludeErrorMessages.BadConnection

    it("matches 'timeout'", () => {
      expect(pattern.test("timeout")).toBe(true)
    })

    it("matches 'connection error'", () => {
      expect(pattern.test("connection error")).toBe(true)
    })

    it("matches 'network error'", () => {
      expect(pattern.test("network error")).toBe(true)
    })
  })

  describe("RateLimitsExceeded", () => {
    const pattern = KnownPreludeErrorMessages.RateLimitsExceeded

    it("matches 'rate limit'", () => {
      expect(pattern.test("rate limit")).toBe(true)
    })

    it("matches 'too many requests'", () => {
      expect(pattern.test("too many requests")).toBe(true)
    })

    it("matches 'quota exceeded'", () => {
      expect(pattern.test("quota exceeded")).toBe(true)
    })
  })

  describe("ServiceUnavailable", () => {
    const pattern = KnownPreludeErrorMessages.ServiceUnavailable

    it("matches 'service unavailable'", () => {
      expect(pattern.test("service unavailable")).toBe(true)
    })

    it("matches 'server error'", () => {
      expect(pattern.test("server error")).toBe(true)
    })

    it("matches 'internal error'", () => {
      expect(pattern.test("internal error")).toBe(true)
    })
  })
})
