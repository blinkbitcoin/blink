jest.mock("@/config", () => ({
  getDefaultAccountsConfig: jest.fn(),
  LNURL_SERVER_LN_ADDRESS_DOMAIN: "wallet.blink.test",
}))

jest.mock("@/services/mongoose", () => ({
  AccountsRepository: jest.fn(),
  WalletsRepository: jest.fn(),
}))

jest.mock("@/services/lnurl-server", () => ({
  LnurlServerService: jest.fn(),
}))

import { setUsername } from "@/app/accounts/set-username"

import { getDefaultAccountsConfig } from "@/config"
import {
  LnurlServerMissingInternalUrlError,
  LnurlServerNotFoundError,
  LnurlServerUnavailableError,
} from "@/domain/lnurl-server"
import { CouldNotFindError } from "@/domain/errors"
import { WalletCurrency } from "@/domain/shared"
import { UsernameIsImmutableError, UsernameSetupNotAllowedError } from "@/domain/accounts"
import { LnurlServerService } from "@/services/lnurl-server"
import { AccountsRepository, WalletsRepository } from "@/services/mongoose"

const mockGetDefaultAccountsConfig = getDefaultAccountsConfig as jest.MockedFunction<
  typeof getDefaultAccountsConfig
>
const mockAccountsRepository = AccountsRepository as jest.MockedFunction<
  typeof AccountsRepository
>
const mockWalletsRepository = WalletsRepository as jest.MockedFunction<
  typeof WalletsRepository
>
const mockLnurlServerService = LnurlServerService as jest.MockedFunction<
  typeof LnurlServerService
>

const accountId = crypto.randomUUID() as AccountId
const btcWalletId = crypto.randomUUID() as WalletId
const usdWalletId = crypto.randomUUID() as WalletId

const account = {
  id: accountId,
  createdAt: new Date(),
  defaultWalletId: btcWalletId,
  withdrawFee: undefined,
  level: 1 as AccountLevel,
  status: "active" as AccountStatus,
  statusHistory: [],
  contactEnabled: true,
  kratosUserId: "user-id" as UserId,
  displayCurrency: "USD" as DisplayCurrency,
} satisfies Account

const accountWithUsername = {
  ...account,
  username: "existing" as Username,
} satisfies Account

const accountWallets = {
  BTC: { id: btcWalletId, currency: WalletCurrency.Btc },
  USD: { id: usdWalletId, currency: WalletCurrency.Usd },
} as AccountWalletDescriptors

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

describe("Set username", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockGetDefaultAccountsConfig.mockReturnValue({
      initialStatus: "active" as AccountStatus,
      initialWallets: [] as WalletCurrency[],
      initialLevel: 1 as AccountLevel,
      maxDeletions: 2,
      allowUsernameSetup: false,
    })
    mockAccountsRepository.mockReturnValue({
      findById: jest.fn(),
      findByUsername: jest.fn(),
      update: jest.fn(),
    } as unknown as ReturnType<typeof AccountsRepository>)
    mockWalletsRepository.mockReturnValue({
      findAccountWalletsByAccountId: jest.fn(),
    } as unknown as ReturnType<typeof WalletsRepository>)
  })

  it("fails when username setup is disabled", async () => {
    const result = await setUsername({
      accountId: crypto.randomUUID(),
      username: "alice",
    })

    expect(result).toBeInstanceOf(UsernameSetupNotAllowedError)
    expect(mockAccountsRepository).not.toHaveBeenCalled()
  })

  it("keeps current local behavior when lnurl internal url is missing", async () => {
    mockGetDefaultAccountsConfig.mockReturnValue({
      initialStatus: "active" as AccountStatus,
      initialWallets: [] as WalletCurrency[],
      initialLevel: 1 as AccountLevel,
      maxDeletions: 2,
      allowUsernameSetup: true,
    })

    const update = jest
      .fn()
      .mockResolvedValue({ ...account, username: "alice" as Username })
    const findById = jest.fn().mockResolvedValue({ ...account })
    const findByUsername = jest.fn().mockResolvedValue(new CouldNotFindError())

    mockAccountsRepository.mockReturnValue({
      findById,
      findByUsername,
      update,
    } as unknown as ReturnType<typeof AccountsRepository>)
    mockLnurlServerService.mockReturnValue(
      new LnurlServerMissingInternalUrlError("missing"),
    )

    const result = await setUsername({ accountId: account.id, username: "alice" })

    expect(result).toEqual({ ...account, username: "alice" })
    expect(mockWalletsRepository).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith({ ...account, username: "alice" })
  })

  it("validates availability externally before local check and persists externally before mongo", async () => {
    mockGetDefaultAccountsConfig.mockReturnValue({
      initialStatus: "active" as AccountStatus,
      initialWallets: [] as WalletCurrency[],
      initialLevel: 1 as AccountLevel,
      maxDeletions: 2,
      allowUsernameSetup: true,
    })

    const update = jest
      .fn()
      .mockResolvedValue({ ...account, username: "alice" as Username })
    const findById = jest.fn().mockResolvedValue({ ...account })
    const findByUsername = jest.fn().mockResolvedValue(new CouldNotFindError())
    const findAccountWalletsByAccountId = jest.fn().mockResolvedValue(accountWallets)
    const getIdentifier = jest
      .fn()
      .mockResolvedValue(new LnurlServerNotFoundError("not_found"))
    const createBlinkAccount = jest.fn().mockResolvedValue({ accountId: "lnurl-account" })

    mockAccountsRepository.mockReturnValue({
      findById,
      findByUsername,
      update,
    } as unknown as ReturnType<typeof AccountsRepository>)
    mockWalletsRepository.mockReturnValue({
      findAccountWalletsByAccountId,
    } as unknown as ReturnType<typeof WalletsRepository>)
    mockLnurlServerService.mockReturnValue(
      lnurlServerService({ getIdentifier, createBlinkAccount }),
    )

    const result = await setUsername({ accountId: account.id, username: "alice" })

    expect(result).toEqual({ ...account, username: "alice" })
    expect(getIdentifier).toHaveBeenCalledWith({
      domain: "wallet.blink.test",
      identifier: "alice",
    })
    expect(findByUsername.mock.invocationCallOrder[0]).toBeGreaterThan(
      getIdentifier.mock.invocationCallOrder[0],
    )
    expect(createBlinkAccount).toHaveBeenCalledWith({
      domain: "wallet.blink.test",
      blinkAccountId: account.id,
      btcWalletId: accountWallets.BTC.id,
      usdWalletId: accountWallets.USD.id,
      defaultWallet: "btc",
      description: "alice",
      identifiers: ["alice"],
    })
    expect(update.mock.invocationCallOrder[0]).toBeGreaterThan(
      createBlinkAccount.mock.invocationCallOrder[0],
    )
  })

  it("does not update mongo when lnurl account creation fails", async () => {
    mockGetDefaultAccountsConfig.mockReturnValue({
      initialStatus: "active" as AccountStatus,
      initialWallets: [] as WalletCurrency[],
      initialLevel: 1 as AccountLevel,
      maxDeletions: 2,
      allowUsernameSetup: true,
    })

    const update = jest.fn()
    const findById = jest.fn().mockResolvedValue({ ...account })
    const findByUsername = jest.fn().mockResolvedValue(new CouldNotFindError())
    const findAccountWalletsByAccountId = jest.fn().mockResolvedValue(accountWallets)
    const lnurlError = new LnurlServerUnavailableError("provider_disabled")

    mockAccountsRepository.mockReturnValue({
      findById,
      findByUsername,
      update,
    } as unknown as ReturnType<typeof AccountsRepository>)
    mockWalletsRepository.mockReturnValue({
      findAccountWalletsByAccountId,
    } as unknown as ReturnType<typeof WalletsRepository>)
    mockLnurlServerService.mockReturnValue(
      lnurlServerService({
        getIdentifier: jest
          .fn()
          .mockResolvedValue(new LnurlServerNotFoundError("not_found")),
        createBlinkAccount: jest.fn().mockResolvedValue(lnurlError),
      }),
    )

    const result = await setUsername({ accountId: account.id, username: "alice" })

    expect(result).toBe(lnurlError)
    expect(update).not.toHaveBeenCalled()
  })

  it("returns immutable error before hitting lnurl for accounts with usernames", async () => {
    mockGetDefaultAccountsConfig.mockReturnValue({
      initialStatus: "active" as AccountStatus,
      initialWallets: [] as WalletCurrency[],
      initialLevel: 1 as AccountLevel,
      maxDeletions: 2,
      allowUsernameSetup: true,
    })

    mockAccountsRepository.mockReturnValue({
      findById: jest.fn().mockResolvedValue({ ...accountWithUsername }),
    } as unknown as ReturnType<typeof AccountsRepository>)

    const getIdentifier = jest.fn()
    mockLnurlServerService.mockReturnValue(lnurlServerService({ getIdentifier }))

    const result = await setUsername({ accountId: account.id, username: "alice" })

    expect(result).toBeInstanceOf(UsernameIsImmutableError)
    expect(getIdentifier).not.toHaveBeenCalled()
  })
})
