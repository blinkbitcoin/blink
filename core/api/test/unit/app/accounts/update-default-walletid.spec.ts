jest.mock("@/config", () => ({
  LNURL_SERVER_LN_ADDRESS_DOMAIN: "wallet.blink.test",
}))

jest.mock("@/services/mongoose", () => ({
  AccountsRepository: jest.fn(),
  WalletsRepository: jest.fn(),
}))

jest.mock("@/services/lnurl-server", () => ({
  LnurlServerService: jest.fn(),
}))

import { updateDefaultWalletId } from "@/app/accounts/update-default-walletid"

import {
  LnurlServerMissingInternalUrlError,
  LnurlServerNotFoundError,
  LnurlServerUnavailableError,
} from "@/domain/lnurl-server"
import { WalletCurrency } from "@/domain/shared"
import { LnurlServerService } from "@/services/lnurl-server"
import { AccountsRepository, WalletsRepository } from "@/services/mongoose"

const mockLnurlServerService = LnurlServerService as jest.MockedFunction<
  typeof LnurlServerService
>
const mockAccountsRepository = AccountsRepository as jest.MockedFunction<
  typeof AccountsRepository
>
const mockWalletsRepository = WalletsRepository as jest.MockedFunction<
  typeof WalletsRepository
>

const accountId = crypto.randomUUID() as AccountId
const btcWalletId = crypto.randomUUID() as WalletId
const usdWalletId = crypto.randomUUID() as WalletId

const account = {
  id: accountId,
  createdAt: new Date(),
  username: "alice" as Username,
  defaultWalletId: btcWalletId,
  withdrawFee: undefined,
  level: 1 as AccountLevel,
  status: "active" as AccountStatus,
  statusHistory: [],
  contactEnabled: true,
  windDownExempt: false,
  kratosUserId: "user-id" as UserId,
  displayCurrency: "USD" as DisplayCurrency,
} satisfies Account

const wallets = [
  { id: btcWalletId, currency: WalletCurrency.Btc },
  { id: usdWalletId, currency: WalletCurrency.Usd },
] as Wallet[]

const lnurlServerService = (
  overrides: Partial<Record<keyof ILnurlServerService, jest.Mock>>,
): ILnurlServerService =>
  ({
    createBlinkAccount: jest.fn(),
    updateDefaultWallet: jest.fn(),
    getIdentifier: jest.fn(),
    transferIdentifierToSpark: jest.fn(),
    ...overrides,
  }) as unknown as ILnurlServerService

describe("updateDefaultWalletId", () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it("keeps current local behavior when lnurl internal url is missing", async () => {
    const update = jest
      .fn()
      .mockResolvedValue({ ...account, defaultWalletId: usdWalletId })

    mockAccountsRepository.mockReturnValue({
      findById: jest.fn().mockResolvedValue(account),
      update,
    } as unknown as ReturnType<typeof AccountsRepository>)
    mockWalletsRepository.mockReturnValue({
      listByAccountId: jest.fn().mockResolvedValue(wallets),
    } as unknown as ReturnType<typeof WalletsRepository>)
    mockLnurlServerService.mockReturnValue(
      new LnurlServerMissingInternalUrlError("missing"),
    )

    const result = await updateDefaultWalletId({
      accountId: account.id,
      walletId: usdWalletId,
    })

    expect(result).toEqual({ ...account, defaultWalletId: usdWalletId })
    expect(update).toHaveBeenCalledWith({
      ...account,
      defaultWalletId: usdWalletId,
    })
  })

  it("validates and persists externally before local mongo update", async () => {
    const update = jest
      .fn()
      .mockResolvedValue({ ...account, defaultWalletId: usdWalletId })
    const getIdentifier = jest.fn().mockResolvedValue({ identifier: "alice" })
    const updateDefaultWallet = jest.fn().mockResolvedValue({ defaultWallet: "usd" })

    mockAccountsRepository.mockReturnValue({
      findById: jest.fn().mockResolvedValue(account),
      update,
    } as unknown as ReturnType<typeof AccountsRepository>)
    mockWalletsRepository.mockReturnValue({
      listByAccountId: jest.fn().mockResolvedValue(wallets),
    } as unknown as ReturnType<typeof WalletsRepository>)
    mockLnurlServerService.mockReturnValue(
      lnurlServerService({ getIdentifier, updateDefaultWallet }),
    )

    const result = await updateDefaultWalletId({
      accountId: account.id,
      walletId: usdWalletId,
    })

    expect(result).toEqual({ ...account, defaultWalletId: usdWalletId })
    expect(getIdentifier).toHaveBeenCalledWith({
      domain: "wallet.blink.test",
      identifier: "alice",
    })
    expect(updateDefaultWallet).toHaveBeenCalledWith({
      accountId: account.id,
      defaultWallet: "usd",
    })
    expect(update.mock.invocationCallOrder[0]).toBeGreaterThan(
      updateDefaultWallet.mock.invocationCallOrder[0],
    )
  })

  it("skips lnurl sync when account has no username", async () => {
    const update = jest.fn().mockResolvedValue({
      ...account,
      username: undefined,
      defaultWalletId: usdWalletId,
    })

    mockAccountsRepository.mockReturnValue({
      findById: jest.fn().mockResolvedValue({ ...account, username: undefined }),
      update,
    } as unknown as ReturnType<typeof AccountsRepository>)
    mockWalletsRepository.mockReturnValue({
      listByAccountId: jest.fn().mockResolvedValue(wallets),
    } as unknown as ReturnType<typeof WalletsRepository>)

    const result = await updateDefaultWalletId({
      accountId: account.id,
      walletId: usdWalletId,
    })

    expect(result).toEqual({
      ...account,
      username: undefined,
      defaultWalletId: usdWalletId,
    })
    expect(mockLnurlServerService).not.toHaveBeenCalled()
  })

  it("does not update mongo when lnurl update fails", async () => {
    const update = jest.fn()
    const lnurlError = new LnurlServerUnavailableError("provider_disabled")

    mockAccountsRepository.mockReturnValue({
      findById: jest.fn().mockResolvedValue(account),
      update,
    } as unknown as ReturnType<typeof AccountsRepository>)
    mockWalletsRepository.mockReturnValue({
      listByAccountId: jest.fn().mockResolvedValue(wallets),
    } as unknown as ReturnType<typeof WalletsRepository>)
    mockLnurlServerService.mockReturnValue(
      lnurlServerService({
        getIdentifier: jest.fn().mockResolvedValue({ identifier: "alice" }),
        updateDefaultWallet: jest.fn().mockResolvedValue(lnurlError),
      }),
    )

    const result = await updateDefaultWalletId({
      accountId: account.id,
      walletId: usdWalletId,
    })

    expect(result).toBe(lnurlError)
    expect(update).not.toHaveBeenCalled()
  })

  it("blocks local update when external identifier is missing", async () => {
    const update = jest.fn()
    const notFound = new LnurlServerNotFoundError("not_found")

    mockAccountsRepository.mockReturnValue({
      findById: jest.fn().mockResolvedValue(account),
      update,
    } as unknown as ReturnType<typeof AccountsRepository>)
    mockWalletsRepository.mockReturnValue({
      listByAccountId: jest.fn().mockResolvedValue(wallets),
    } as unknown as ReturnType<typeof WalletsRepository>)
    mockLnurlServerService.mockReturnValue(
      lnurlServerService({
        getIdentifier: jest.fn().mockResolvedValue(notFound),
      }),
    )

    const result = await updateDefaultWalletId({
      accountId: account.id,
      walletId: usdWalletId,
    })

    expect(result).toBe(notFound)
    expect(update).not.toHaveBeenCalled()
  })
})
