import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"

import {
  BtcMapError,
  BtcMapNotConfiguredError,
  BtcMapSubmitPlaceRejectedError,
  BtcMapUnauthorizedError,
  BtcMapUnavailableError,
  InvalidBtcMapCategoryError,
  InvalidBtcMapPlaceNameError,
  InvalidBtcMapSubmissionIdError,
  MalformedBtcMapResponseError,
  UnknownBtcMapServiceError,
} from "@/domain/btcmap/errors"
import { InsufficientAccountLevelError } from "@/domain/errors"
import { BtcMapPlaceSubmitPerAccountRateLimiterExceededError } from "@/domain/rate-limit/errors"

describe("mapAndParseErrorForGqlResponse - btcmap errors", () => {
  it("maps every error the feature can emit to a client-facing code without throwing", () => {
    const cases: [Error, string][] = [
      [new BtcMapError(), "UNKNOWN_CLIENT_ERROR"],
      [new BtcMapNotConfiguredError(), "UNKNOWN_CLIENT_ERROR"],
      [new BtcMapSubmitPlaceRejectedError(), "UNKNOWN_CLIENT_ERROR"],
      [new BtcMapUnauthorizedError(), "UNKNOWN_CLIENT_ERROR"],
      [new BtcMapUnavailableError(), "UNKNOWN_CLIENT_ERROR"],
      [new MalformedBtcMapResponseError(), "UNKNOWN_CLIENT_ERROR"],
      [new UnknownBtcMapServiceError(), "UNKNOWN_CLIENT_ERROR"],
      [new InsufficientAccountLevelError(), "NOT_AUTHORIZED"],
      [new BtcMapPlaceSubmitPerAccountRateLimiterExceededError(), "TOO_MANY_REQUEST"],
      [new InvalidBtcMapCategoryError(), "INVALID_INPUT"],
      [new InvalidBtcMapPlaceNameError(), "INVALID_INPUT"],
      [new InvalidBtcMapSubmissionIdError(), "INVALID_INPUT"],
    ]

    for (const [error, expectedCode] of cases) {
      const mapped = mapAndParseErrorForGqlResponse(error)
      expect(mapped.code).toBe(expectedCode)
      expect(mapped.message).toBeTruthy()
    }
  })

  it("never forwards upstream error text to clients", () => {
    const upstreamDetail = "connect ECONNREFUSED 10.0.0.1:8000"
    const mapped = mapAndParseErrorForGqlResponse(
      new UnknownBtcMapServiceError(upstreamDetail),
    )

    expect(mapped.message).not.toContain(upstreamDetail)
    expect(mapped.message).not.toContain("10.0.0.1")
  })
})
