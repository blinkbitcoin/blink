jest.mock("@/app/authentication/ratelimits", () => ({
  checkLoginAttemptPerLoginIdentifierLimits: jest.fn(async () => true),
  checkTotpVerifyAttemptPerUserLimits: jest.fn(async () => true),
}))

jest.mock("@/app/authentication/record-login-activity", () => ({
  recordLoginActivity: jest.fn(async () => undefined),
}))

jest.mock("@/app/wallets/get-balance-for-wallet", () => ({
  getBalanceForWallet: jest.fn(),
}))

const mockListWallets = jest.fn()

jest.mock("@/services/mongoose", () => ({
  WalletsRepository: () => ({ listByAccountId: mockListWallets }),
}))

const mockLoginToken = jest.fn()

jest.mock("@/services/kratos/private", () => ({
  kratosAdmin: {
    getIdentity: jest.fn(async () => ({ data: { traits: { phone: "+15555550100" } } })),
  },
}))

jest.mock("@/services/kratos", () => ({
  AuthWithPhonePasswordlessService: () => ({ loginToken: mockLoginToken }),
  AuthWithEmailPasswordlessService: () => ({ loginToken: jest.fn() }),
  handleKratosErrors: jest.fn((err) => err),
  kratosVerifyTotpOnSession: jest.fn(),
  kratosRevokeSessionToken: jest.fn(async () => true),
  logoutSessionByAuthToken: jest.fn(async () => undefined),
}))

jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: jest.fn(),
}))

import { checkTotpRemovalAllowed, verifyTotpCode } from "@/app/authentication/totp"
import { checkTotpVerifyAttemptPerUserLimits } from "@/app/authentication/ratelimits"
import { recordLoginActivity } from "@/app/authentication/record-login-activity"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"
import { TotpRemovalBalanceTooHighError } from "@/domain/authentication/errors"
import { TotpCodeInvalidError, UnknownKratosError } from "@/domain/kratos/errors"
import { TotpVerifyAttemptPerUserRateLimiterExceededError } from "@/domain/rate-limit/errors"
import { WalletCurrency } from "@/domain/shared"
import {
  kratosRevokeSessionToken,
  kratosVerifyTotpOnSession,
  logoutSessionByAuthToken,
} from "@/services/kratos"
import { kratosAdmin } from "@/services/kratos/private"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

const mockLimiter = checkTotpVerifyAttemptPerUserLimits as jest.MockedFunction<
  typeof checkTotpVerifyAttemptPerUserLimits
>
const mockVerify = kratosVerifyTotpOnSession as jest.MockedFunction<
  typeof kratosVerifyTotpOnSession
>
const mockRevoke = kratosRevokeSessionToken as jest.MockedFunction<
  typeof kratosRevokeSessionToken
>
const mockGetBalance = getBalanceForWallet as jest.MockedFunction<
  typeof getBalanceForWallet
>

const userId = "kratos-user-id" as UserId
const authToken = "ory_st_throwaway" as AuthToken
const totpCode = "123456" as TotpCode

describe("verifyTotpCode", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLimiter.mockResolvedValue(true)
    mockLoginToken.mockResolvedValue({ authToken })
    mockRevoke.mockResolvedValue(true)
  })

  it("accepts a valid code on a throwaway session and logs it out", async () => {
    mockVerify.mockResolvedValue(true)

    const result = await verifyTotpCode({ userId, totpCode })

    expect(result).toBe(true)
    expect(mockLimiter).toHaveBeenCalledWith(userId)
    expect(mockVerify).toHaveBeenCalledWith({ authToken, totpCode })
    expect(mockRevoke).toHaveBeenCalledWith(authToken)
    expect(recordLoginActivity).not.toHaveBeenCalled()
  })

  it("rejects an invalid code and still revokes the aal1 session without whoami", async () => {
    mockVerify.mockResolvedValue(new TotpCodeInvalidError())

    const result = await verifyTotpCode({ userId, totpCode })

    expect(result).toBeInstanceOf(TotpCodeInvalidError)
    expect(mockRevoke).toHaveBeenCalledWith(authToken)
    expect(logoutSessionByAuthToken).not.toHaveBeenCalled()
    expect(recordLoginActivity).not.toHaveBeenCalled()
  })

  it("records a failed revocation on the current span", async () => {
    mockVerify.mockResolvedValue(new TotpCodeInvalidError())
    const revokeErr = new UnknownKratosError("revoke failed")
    mockRevoke.mockResolvedValue(revokeErr)

    const result = await verifyTotpCode({ userId, totpCode })

    expect(result).toBeInstanceOf(TotpCodeInvalidError)
    expect(recordExceptionInCurrentSpan).toHaveBeenCalledWith(
      expect.objectContaining({ error: revokeErr }),
    )
  })

  it("refuses without calling Kratos once the per-user limit is hit", async () => {
    mockLimiter.mockResolvedValue(new TotpVerifyAttemptPerUserRateLimiterExceededError())

    const result = await verifyTotpCode({ userId, totpCode })

    expect(result).toBeInstanceOf(TotpVerifyAttemptPerUserRateLimiterExceededError)
    expect(kratosAdmin.getIdentity).not.toHaveBeenCalled()
    expect(mockLoginToken).not.toHaveBeenCalled()
    expect(mockVerify).not.toHaveBeenCalled()
  })
})

describe("checkTotpRemovalAllowed", () => {
  const accountId = "account-id" as AccountId
  const btcWallet = { id: "btc-wallet", currency: WalletCurrency.Btc } as Wallet
  const usdWallet = { id: "usd-wallet", currency: WalletCurrency.Usd } as Wallet

  const withBalances = (btc: number, usd: number) => {
    mockListWallets.mockResolvedValue([btcWallet, usdWallet])
    mockGetBalance.mockImplementation(async ({ walletId }) =>
      walletId === btcWallet.id
        ? (btc as CurrencyBaseAmount)
        : (usd as CurrencyBaseAmount),
    )
  }

  beforeEach(() => jest.clearAllMocks())

  it("allows removal below both thresholds", async () => {
    withBalances(4_999_999, 499_999)
    expect(await checkTotpRemovalAllowed({ accountId })).toBe(true)
  })

  it("refuses when the BTC balance reaches the threshold", async () => {
    withBalances(5_000_000, 0)
    expect(await checkTotpRemovalAllowed({ accountId })).toBeInstanceOf(
      TotpRemovalBalanceTooHighError,
    )
  })

  it("refuses when the USD balance reaches the threshold", async () => {
    withBalances(0, 500_000)
    expect(await checkTotpRemovalAllowed({ accountId })).toBeInstanceOf(
      TotpRemovalBalanceTooHighError,
    )
  })
})
