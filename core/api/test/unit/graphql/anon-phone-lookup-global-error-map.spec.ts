import { mapError } from "@/graphql/error-map"
import { TooManyRequestError } from "@/graphql/error"

import { AnonPhoneLookupGlobalRateLimiterExceededError } from "@/domain/rate-limit/errors"

describe("mapError - anonymous phone lookup global cap", () => {
  it("maps the global cap to a TooManyRequestError", () => {
    const mapped = mapError(new AnonPhoneLookupGlobalRateLimiterExceededError())

    expect(mapped).toBeInstanceOf(TooManyRequestError)
    expect(mapped.message).toBe("Too many requests, please try again later.")
    expect(mapped.extensions.code).toBe("TOO_MANY_REQUEST")
  })
})
