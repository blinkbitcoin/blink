import { AxiosError, AxiosHeaders } from "axios"

const mockCreateFlow = jest.fn()
const mockUpdateFlow = jest.fn()
const mockNativeLogout = jest.fn()
const mockToDomainSession = jest.fn()

jest.mock("@/services/kratos/private", () => ({
  kratosPublic: {
    createNativeLoginFlow: (...args: unknown[]) => mockCreateFlow(...args),
    updateLoginFlow: (...args: unknown[]) => mockUpdateFlow(...args),
    performNativeLogout: (...args: unknown[]) => mockNativeLogout(...args),
  },
  kratosAdmin: {},
  toDomainSession: (...args: unknown[]) => mockToDomainSession(...args),
}))

import { LikelyNoUserWithThisPhoneExistError } from "@/domain/authentication/errors"
import { AuthenticationKratosError, TotpCodeInvalidError } from "@/domain/kratos/errors"
import {
  kratosElevatingSessionWithTotp,
  kratosRevokeSessionToken,
  kratosVerifyTotpOnSession,
} from "@/services/kratos/totp"

const axiosError = (status: number) =>
  new AxiosError(
    `Request failed with status code ${status}`,
    undefined,
    undefined,
    undefined,
    {
      status,
      statusText: "",
      data: {},
      headers: {},
      config: { headers: new AxiosHeaders() },
    },
  )

const args = { authToken: "ory_st_token" as AuthToken, totpCode: "123456" as TotpCode }

describe("kratosVerifyTotpOnSession", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateFlow.mockResolvedValue({ data: { id: "flow-id" } })
  })

  it("runs an aal2 login flow with the code", async () => {
    mockUpdateFlow.mockResolvedValue({ data: {} })

    expect(await kratosVerifyTotpOnSession(args)).toBe(true)
    expect(mockCreateFlow).toHaveBeenCalledWith(
      expect.objectContaining({ aal: "aal2", xSessionToken: args.authToken }),
    )
    expect(mockUpdateFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        flow: "flow-id",
        updateLoginFlowBody: { method: "totp", totp_code: args.totpCode },
      }),
    )
  })

  it("maps a 400 on the code submission to TotpCodeInvalidError", async () => {
    mockUpdateFlow.mockRejectedValue(axiosError(400))

    expect(await kratosVerifyTotpOnSession(args)).toBeInstanceOf(TotpCodeInvalidError)
  })

  it("keeps other Kratos failures as Kratos errors", async () => {
    mockUpdateFlow.mockRejectedValue(axiosError(401))

    expect(await kratosVerifyTotpOnSession(args)).toBeInstanceOf(
      AuthenticationKratosError,
    )
  })
})

describe("kratosElevatingSessionWithTotp", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateFlow.mockResolvedValue({ data: { id: "flow-id" } })
  })

  it("submits the code on the created aal2 flow", async () => {
    mockUpdateFlow.mockResolvedValue({ data: { session: {} } })
    mockToDomainSession.mockReturnValue({ identity: { id: "kratos-user-id" } })

    expect(await kratosElevatingSessionWithTotp(args)).toBe("kratos-user-id")
    expect(mockCreateFlow).toHaveBeenCalledWith(
      expect.objectContaining({ aal: "aal2", xSessionToken: args.authToken }),
    )
    expect(mockUpdateFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        flow: "flow-id",
        updateLoginFlowBody: { method: "totp", totp_code: args.totpCode },
      }),
    )
  })

  it("returns an error instead of throwing when the flow cannot be created", async () => {
    mockCreateFlow.mockRejectedValue(axiosError(400))

    expect(await kratosElevatingSessionWithTotp(args)).toBeInstanceOf(
      LikelyNoUserWithThisPhoneExistError,
    )
    expect(mockUpdateFlow).not.toHaveBeenCalled()
  })

  it("returns a Kratos error when the session token is rejected", async () => {
    mockCreateFlow.mockRejectedValue(axiosError(401))

    expect(await kratosElevatingSessionWithTotp(args)).toBeInstanceOf(
      AuthenticationKratosError,
    )
    expect(mockUpdateFlow).not.toHaveBeenCalled()
  })
})

describe("kratosRevokeSessionToken", () => {
  beforeEach(() => jest.clearAllMocks())

  it("revokes the token through native logout", async () => {
    mockNativeLogout.mockResolvedValue({ data: {} })

    expect(await kratosRevokeSessionToken(args.authToken)).toBe(true)
    expect(mockNativeLogout).toHaveBeenCalledWith({
      performNativeLogoutBody: { session_token: args.authToken },
    })
  })

  it("returns a Kratos error when the revocation fails", async () => {
    mockNativeLogout.mockRejectedValue(axiosError(401))

    expect(await kratosRevokeSessionToken(args.authToken)).toBeInstanceOf(
      AuthenticationKratosError,
    )
  })
})
