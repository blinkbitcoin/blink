import { mapError } from "@/graphql/error-map"
import { TooManyRequestError } from "@/graphql/error"

import {
  CaptchaRequestCodeGlobalRateLimiterExceededError,
  CaptchaRequestCodePerCountryRateLimiterExceededError,
} from "@/domain/rate-limit/errors"

describe("mapError - captcha request code caps", () => {
  it.each([
    ["per-country", new CaptchaRequestCodePerCountryRateLimiterExceededError()],
    ["global", new CaptchaRequestCodeGlobalRateLimiterExceededError()],
  ])("maps the %s cap to a TooManyRequestError", (_label, error) => {
    const mapped = mapError(error)

    expect(mapped).toBeInstanceOf(TooManyRequestError)
    expect(mapped.message).toBe("Too many requests, please try again later.")
  })
})
