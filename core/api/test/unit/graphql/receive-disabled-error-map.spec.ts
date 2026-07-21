import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"

import { ReceiveDisabledError } from "@/domain/wind-down"

describe("mapAndParseErrorForGqlResponse", () => {
  it("maps ReceiveDisabledError to the RECEIVE_DISABLED code", () => {
    const mapped = mapAndParseErrorForGqlResponse(new ReceiveDisabledError())

    expect(mapped.code).toBe("RECEIVE_DISABLED")
    expect(mapped.message).toBe("This account can no longer receive payments.")
  })
})
