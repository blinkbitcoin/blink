import { InvalidUrlError } from "@/domain/callback/errors"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"

describe("mapAndParseErrorForGqlResponse", () => {
  it("maps InvalidUrlError to a validation error", () => {
    const mapped = mapAndParseErrorForGqlResponse(
      new InvalidUrlError("Invalid callback endpoint URL"),
    )

    expect(mapped.code).toBe("INVALID_INPUT")
    expect(mapped.message).toBe("Invalid callback endpoint URL")
  })
})
