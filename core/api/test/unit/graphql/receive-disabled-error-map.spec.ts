import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"

import { ReceiveDisabledError } from "@/domain/wind-down"

describe("mapAndParseErrorForGqlResponse", () => {
  it("maps ReceiveDisabledError to the RECEIVE_DISABLED code with legacy-client-actionable copy", () => {
    const mapped = mapAndParseErrorForGqlResponse(new ReceiveDisabledError())

    expect(mapped.code).toBe("RECEIVE_DISABLED")
    // legacy apps render the message, not the code: it must name the required action
    expect(mapped.message).toContain("update the Blink app")
    expect(mapped.message).toBe(
      "This account can no longer receive payments. If this is your account, please update the Blink app to migrate your funds.",
    )
  })
})
