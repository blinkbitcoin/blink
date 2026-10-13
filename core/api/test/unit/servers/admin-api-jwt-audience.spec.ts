import { adminApiJwtAudienceSchema } from "@/config/admin-api-env"

describe("ADMIN_API_JWT_AUDIENCE", () => {
  it("defaults to galoy-admin when unset", () => {
    expect(adminApiJwtAudienceSchema.parse(undefined)).toBe("galoy-admin")
  })

  it("trims a configured audience", () => {
    expect(adminApiJwtAudienceSchema.parse(" galoy-admin ")).toBe("galoy-admin")
  })

  it.each(["", "   "])("rejects %j instead of disabling the check", (value) => {
    expect(adminApiJwtAudienceSchema.safeParse(value).success).toBe(false)
  })
})
