jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  getTotpStepUpEnabled: jest.fn(() => true),
}))

jest.mock("@/app/authentication/ratelimits", () => ({
  checkLoginAttemptPerLoginIdentifierLimits: jest.fn(async () => true),
  checkTotpVerifyAttemptPerUserLimits: jest.fn(async () => true),
}))

jest.mock("@/app/authentication/record-login-activity", () => ({
  recordLoginActivity: jest.fn(async () => undefined),
}))

const mockListWallets = jest.fn()
const mockGetBalanceAmount = jest.fn()

jest.mock("@/services/mongoose", () => ({
  WalletsRepository: () => ({ listByAccountId: mockListWallets }),
}))

jest.mock("@/services/ledger", () => ({
  LedgerService: () => ({ getWalletBalanceAmount: mockGetBalanceAmount }),
}))

const mockLoginToken = jest.fn()
const mockEmailLoginToken = jest.fn()
const mockGetIdentity = jest.fn()

jest.mock("@/services/kratos", () => ({
  AuthWithPhonePasswordlessService: () => ({ loginToken: mockLoginToken }),
  AuthWithEmailPasswordlessService: () => ({ loginToken: mockEmailLoginToken }),
  IdentityRepository: () => ({ getIdentity: mockGetIdentity }),
  checkedToTotpCode: jest.requireActual("@/services/kratos").checkedToTotpCode,
  kratosVerifyTotpOnSession: jest.fn(),
  kratosRevokeSessionToken: jest.fn(async () => true),
  logoutSessionByAuthToken: jest.fn(async () => undefined),
}))

jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: jest.fn(),
}))

import { getTotpStepUpEnabled } from "@/config"
import { checkTotpRemovalAllowed, checkTotpStepUp } from "@/app/authentication/totp"
import { checkTotpVerifyAttemptPerUserLimits } from "@/app/authentication/ratelimits"
import { recordLoginActivity } from "@/app/authentication/record-login-activity"
import {
  TotpCodeRequiredError,
  TotpRemovalBalanceTooHighError,
} from "@/domain/authentication/errors"
import { TotpCodeInvalidError, UnknownKratosError } from "@/domain/kratos/errors"
import { TotpVerifyAttemptPerUserRateLimiterExceededError } from "@/domain/rate-limit/errors"
import { WalletCurrency } from "@/domain/shared"
import {
  kratosRevokeSessionToken,
  kratosVerifyTotpOnSession,
  logoutSessionByAuthToken,
} from "@/services/kratos"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

const mockStepUpEnabled = getTotpStepUpEnabled as jest.MockedFunction<
  typeof getTotpStepUpEnabled
>
const mockLimiter = checkTotpVerifyAttemptPerUserLimits as jest.MockedFunction<
  typeof checkTotpVerifyAttemptPerUserLimits
>
const mockVerify = kratosVerifyTotpOnSession as jest.MockedFunction<
  typeof kratosVerifyTotpOnSession
>
const mockRevoke = kratosRevokeSessionToken as jest.MockedFunction<
  typeof kratosRevokeSessionToken
>

const userId = "kratos-user-id" as UserId
const phone = "+15555550100" as PhoneNumber
const identity = { id: userId, phone, totpEnabled: true } as AnyIdentity
const authToken = "ory_st_throwaway" as AuthToken
const totpCode = "123456"

describe("checkTotpStepUp", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockStepUpEnabled.mockReturnValue(true)
    mockGetIdentity.mockResolvedValue(identity)
    mockLimiter.mockResolvedValue(true)
    mockLoginToken.mockResolvedValue({ authToken })
    mockRevoke.mockResolvedValue(true)
  })

  it("passes everything through when the flag is off", async () => {
    mockStepUpEnabled.mockReturnValue(false)

    expect(await checkTotpStepUp({ userId, totpCode: undefined })).toBe(true)
    expect(mockGetIdentity).not.toHaveBeenCalled()
    expect(mockVerify).not.toHaveBeenCalled()
  })

  it("passes an identity without TOTP without a code", async () => {
    mockGetIdentity.mockResolvedValue({ ...identity, totpEnabled: false })

    expect(await checkTotpStepUp({ userId, totpCode: undefined })).toBe(true)
    expect(mockGetIdentity).toHaveBeenCalledWith(userId)
    expect(mockVerify).not.toHaveBeenCalled()
  })

  it("returns the identity lookup error", async () => {
    const err = new UnknownKratosError("lookup failed")
    mockGetIdentity.mockResolvedValue(err)

    expect(await checkTotpStepUp({ userId, totpCode })).toBe(err)
  })

  it.each([undefined, null, ""])("requires a code when it is %p", async (code) => {
    expect(await checkTotpStepUp({ userId, totpCode: code })).toBeInstanceOf(
      TotpCodeRequiredError,
    )
    expect(mockLimiter).not.toHaveBeenCalled()
    expect(mockVerify).not.toHaveBeenCalled()
  })

  it.each(["12345", "1234567", 123456])(
    "refuses the malformed code %p without calling Kratos",
    async (code) => {
      expect(await checkTotpStepUp({ userId, totpCode: code })).toBeInstanceOf(
        TotpCodeInvalidError,
      )
      expect(mockLimiter).not.toHaveBeenCalled()
      expect(mockVerify).not.toHaveBeenCalled()
    },
  )

  it("accepts a valid code on a throwaway session and revokes it", async () => {
    mockVerify.mockResolvedValue(true)

    expect(await checkTotpStepUp({ userId, totpCode })).toBe(true)
    expect(mockGetIdentity).toHaveBeenCalledTimes(1)
    expect(mockLimiter).toHaveBeenCalledWith(userId)
    expect(mockLoginToken).toHaveBeenCalledWith({ phone })
    expect(mockVerify).toHaveBeenCalledWith({ authToken, totpCode })
    expect(mockRevoke).toHaveBeenCalledWith(authToken)
    expect(recordLoginActivity).not.toHaveBeenCalled()
  })

  it("rejects an invalid code and still revokes the aal1 session without whoami", async () => {
    mockVerify.mockResolvedValue(new TotpCodeInvalidError())

    expect(await checkTotpStepUp({ userId, totpCode })).toBeInstanceOf(
      TotpCodeInvalidError,
    )
    expect(mockRevoke).toHaveBeenCalledWith(authToken)
    expect(logoutSessionByAuthToken).not.toHaveBeenCalled()
    expect(recordLoginActivity).not.toHaveBeenCalled()
  })

  it("records a failed revocation on the current span", async () => {
    mockVerify.mockResolvedValue(new TotpCodeInvalidError())
    const revokeErr = new UnknownKratosError("revoke failed")
    mockRevoke.mockResolvedValue(revokeErr)

    expect(await checkTotpStepUp({ userId, totpCode })).toBeInstanceOf(
      TotpCodeInvalidError,
    )
    expect(recordExceptionInCurrentSpan).toHaveBeenCalledWith(
      expect.objectContaining({ error: revokeErr }),
    )
  })

  it("mints the throwaway session by email when the identity has no phone", async () => {
    const email = "user@example.com" as EmailAddress
    mockGetIdentity.mockResolvedValue({ id: userId, email, totpEnabled: true })
    mockEmailLoginToken.mockResolvedValue({ authToken })
    mockVerify.mockResolvedValue(true)

    expect(await checkTotpStepUp({ userId, totpCode })).toBe(true)
    expect(mockEmailLoginToken).toHaveBeenCalledWith({ email })
    expect(mockLoginToken).not.toHaveBeenCalled()
  })

  it("refuses without calling Kratos once the per-user limit is hit", async () => {
    mockLimiter.mockResolvedValue(new TotpVerifyAttemptPerUserRateLimiterExceededError())

    expect(await checkTotpStepUp({ userId, totpCode })).toBeInstanceOf(
      TotpVerifyAttemptPerUserRateLimiterExceededError,
    )
    expect(mockLoginToken).not.toHaveBeenCalled()
    expect(mockVerify).not.toHaveBeenCalled()
  })
})

describe("checkTotpRemovalAllowed", () => {
  const accountId = "account-id" as AccountId
  const btcWallet = {
    id: "btc-wallet",
    currency: WalletCurrency.Btc,
    accountId,
  } as Wallet
  const usdWallet = {
    id: "usd-wallet",
    currency: WalletCurrency.Usd,
    accountId,
  } as Wallet

  const withBalances = (btc: bigint, usd: bigint) => {
    mockListWallets.mockResolvedValue([btcWallet, usdWallet])
    mockGetBalanceAmount.mockImplementation(async ({ id, currency }) => ({
      amount: id === btcWallet.id ? btc : usd,
      currency,
    }))
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockStepUpEnabled.mockReturnValue(true)
  })

  it("allows removal below both thresholds", async () => {
    withBalances(4_999_999n, 499_999n)
    expect(await checkTotpRemovalAllowed({ accountId })).toBe(true)
    expect(mockGetBalanceAmount).toHaveBeenCalledWith(btcWallet)
    expect(mockGetBalanceAmount).toHaveBeenCalledWith(usdWallet)
  })

  it("refuses at the configured threshold", async () => {
    withBalances(5_000_000n, 0n)
    expect(await checkTotpRemovalAllowed({ accountId })).toBeInstanceOf(
      TotpRemovalBalanceTooHighError,
    )
  })

  it("skips the balance refusal when the flag is off", async () => {
    mockStepUpEnabled.mockReturnValue(false)
    withBalances(5_000_000n, 500_000n)

    expect(await checkTotpRemovalAllowed({ accountId })).toBe(true)
    expect(mockListWallets).not.toHaveBeenCalled()
  })
})
