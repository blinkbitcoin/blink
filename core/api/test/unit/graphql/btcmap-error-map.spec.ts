import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"

import {
  BtcMapError,
  BtcMapNotConfiguredError,
  BtcMapServiceError,
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

// deliberately NOT registered in ApplicationErrors: simulates a future subtype
// reaching the GraphQL boundary before the name switch knows about it
class UnregisteredBtcMapServiceError extends BtcMapServiceError {}

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

  it("maps a subtype the name switch does not know about, without throwing or leaking", () => {
    // with string dispatch on error.name this fell through to assertUnreachable
    // and threw; the instanceof pre-check must map the whole family
    const upstreamDetail = "unregistered subtype internals 10.0.0.1"
    const error = new UnregisteredBtcMapServiceError(upstreamDetail)

    const mapped = mapAndParseErrorForGqlResponse(error as unknown as ApplicationError)

    expect(mapped.code).toBe("UNKNOWN_CLIENT_ERROR")
    expect(mapped.message).toBe(
      "Could not submit the place to the map, please try again later or contact support if it persists.",
    )
    expect(mapped.message).not.toContain(upstreamDetail)
  })
})
