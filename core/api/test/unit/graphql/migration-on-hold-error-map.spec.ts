import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"

import { MigrationOnHoldError } from "@/domain/migration-flow"

describe("mapAndParseErrorForGqlResponse", () => {
  it("maps MigrationOnHoldError to the MIGRATION_ON_HOLD code with an unspecific message", () => {
    const mapped = mapAndParseErrorForGqlResponse(new MigrationOnHoldError())

    expect(mapped.code).toBe("MIGRATION_ON_HOLD")
    // threshold, window, and measured volume must never reach clients
    expect(mapped.message).toBe("Migration is not available for this account right now.")
  })
})
