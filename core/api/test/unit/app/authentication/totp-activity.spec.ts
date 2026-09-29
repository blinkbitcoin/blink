jest.mock("@/app/authentication/ratelimits", () => ({
  checkLoginAttemptPerLoginIdentifierLimits: jest.fn(async () => true),
}))

jest.mock("@/app/authentication/record-login-activity", () => ({
  recordLoginActivity: jest.fn(async () => undefined),
}))

jest.mock("@/services/mongoose", () => ({}))

jest.mock("@/services/kratos", () => ({
  kratosElevatingSessionWithTotp: jest.fn(),
}))

import { elevatingSessionWithTotp } from "@/app/authentication/totp"
import { recordLoginActivity } from "@/app/authentication/record-login-activity"
import { AuthenticationKratosError } from "@/domain/kratos/errors"
import { kratosElevatingSessionWithTotp } from "@/services/kratos"

const mockElevate = kratosElevatingSessionWithTotp as jest.MockedFunction<
  typeof kratosElevatingSessionWithTotp
>
const mockRecordLoginActivity = recordLoginActivity as jest.MockedFunction<
  typeof recordLoginActivity
>

const userId = "kratos-user-id" as UserId
const args = { authToken: "ory_st_token" as AuthToken, totpCode: "123456" as TotpCode }

describe("elevatingSessionWithTotp activity", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("records login activity once the second factor is accepted", async () => {
    mockElevate.mockResolvedValue(userId)

    const result = await elevatingSessionWithTotp(args)

    expect(result).toBe(true)
    expect(mockRecordLoginActivity).toHaveBeenCalledWith({ userId })
  })

  it("does not record activity when the code is rejected", async () => {
    mockElevate.mockResolvedValue(new AuthenticationKratosError("invalid code"))

    const result = await elevatingSessionWithTotp(args)

    expect(result).toBeInstanceOf(Error)
    expect(mockRecordLoginActivity).not.toHaveBeenCalled()
  })
})
