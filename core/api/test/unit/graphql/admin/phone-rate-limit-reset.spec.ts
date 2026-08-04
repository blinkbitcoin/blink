import { createHmac } from "crypto"

import { GraphQLResolveInfo } from "graphql"

import { Admin } from "@/app"
import PhoneRateLimitResetMutation from "@/graphql/admin/root/mutation/phone-rate-limit-reset"

jest.mock("@/app", () => ({
  Admin: {
    resetPhoneRateLimit: jest.fn(),
  },
}))

jest.mock("@/config", () => ({
  getOnChainWalletConfig: () => ({ dustThreshold: 0 }),
  KRATOS_MASTER_USER_PASSWORD: "audit-key",
}))

jest.mock("@/graphql/error-map", () => ({
  mapAndParseErrorForGqlResponse: jest.fn(() => ({ message: "Reset failed" })),
}))

describe("PhoneRateLimitResetMutation", () => {
  const phone = "+14155550123" as PhoneNumber
  const privilegedClientId = "support@example.com" as PrivilegedClientId
  const loggerInfo = jest.fn()
  const resolve = PhoneRateLimitResetMutation.resolve

  if (!resolve) throw new Error("PhoneRateLimitResetMutation resolver is missing")

  const context = {
    logger: { info: loggerInfo } as unknown as Logger,
    privilegedClientId,
  } as GraphQLAdminContext

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("logs the privileged client and a keyed phone hash", async () => {
    jest.mocked(Admin.resetPhoneRateLimit).mockResolvedValue(true)

    await resolve(null, { input: { phone } }, context, {} as GraphQLResolveInfo)

    const phoneHash = createHmac("sha256", "audit-key")
      .update(`phone-rate-limit-reset:${phone}`)
      .digest("hex")

    expect(loggerInfo).toHaveBeenCalledWith(
      { privilegedClientId, phoneHash, success: true },
      "Phone auth rate limit reset",
    )
    expect(JSON.stringify(loggerInfo.mock.calls)).not.toContain(phone)
  })

  it("records failed reset attempts", async () => {
    jest.mocked(Admin.resetPhoneRateLimit).mockResolvedValue(new Error("Reset failed"))

    await resolve(null, { input: { phone } }, context, {} as GraphQLResolveInfo)

    expect(loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ privilegedClientId, success: false }),
      "Phone auth rate limit reset",
    )
  })
})
