jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  getWindDownConfig: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    findWalletById: jest.fn(),
    findAccountById: jest.fn(),
    findUserById: jest.fn(),
    isRecorded: jest.fn(),
    persistNew: jest.fn(),
  },
  WalletsRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findWalletById,
  }),
  AccountsRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findAccountById,
  }),
  UsersRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findUserById,
  }),
  WalletInvoicesRepository: () => ({
    persistNew: jest.requireMock("@/services/mongoose").__mocks.persistNew,
  }),
  WalletOnChainAddressesRepository: () => ({
    isRecorded: jest.requireMock("@/services/mongoose").__mocks.isRecorded,
  }),
}))

jest.mock("@/services/mongoose/accounts-ips", () => ({
  AccountsIpsRepository: () => ({
    findEarliestByAccountId: jest
      .fn()
      .mockResolvedValue(
        new (jest.requireActual("@/domain/errors").CouldNotFindAccountIpError)(),
      ),
  }),
}))

// stubbed only to keep the redis/lnd/bria graph out of this suite
jest.mock("@/services/redis", () => ({
  redis: {},
  redisPubSub: {},
  redisCache: {},
  disconnectAll: jest.fn(),
}))

jest.mock("@/services/rate-limit", () => ({
  consumeLimiter: jest.fn().mockResolvedValue(true),
  RateLimitPrefix: {},
}))

jest.mock("@/services/bria", () => ({
  OnChainService: () => ({
    getAddressForWallet: jest.fn().mockResolvedValue({ address: "bc1qaddress" }),
    findAddressByRequestId: jest.fn(),
  }),
}))

jest.mock("@/services/lnd", () => ({
  LndService: () => new Error("lnd unavailable"),
}))

jest.mock("@/services/svix", () => ({
  CallbackService: () => ({}),
}))

jest.mock("@/services/dealer-price", () => ({
  DealerPriceService: () => ({
    getSatsFromCentsForFutureBuy: jest.fn(),
    getCentsFromSatsForFutureBuy: jest.fn(),
  }),
}))

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
  wrapAsyncToRunInSpan: ({ fn }: { fn: unknown }) => fn,
  wrapAsyncFunctionsToRunInSpan: ({ fns }: { fns: unknown }) => fns,
}))

import { addInvoiceForSelfForBtcWallet } from "@/app/wallets/add-invoice-for-wallet"
import { createOnChainAddress } from "@/app/wallets/create-on-chain-address"

import { getWindDownConfig } from "@/config"
import { consumeLimiter } from "@/services/rate-limit"

import { ReceiveDisabledError } from "@/domain/wind-down"

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  findWalletById: jest.Mock
  findAccountById: jest.Mock
  findUserById: jest.Mock
  isRecorded: jest.Mock
  persistNew: jest.Mock
}
const mockGetWindDownConfig = getWindDownConfig as jest.MockedFunction<
  typeof getWindDownConfig
>
const mockConsumeLimiter = consumeLimiter as jest.Mock

const region = (overrides: Partial<WindDownRegionConfig> = {}): WindDownRegionConfig => ({
  code: "default",
  timezone: "Europe/Paris",
  receiveDisabledAt: new Date("2026-08-01T00:00:00+02:00"),
  finalDeadline: new Date("2026-08-31T23:59:59+02:00"),
  gateArmsAt: new Date("2026-09-01T00:00:00+02:00"),
  receiveDisabled: false,
  gateClosed: false,
  ...overrides,
})

const windDownConfig = (armed: boolean): WindDownConfig =>
  ({
    enabled: true,
    affectedCountries: ["FR"],
    excludedAccountIds: [],
    includeLevelZero: false,
    regions: [region({ receiveDisabled: armed })],
  }) as WindDownConfig

const accountId = crypto.randomUUID() as AccountId
const walletId = crypto.randomUUID() as WalletId

describe("receive-disable at the wallet entry points", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mocks.findWalletById.mockResolvedValue({
      id: walletId,
      accountId,
      currency: "BTC",
    } as Wallet)
    mocks.findAccountById.mockResolvedValue({
      id: accountId,
      status: "active",
      level: 1,
      kratosUserId: "user-id",
    } as unknown as Account)
    mocks.findUserById.mockResolvedValue({
      id: "user-id",
      phone: "+33612345678",
      deletedPhones: [],
    })
    mockConsumeLimiter.mockResolvedValue(true)
    mocks.isRecorded.mockResolvedValue(true)
  })

  describe("addInvoice", () => {
    it("refuses the mint for a cohort account when armed", async () => {
      mockGetWindDownConfig.mockReturnValue(windDownConfig(true))

      const result = await addInvoiceForSelfForBtcWallet({
        walletId,
        amount: 1000,
        externalId: undefined,
      })

      expect(result).toBeInstanceOf(ReceiveDisabledError)
      expect(mockConsumeLimiter).not.toHaveBeenCalled()
    })

    it("proceeds past the check while the flags are dark", async () => {
      mockGetWindDownConfig.mockReturnValue(windDownConfig(false))

      const result = await addInvoiceForSelfForBtcWallet({
        walletId,
        amount: 1000,
        externalId: undefined,
      })

      expect(result).not.toBeInstanceOf(ReceiveDisabledError)
      expect(mockConsumeLimiter).toHaveBeenCalled()
    })
  })

  describe("createOnChainAddress", () => {
    it("refuses address issuance for a cohort account when armed", async () => {
      mockGetWindDownConfig.mockReturnValue(windDownConfig(true))

      const result = await createOnChainAddress({ walletId })

      expect(result).toBeInstanceOf(ReceiveDisabledError)
      expect(mockConsumeLimiter).not.toHaveBeenCalled()
    })

    it("proceeds past the check while the flags are dark", async () => {
      mockGetWindDownConfig.mockReturnValue(windDownConfig(false))

      const result = await createOnChainAddress({ walletId })

      expect(result).not.toBeInstanceOf(ReceiveDisabledError)
      expect(mockConsumeLimiter).toHaveBeenCalled()
    })
  })
})
