jest.mock("@/app", () => ({
  Authentication: {
    verifyTotpCode: jest.fn(),
    checkTotpRemovalAllowed: jest.fn(),
    removeTotp: jest.fn(),
  },
}))

const mockGetIdentity = jest.fn()

jest.mock("@/services/kratos", () => ({
  IdentityRepository: () => ({ getIdentity: mockGetIdentity }),
  checkedToTotpCode: jest.requireActual("@/services/kratos").checkedToTotpCode,
}))

import { GraphQLResolveInfo } from "graphql"

import { Authentication } from "@/app"
import { TotpRemovalBalanceTooHighError } from "@/domain/authentication/errors"
import { TotpCodeInvalidError } from "@/domain/kratos/errors"
import { TotpVerifyAttemptPerUserRateLimiterExceededError } from "@/domain/rate-limit/errors"
import UserTotpDeleteMutation from "@/graphql/public/root/mutation/user-totp-delete"
import {
  TOTP_STEP_UP_MUTATIONS,
  totpStepUpMiddleware,
} from "@/servers/middlewares/totp-step-up"

const mockVerify = Authentication.verifyTotpCode as jest.MockedFunction<
  typeof Authentication.verifyTotpCode
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
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetIdentity.mockResolvedValue({ id: userId, totpEnabled: true })
  })

  it("guards exactly the listed mutations", () => {
    expect(Object.keys(totpStepUpMiddleware.Mutation).sort()).toEqual(
      [
        "userEmailDelete",
        "userEmailRegistrationInitiate",
        "userPhoneDelete",
        "userPhoneRegistrationValidate",
        "userTotpDelete",
      ].sort(),
    )
  })

  describe.each(TOTP_STEP_UP_MUTATIONS)("%s", (field) => {
    it("runs unchanged when the identity has no TOTP", async () => {
      mockGetIdentity.mockResolvedValue({ id: userId, totpEnabled: false })
      const args = { input: {} }

      expect(await run(field, args)).toBe(RESOLVED)
      expect(resolve).toHaveBeenCalledWith(undefined, args, context, {})
      expect(mockVerify).not.toHaveBeenCalled()
    })

    it("refuses with TOTP_CODE_REQUIRED when the code is missing", async () => {
      const result = await run(field, { input: {} })

      expect(codeOf(result)).toBe("TOTP_CODE_REQUIRED")
      expect(resolve).not.toHaveBeenCalled()
      expect(mockVerify).not.toHaveBeenCalled()
    })

    it("refuses with TOTP_CODE_REQUIRED when there is no input at all", async () => {
      const result = await run(field, {})

      expect(codeOf(result)).toBe("TOTP_CODE_REQUIRED")
      expect(resolve).not.toHaveBeenCalled()
    })

    it("refuses with TOTP_CODE_INVALID when Kratos rejects the code", async () => {
      mockVerify.mockResolvedValue(new TotpCodeInvalidError())

      const result = await run(field, { input: { totpCode: "000000" } })

      expect(codeOf(result)).toBe("TOTP_CODE_INVALID")
      expect(mockVerify).toHaveBeenCalledWith({
        identity: { id: userId, totpEnabled: true },
        totpCode: "000000",
      })
      expect(resolve).not.toHaveBeenCalled()
    })

    it("refuses a malformed code without calling Kratos", async () => {
      const result = await run(field, { input: { totpCode: "12345" } })

      expect(codeOf(result)).toBe("TOTP_CODE_INVALID")
      expect(mockVerify).not.toHaveBeenCalled()
      expect(resolve).not.toHaveBeenCalled()
    })

    it("refuses with TOO_MANY_REQUEST when the per-user limit is hit", async () => {
      mockVerify.mockResolvedValue(new TotpVerifyAttemptPerUserRateLimiterExceededError())

      const result = await run(field, { input: { totpCode: "123456" } })

      expect(codeOf(result)).toBe("TOO_MANY_REQUEST")
      expect(resolve).not.toHaveBeenCalled()
    })

    it("proceeds when the code is valid", async () => {
      mockVerify.mockResolvedValue(true)
      const args = { input: { totpCode: "123456" } }

      expect(await run(field, args)).toBe(RESOLVED)
      expect(resolve).toHaveBeenCalledWith(undefined, args, context, {})
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
