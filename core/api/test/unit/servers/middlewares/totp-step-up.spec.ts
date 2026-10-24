jest.mock("@/app", () => ({
  Authentication: {
    checkTotpStepUp: jest.fn(),
    checkTotpRemovalAllowed: jest.fn(),
    removeTotp: jest.fn(),
  },
}))

import { GraphQLResolveInfo } from "graphql"

import { Authentication } from "@/app"
import {
  TotpCodeRequiredError,
  TotpRemovalBalanceTooHighError,
} from "@/domain/authentication/errors"
import { TotpCodeInvalidError } from "@/domain/kratos/errors"
import { TotpVerifyAttemptPerUserRateLimiterExceededError } from "@/domain/rate-limit/errors"
import UserTotpDeleteMutation from "@/graphql/public/root/mutation/user-totp-delete"
import { totpStepUpMiddleware } from "@/servers/middlewares/totp-step-up"
import { TOTP_STEP_UP_MUTATIONS } from "@/servers/middlewares/totp-step-up-mutations"

const mockStepUp = Authentication.checkTotpStepUp as jest.MockedFunction<
  typeof Authentication.checkTotpStepUp
>
const mockRemovalAllowed = Authentication.checkTotpRemovalAllowed as jest.MockedFunction<
  typeof Authentication.checkTotpRemovalAllowed
>
const mockRemoveTotp = Authentication.removeTotp as jest.MockedFunction<
  typeof Authentication.removeTotp
>

const userId = "kratos-user-id" as UserId
const context = {
  user: { id: userId },
  domainAccount: { id: "account-id" },
} as unknown as GraphQLPublicContextAuth

const RESOLVED = { errors: [], resolved: true }
const resolve = jest.fn(async () => RESOLVED)

const run = (field: string, args: unknown) =>
  totpStepUpMiddleware.Mutation[field](
    resolve,
    undefined,
    args,
    context,
    {} as GraphQLResolveInfo,
  ) as Promise<{ errors: { code?: string }[] }>

const codeOf = (result: { errors: { code?: string }[] }) => result.errors[0]?.code

describe("totpStepUpMiddleware", () => {
  beforeEach(() => jest.clearAllMocks())

  it("guards exactly the listed mutations", () => {
    expect(Object.keys(totpStepUpMiddleware.Mutation).sort()).toEqual(
      [
        "userEmailRegistrationInitiate",
        "userPhoneRegistrationValidate",
        "userTotpDelete",
      ].sort(),
    )
  })

  describe.each(TOTP_STEP_UP_MUTATIONS)("%s", (field) => {
    it("passes the input code to the step-up check and resolves when it passes", async () => {
      mockStepUp.mockResolvedValue(true)
      const args = { input: { totpCode: "123456" } }

      expect(await run(field, args)).toBe(RESOLVED)
      expect(mockStepUp).toHaveBeenCalledWith({ userId, totpCode: "123456" })
      expect(resolve).toHaveBeenCalledWith(undefined, args, context, {})
    })

    it("passes an undefined code when there is no input", async () => {
      mockStepUp.mockResolvedValue(true)

      expect(await run(field, {})).toBe(RESOLVED)
      expect(mockStepUp).toHaveBeenCalledWith({ userId, totpCode: undefined })
    })

    it.each([
      ["TOTP_CODE_REQUIRED", new TotpCodeRequiredError()],
      ["TOTP_CODE_INVALID", new TotpCodeInvalidError()],
      ["TOO_MANY_REQUEST", new TotpVerifyAttemptPerUserRateLimiterExceededError()],
    ])("refuses with %s without resolving", async (code, error) => {
      mockStepUp.mockResolvedValue(error)

      const result = await run(field, { input: { totpCode: "123456" } })

      expect(codeOf(result)).toBe(code)
      expect(resolve).not.toHaveBeenCalled()
    })
  })
})

describe("userTotpDelete resolver", () => {
  const resolveDelete = UserTotpDeleteMutation.resolve as (
    ...args: unknown[]
  ) => Promise<{ errors: { code?: string }[]; me?: unknown }>

  beforeEach(() => jest.clearAllMocks())

  it("refuses removal at or above the tier-3 balance", async () => {
    mockRemovalAllowed.mockResolvedValue(new TotpRemovalBalanceTooHighError())

    const result = await resolveDelete(null, {}, context, {})

    expect(codeOf(result)).toBe("TOTP_REMOVAL_BALANCE_TOO_HIGH")
    expect(mockRemovalAllowed).toHaveBeenCalledWith({ accountId: "account-id" })
    expect(mockRemoveTotp).not.toHaveBeenCalled()
  })

  it("removes TOTP below the tier-3 balance", async () => {
    const me = { id: userId } as User
    mockRemovalAllowed.mockResolvedValue(true)
    mockRemoveTotp.mockResolvedValue(me)

    const result = await resolveDelete(null, {}, context, {})

    expect(result).toEqual({ errors: [], me })
    expect(mockRemoveTotp).toHaveBeenCalledWith({ userId })
  })
})
