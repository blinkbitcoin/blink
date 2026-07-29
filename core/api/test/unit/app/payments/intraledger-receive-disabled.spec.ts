jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  getWindDownConfig: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    findWalletById: jest.fn(),
    findAccountWalletsByAccountId: jest.fn(),
    findAccountById: jest.fn(),
    findUserById: jest.fn(),
  },
  WalletsRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findWalletById,
    findAccountWalletsByAccountId:
      jest.requireMock("@/services/mongoose").__mocks.findAccountWalletsByAccountId,
  }),
  AccountsRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findAccountById,
  }),
  UsersRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findUserById,
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

jest.mock("@/services/ledger/caching", () => ({
  getBankOwnerWalletId: jest.fn(),
}))

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
  wrapAsyncToRunInSpan: ({ fn }: { fn: unknown }) => fn,
  wrapAsyncFunctionsToRunInSpan: ({ fns }: { fns: unknown }) => fns,
}))

// the modules below are stubbed only to keep the redis/lnd graph out of this suite
jest.mock("@/services/redis", () => ({
  redis: {},
  redisPubSub: {},
  redisCache: {},
  disconnectAll: jest.fn(),
}))

jest.mock("@/app/wallets", () => ({
  validateIsBtcWallet: jest.fn().mockResolvedValue(true),
  validateIsUsdWallet: jest.fn().mockResolvedValue(true),
  getTransactionForWalletByJournalId: jest.fn(),
}))

jest.mock("@/app/accounts", () => ({
  createIntraledgerContact: jest.fn(),
}))

jest.mock("@/app/prices", () => ({
  btcFromUsdMidPriceFn: jest.fn(),
  usdFromBtcMidPriceFn: jest.fn(),
  getCurrentPriceAsDisplayPriceRatio: jest.fn(),
}))

jest.mock("@/services/lock", () => ({ LockService: () => ({}) }))
jest.mock("@/services/ledger", () => ({ LedgerService: () => ({}) }))
jest.mock("@/services/ledger/facade", () => ({}))
jest.mock("@/services/notifications", () => ({ NotificationsService: () => ({}) }))
jest.mock("@/services/dealer-price", () => ({
  DealerPriceService: () => ({
    getCentsFromSatsForImmediateBuy: jest.fn(),
    getSatsFromCentsForImmediateBuy: jest.fn(),
    getCentsFromSatsForImmediateSell: jest.fn(),
    getSatsFromCentsForImmediateSell: jest.fn(),
  }),
}))

import { intraledgerPaymentSendWalletIdForBtcWallet } from "@/app/payments/send-intraledger"

import { getWindDownConfig } from "@/config"
import { getBankOwnerWalletId } from "@/services/ledger/caching"

import { ReceiveDisabledError } from "@/domain/wind-down"
import { UnknownRepositoryError } from "@/domain/errors"

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  findWalletById: jest.Mock
  findAccountWalletsByAccountId: jest.Mock
  findAccountById: jest.Mock
  findUserById: jest.Mock
}
const mockGetWindDownConfig = getWindDownConfig as jest.MockedFunction<
  typeof getWindDownConfig
>
const mockGetBankOwnerWalletId = getBankOwnerWalletId as jest.MockedFunction<
  typeof getBankOwnerWalletId
>

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
    receiveBlockedAccountIds: [],
    includeLevelZero: false,
    convertUsdToBtcAtMidPrice: false,
    regions: [region({ receiveDisabled: armed })],
  }) as WindDownConfig

const FR_PHONE = "+33612345678"
const US_PHONE = "+14155552671"

const senderAccountId = crypto.randomUUID() as AccountId
const cohortAccountId = crypto.randomUUID() as AccountId
const bankOwnerAccountId = crypto.randomUUID() as AccountId

const senderWalletId = crypto.randomUUID() as WalletId
const cohortWalletId = crypto.randomUUID() as WalletId
const bankOwnerWalletId = crypto.randomUUID() as WalletId
const cohortUsdWalletId = crypto.randomUUID() as WalletId

const wallet = (id: WalletId, accountId: AccountId, currency = "BTC") =>
  ({ id, accountId, currency }) as Wallet

const account = (id: AccountId) =>
  ({
    id,
    createdAt: new Date(),
    defaultWalletId: crypto.randomUUID() as WalletId,
    withdrawFee: undefined,
    level: 1 as AccountLevel,
    status: "active" as AccountStatus,
    statusHistory: [],
    contactEnabled: true,
    kratosUserId: `user-${id}` as UserId,
    displayCurrency: "USD" as DisplayCurrency,
  }) as Account

// the first await after the guarded recipient validation: reaching it proves the
// receive check let the payment through
const PAST_THE_GUARD = new UnknownRepositoryError("past the guard")

const wallets: Record<string, Wallet> = {
  [senderWalletId]: wallet(senderWalletId, senderAccountId),
  [cohortWalletId]: wallet(cohortWalletId, cohortAccountId),
  [bankOwnerWalletId]: wallet(bankOwnerWalletId, bankOwnerAccountId),
  [cohortUsdWalletId]: wallet(cohortUsdWalletId, cohortAccountId, "USD"),
}

const accounts: Record<string, Account> = {
  [senderAccountId]: account(senderAccountId),
  [cohortAccountId]: account(cohortAccountId),
  [bankOwnerAccountId]: account(bankOwnerAccountId),
}

const phones: Record<string, string> = {
  [`user-${senderAccountId}`]: US_PHONE,
  [`user-${cohortAccountId}`]: FR_PHONE,
  [`user-${bankOwnerAccountId}`]: US_PHONE,
}

const send = ({
  senderWalletId: from,
  recipientWalletId: to,
}: {
  senderWalletId: WalletId
  recipientWalletId: WalletId
}) =>
  intraledgerPaymentSendWalletIdForBtcWallet({
    senderWalletId: from,
    senderAccount: accounts[wallets[from].accountId],
    recipientWalletId: to,
    amount: 1000 as Satoshis,
    memo: null,
  })

describe("intraledger receive-disable", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mocks.findWalletById.mockImplementation(async (id: WalletId) => wallets[id])
    mocks.findAccountById.mockImplementation(async (id: AccountId) => accounts[id])
    mocks.findUserById.mockImplementation(async (id: string) => ({
      id,
      phone: phones[id],
      deletedPhones: [],
    }))
    mocks.findAccountWalletsByAccountId.mockResolvedValue(PAST_THE_GUARD)
    mockGetBankOwnerWalletId.mockResolvedValue(bankOwnerWalletId)
  })

  it("refuses a third-party send to a cohort account when armed", async () => {
    mockGetWindDownConfig.mockReturnValue(windDownConfig(true))

    const result = await send({
      senderWalletId,
      recipientWalletId: cohortWalletId,
    })

    expect(result).toBeInstanceOf(ReceiveDisabledError)
  })

  it("allows a third-party send while the flags are dark", async () => {
    mockGetWindDownConfig.mockReturnValue(windDownConfig(false))

    const result = await send({
      senderWalletId,
      recipientWalletId: cohortWalletId,
    })

    expect(result).toBe(PAST_THE_GUARD)
  })

  it("allows the bank-owner de-minimis top-up when armed", async () => {
    mockGetWindDownConfig.mockReturnValue(windDownConfig(true))

    const result = await send({
      senderWalletId: bankOwnerWalletId,
      recipientWalletId: cohortWalletId,
    })

    expect(result).toBe(PAST_THE_GUARD)
  })

  it("allows an own-wallet conversion when armed", async () => {
    mockGetWindDownConfig.mockReturnValue(windDownConfig(true))

    const result = await send({
      senderWalletId: cohortUsdWalletId,
      recipientWalletId: cohortWalletId,
    })

    expect(result).toBe(PAST_THE_GUARD)
    expect(mockGetBankOwnerWalletId).not.toHaveBeenCalled()
  })

  it("refuses a funder-sourced credit when armed", async () => {
    const funderWalletId = crypto.randomUUID() as WalletId
    const funderAccountId = crypto.randomUUID() as AccountId
    wallets[funderWalletId] = wallet(funderWalletId, funderAccountId)
    accounts[funderAccountId] = account(funderAccountId)
    phones[`user-${funderAccountId}`] = US_PHONE
    mockGetWindDownConfig.mockReturnValue(windDownConfig(true))

    const result = await send({
      senderWalletId: funderWalletId,
      recipientWalletId: cohortWalletId,
    })

    expect(result).toBeInstanceOf(ReceiveDisabledError)
  })

  it("allows a send to a non-cohort account when armed", async () => {
    mockGetWindDownConfig.mockReturnValue(windDownConfig(true))

    const result = await send({
      senderWalletId: cohortWalletId,
      recipientWalletId: senderWalletId,
    })

    expect(result).toBe(PAST_THE_GUARD)
  })

  it("fails closed when the cohort check errors", async () => {
    const repoError = new UnknownRepositoryError("boom")
    mockGetWindDownConfig.mockReturnValue(windDownConfig(true))
    mocks.findUserById.mockImplementation(async (id: string) =>
      id === `user-${cohortAccountId}` ? repoError : { id, phone: US_PHONE },
    )

    const result = await send({
      senderWalletId,
      recipientWalletId: cohortWalletId,
    })

    expect(result).toBe(repoError)
  })
})
