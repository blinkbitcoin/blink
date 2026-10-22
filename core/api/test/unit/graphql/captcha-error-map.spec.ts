import {
  CaptchaServiceUnavailableError,
  CaptchaUserFailToPassError,
} from "@/domain/captcha/errors"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import { ErrorLevel } from "@/domain/shared"

describe("mapAndParseErrorForGqlResponse - captcha", () => {
  it("gives a provider outage its own retryable code", () => {
    const mapped = mapAndParseErrorForGqlResponse(new CaptchaServiceUnavailableError())

    // Not UNKNOWN_CLIENT_ERROR: a client that cannot tell an expected,
    // retryable provider outage from an unclassified failure cannot offer
    // "try again shortly", which is the whole point of failing closed here.
    expect(mapped.code).toBe("CAPTCHA_UNAVAILABLE")
    expect(mapped.message).toBe(
      "Captcha provider is unavailable. Please try again later.",
    )
  })

  it("keeps a genuine user failure distinguishable from an outage", () => {
    const mapped = mapAndParseErrorForGqlResponse(new CaptchaUserFailToPassError())

    expect(mapped.code).not.toBe("CAPTCHA_UNAVAILABLE")
    expect(mapped.message).toBe("Captcha validation failed.")
  })

  it("does not page on a provider outage", () => {
    // One Critical per request would fire once per login-screen load for the
    // duration of a geetest outage; the underlying transport error is already
    // recorded where it happens.
    expect(new CaptchaServiceUnavailableError().level).toBe(ErrorLevel.Warn)
  })
})
