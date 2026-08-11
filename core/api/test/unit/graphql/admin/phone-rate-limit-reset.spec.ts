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
}))

jest.mock("@/graphql/error-map", () => ({
  mapAndParseErrorForGqlResponse: jest.fn(() => ({ message: "Reset failed" })),
}))

describe("PhoneRateLimitResetMutation", () => {
  const phone = "+14155550123" as PhoneNumber
  const privilegedClientId = "support-client" as PrivilegedClientId
  const resolve = PhoneRateLimitResetMutation.resolve

  if (!resolve) throw new Error("PhoneRateLimitResetMutation resolver is missing")

  const context = { privilegedClientId } as GraphQLAdminContext

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("passes the phone and the privileged client to the app layer", async () => {
    jest.mocked(Admin.resetPhoneRateLimit).mockResolvedValue(true)

    const result = await resolve(
      null,
      { input: { phone } },
      context,
      {} as GraphQLResolveInfo,
    )

    expect(Admin.resetPhoneRateLimit).toHaveBeenCalledWith({
      phone,
      resetByPrivilegedClientId: privilegedClientId,
    })
    expect(result).toEqual({ errors: [], success: true })
  })

  it("maps application errors through the shared error map", async () => {
    jest
      .mocked(Admin.resetPhoneRateLimit)
      .mockResolvedValue(new Error("Reset failed") as ApplicationError)

    const result = await resolve(
      null,
      { input: { phone } },
      context,
      {} as GraphQLResolveInfo,
    )

    expect(result).toEqual({ errors: [{ message: "Reset failed" }], success: false })
  })

  it("rejects an invalid phone without calling the app layer", async () => {
    const inputError = new Error("Invalid value for Phone") as InputValidationError

    const result = await resolve(
      null,
      { input: { phone: inputError } },
      context,
      {} as GraphQLResolveInfo,
    )

    expect(Admin.resetPhoneRateLimit).not.toHaveBeenCalled()
    expect(result).toEqual({
      errors: [{ message: "Invalid value for Phone" }],
      success: false,
    })
  })
})
