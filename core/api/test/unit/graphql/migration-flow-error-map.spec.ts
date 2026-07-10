import { MigrationNotEligibleError } from "@/domain/migration-flow"
import { UnknownClientError } from "@/graphql/error"
import { mapError } from "@/graphql/error-map"

describe("mapError", () => {
  it("maps MigrationNotEligibleError to MIGRATION_NOT_ELIGIBLE", () => {
    const mapped = mapError(new MigrationNotEligibleError())

    expect(mapped).not.toBeInstanceOf(UnknownClientError)
    expect(mapped.extensions.code).toBe("MIGRATION_NOT_ELIGIBLE")
    expect(mapped.forwardToClient).toBe(true)
    expect(mapped.message).toBe("This account is not eligible for migration")
  })
})
