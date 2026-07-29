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
  __mocks: {
    findEarliestByAccountId: jest.fn(),
  },
  AccountsIpsRepository: () => ({
    findEarliestByAccountId: jest.requireMock("@/services/mongoose/accounts-ips").__mocks
      .findEarliestByAccountId,
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
  checkIntraledgerLimits: jest.fn(),
  checkTradeIntraAccountLimits: jest.fn(),
  checkWithdrawalLimits: jest.fn(),
}))

jest.mock("@/app/prices", () => ({
  btcFromUsdMidPriceFn: jest.fn(),
  usdFromBtcMidPriceFn: jest.fn(),
  getCurrentPriceAsDisplayPriceRatio: jest.fn(),
}))

jest.mock("@/services/lock", () => ({
  LockService: () => ({
    lockWalletId: async (_walletId: WalletId, fn: (signal: unknown) => unknown) =>
      fn({ aborted: false }),
  }),
}))
jest.mock("@/services/ledger", () => ({
  LedgerService: () => ({
    getWalletBalanceAmount: async (
      walletDescriptor: WalletDescriptor<WalletCurrency>,
    ) => ({
      amount: 1_000_000n,
      currency: walletDescriptor.currency,
    }),
  }),
}))
jest.mock("@/services/ledger/facade", () => ({
  __mocks: {
    recordIntraledger: jest.fn(),
  },
  WalletIdTradeIntraAccountLedgerMetadata: () => ({
    metadata: {},
    debitAccountAdditionalMetadata: {},
    creditAccountAdditionalMetadata: {},
    internalAccountsAdditionalMetadata: {},
  }),
  recordIntraledger: (args: unknown) =>
    jest.requireMock("@/services/ledger/facade").__mocks.recordIntraledger(args),
}))
jest.mock("@/services/notifications", () => ({
  NotificationsService: () => ({ sendTransaction: jest.fn() }),
}))
jest.mock("@/services/dealer-price", () => ({
  __mocks: {
    getCentsFromSatsForImmediateBuy: jest.fn(),
    getSatsFromCentsForImmediateBuy: jest.fn(),
    getCentsFromSatsForImmediateSell: jest.fn(),
    getSatsFromCentsForImmediateSell: jest.fn(),
  },
  DealerPriceService: () => jest.requireMock("@/services/dealer-price").__mocks,
}))

import {
  intraledgerPaymentSendWalletIdForBtcWallet,
  intraledgerPaymentSendWalletIdForUsdWallet,
} from "@/app/payments/send-intraledger"

import { getWindDownConfig } from "@/config"
import {
  btcFromUsdMidPriceFn,
  getCurrentPriceAsDisplayPriceRatio,
  usdFromBtcMidPriceFn,
} from "@/app/prices"
import { getTransactionForWalletByJournalId } from "@/app/wallets"
import { getBankOwnerWalletId } from "@/services/ledger/caching"
import {
  addAttributesToCurrentSpan,
  recordExceptionInCurrentSpan,
} from "@/services/tracing"

import { DisplayPriceRatio } from "@/domain/payments"
import { ErrorLevel, WalletCurrency } from "@/domain/shared"
import { PaymentSendStatus } from "@/domain/bitcoin/lightning"
import { CouldNotFindAccountIpError, UnknownRepositoryError } from "@/domain/errors"

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  findWalletById: jest.Mock
  findAccountWalletsByAccountId: jest.Mock
  findAccountById: jest.Mock
  findUserById: jest.Mock
}
const ipMocks = jest.requireMock("@/services/mongoose/accounts-ips").__mocks as {
  findEarliestByAccountId: jest.Mock
}
const dealerMocks = jest.requireMock("@/services/dealer-price").__mocks as {
  getCentsFromSatsForImmediateBuy: jest.Mock
  getSatsFromCentsForImmediateBuy: jest.Mock
  getCentsFromSatsForImmediateSell: jest.Mock
  getSatsFromCentsForImmediateSell: jest.Mock
}
const facadeMocks = jest.requireMock("@/services/ledger/facade").__mocks as {
  recordIntraledger: jest.Mock
}
const mockGetWindDownConfig = getWindDownConfig as jest.MockedFunction<
  typeof getWindDownConfig
>
const mockGetBankOwnerWalletId = getBankOwnerWalletId as jest.MockedFunction<
  typeof getBankOwnerWalletId
>
const mockBtcFromUsdMidPriceFn = btcFromUsdMidPriceFn as jest.Mock
const mockUsdFromBtcMidPriceFn = usdFromBtcMidPriceFn as jest.Mock
const mockGetCurrentPriceAsDisplayPriceRatio =
  getCurrentPriceAsDisplayPriceRatio as jest.Mock
const mockGetTransactionForWalletByJournalId =
  getTransactionForWalletByJournalId as jest.Mock

const region = (): WindDownRegionConfig => ({
  code: "default",
  timezone: "Europe/Paris",
  receiveDisabledAt: new Date("2026-08-01T00:00:00+02:00"),
  finalDeadline: new Date("2026-08-31T23:59:59+02:00"),
  gateArmsAt: new Date("2026-09-01T00:00:00+02:00"),
  receiveDisabled: false,
  gateClosed: false,
})

const windDownConfig = ({
  convertUsdToBtcAtMidPrice,
  enabled = true,
  excludedAccountIds = [],
}: {
  convertUsdToBtcAtMidPrice: boolean
  enabled?: boolean
  excludedAccountIds?: string[]
}): WindDownConfig =>
  ({
    enabled,
    affectedCountries: ["FR"],
    excludedAccountIds,
    receiveBlockedAccountIds: [],
    includeLevelZero: false,
    convertUsdToBtcAtMidPrice,
    regions: [region()],
  }) as WindDownConfig

const FR_PHONE = "+33612345678"
const US_PHONE = "+14155552671"

const cohortAccountId = crypto.randomUUID() as AccountId
const otherAccountId = crypto.randomUUID() as AccountId
const bankOwnerWalletId = crypto.randomUUID() as WalletId

const cohortBtcWalletId = crypto.randomUUID() as WalletId
const cohortUsdWalletId = crypto.randomUUID() as WalletId
const otherBtcWalletId = crypto.randomUUID() as WalletId
const otherUsdWalletId = crypto.randomUUID() as WalletId

const wallet = (id: WalletId, accountId: AccountId, currency: string) =>
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

const PRICED_VIA_MID = new UnknownRepositoryError("priced via mid")
const PRICED_VIA_DEALER_SELL_BTC_FROM_USD = new UnknownRepositoryError(
  "priced via dealer sell btcFromUsd",
)
const PRICED_VIA_DEALER_SELL_USD_FROM_BTC = new UnknownRepositoryError(
  "priced via dealer sell usdFromBtc",
)
const PRICED_VIA_DEALER_BUY_USD_FROM_BTC = new UnknownRepositoryError(
  "priced via dealer buy usdFromBtc",
)
const PRICED_VIA_DEALER_BUY_BTC_FROM_USD = new UnknownRepositoryError(
  "priced via dealer buy btcFromUsd",
)

const MID_PRICE_SPAN_ATTRIBUTE = { "payment.midPriceConversion": "true" }

// 25 sats per cent, shared by the mid quote and the display ratio in the settling test
const ENTERED_CENTS = 1_000n
const MID_CONVERTED_SATS = 25_000n

const displayPriceRatio = DisplayPriceRatio({
  displayAmount: {
    amountInMinor: ENTERED_CENTS,
    currency: "USD" as DisplayCurrency,
    displayInMajor: "10.00",
  },
  walletAmount: { amount: MID_CONVERTED_SATS, currency: WalletCurrency.Btc },
})
if (displayPriceRatio instanceof Error) throw displayPriceRatio

const wallets: Record<string, Wallet> = {
  [cohortBtcWalletId]: wallet(cohortBtcWalletId, cohortAccountId, "BTC"),
  [cohortUsdWalletId]: wallet(cohortUsdWalletId, cohortAccountId, "USD"),
  [otherBtcWalletId]: wallet(otherBtcWalletId, otherAccountId, "BTC"),
  [otherUsdWalletId]: wallet(otherUsdWalletId, otherAccountId, "USD"),
}

const accounts: Record<string, Account> = {
  [cohortAccountId]: account(cohortAccountId),
  [otherAccountId]: account(otherAccountId),
}

const phones: Record<string, string> = {
  [`user-${cohortAccountId}`]: FR_PHONE,
  [`user-${otherAccountId}`]: US_PHONE,
}

const walletDescriptorsByAccount: Record<string, { BTC: Wallet; USD: Wallet }> = {
  [cohortAccountId]: {
    BTC: wallets[cohortBtcWalletId],
    USD: wallets[cohortUsdWalletId],
  },
  [otherAccountId]: {
    BTC: wallets[otherBtcWalletId],
    USD: wallets[otherUsdWalletId],
  },
}

const send = ({
  senderWalletId: from,
  recipientWalletId: to,
  senderAccount,
}: {
  senderWalletId: WalletId
  recipientWalletId: WalletId
  senderAccount?: Account
}) => {
  const sendFn =
    wallets[from].currency === "USD"
      ? intraledgerPaymentSendWalletIdForUsdWallet
      : intraledgerPaymentSendWalletIdForBtcWallet
  return sendFn({
    senderWalletId: from,
    senderAccount: senderAccount ?? accounts[wallets[from].accountId],
    recipientWalletId: to,
    amount: Number(ENTERED_CENTS),
    memo: null,
  })
}

describe("intraledger mid-price conversion", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mocks.findWalletById.mockImplementation(async (id: WalletId) => wallets[id])
    mocks.findAccountById.mockImplementation(async (id: AccountId) => accounts[id])
    mocks.findUserById.mockImplementation(async (id: string) => ({
      id,
      phone: phones[id],
      deletedPhones: [],
    }))
    mocks.findAccountWalletsByAccountId.mockImplementation(
      async (accountId: AccountId) => walletDescriptorsByAccount[accountId],
    )
    ipMocks.findEarliestByAccountId.mockResolvedValue(new CouldNotFindAccountIpError())
    mockGetBankOwnerWalletId.mockResolvedValue(bankOwnerWalletId)
    mockBtcFromUsdMidPriceFn.mockResolvedValue(PRICED_VIA_MID)
    mockUsdFromBtcMidPriceFn.mockResolvedValue(PRICED_VIA_MID)
    dealerMocks.getSatsFromCentsForImmediateSell.mockResolvedValue(
      PRICED_VIA_DEALER_SELL_BTC_FROM_USD,
    )
    dealerMocks.getCentsFromSatsForImmediateSell.mockResolvedValue(
      PRICED_VIA_DEALER_SELL_USD_FROM_BTC,
    )
    dealerMocks.getCentsFromSatsForImmediateBuy.mockResolvedValue(
      PRICED_VIA_DEALER_BUY_USD_FROM_BTC,
    )
    dealerMocks.getSatsFromCentsForImmediateBuy.mockResolvedValue(
      PRICED_VIA_DEALER_BUY_BTC_FROM_USD,
    )
  })

  it("prices a cohort self USD to BTC conversion at dealer while the flag is off", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ convertUsdToBtcAtMidPrice: false }),
    )

    const result = await send({
      senderWalletId: cohortUsdWalletId,
      recipientWalletId: cohortBtcWalletId,
    })

    expect(result).toBe(PRICED_VIA_DEALER_SELL_BTC_FROM_USD)
    expect(mockBtcFromUsdMidPriceFn).not.toHaveBeenCalled()
    expect(addAttributesToCurrentSpan).not.toHaveBeenCalledWith(MID_PRICE_SPAN_ATTRIBUTE)
  })

  it("prices a cohort self USD to BTC conversion at mid when the flag is on", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ convertUsdToBtcAtMidPrice: true }),
    )

    const result = await send({
      senderWalletId: cohortUsdWalletId,
      recipientWalletId: cohortBtcWalletId,
    })

    expect(result).toBe(PRICED_VIA_MID)
    expect(dealerMocks.getSatsFromCentsForImmediateSell).not.toHaveBeenCalled()
    expect(dealerMocks.getCentsFromSatsForImmediateSell).not.toHaveBeenCalled()
    expect(addAttributesToCurrentSpan).toHaveBeenCalledWith(MID_PRICE_SPAN_ATTRIBUTE)
  })

  it("keeps dealer pricing for a cohort self BTC to USD conversion", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ convertUsdToBtcAtMidPrice: true }),
    )

    const result = await send({
      senderWalletId: cohortBtcWalletId,
      recipientWalletId: cohortUsdWalletId,
    })

    expect(result).toBe(PRICED_VIA_DEALER_BUY_USD_FROM_BTC)
    expect(mockBtcFromUsdMidPriceFn).not.toHaveBeenCalled()
    expect(mockUsdFromBtcMidPriceFn).not.toHaveBeenCalled()
    expect(addAttributesToCurrentSpan).not.toHaveBeenCalledWith(MID_PRICE_SPAN_ATTRIBUTE)
  })

  it("keeps dealer pricing for a cross-account USD to BTC send from a cohort sender", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ convertUsdToBtcAtMidPrice: true }),
    )

    const result = await send({
      senderWalletId: cohortUsdWalletId,
      recipientWalletId: otherBtcWalletId,
    })

    expect(result).toBe(PRICED_VIA_DEALER_SELL_BTC_FROM_USD)
    expect(mockBtcFromUsdMidPriceFn).not.toHaveBeenCalled()
    expect(addAttributesToCurrentSpan).not.toHaveBeenCalledWith(MID_PRICE_SPAN_ATTRIBUTE)
  })

  it("keeps dealer pricing for a non-cohort self USD to BTC conversion", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ convertUsdToBtcAtMidPrice: true }),
    )

    const result = await send({
      senderWalletId: otherUsdWalletId,
      recipientWalletId: otherBtcWalletId,
    })

    expect(result).toBe(PRICED_VIA_DEALER_SELL_BTC_FROM_USD)
    expect(mockBtcFromUsdMidPriceFn).not.toHaveBeenCalled()
  })

  it("keeps dealer pricing for an excluded cohort account", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({
        convertUsdToBtcAtMidPrice: true,
        excludedAccountIds: [cohortAccountId],
      }),
    )

    const result = await send({
      senderWalletId: cohortUsdWalletId,
      recipientWalletId: cohortBtcWalletId,
    })

    expect(result).toBe(PRICED_VIA_DEALER_SELL_BTC_FROM_USD)
    expect(mockBtcFromUsdMidPriceFn).not.toHaveBeenCalled()
  })

  it("keeps dealer pricing when the sender account does not own the sender wallet", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ convertUsdToBtcAtMidPrice: true }),
    )

    const result = await send({
      senderWalletId: cohortUsdWalletId,
      recipientWalletId: cohortBtcWalletId,
      senderAccount: accounts[otherAccountId],
    })

    expect(result).toBe(PRICED_VIA_DEALER_SELL_BTC_FROM_USD)
    expect(mockBtcFromUsdMidPriceFn).not.toHaveBeenCalled()
    expect(ipMocks.findEarliestByAccountId).not.toHaveBeenCalled()
  })

  it("falls back to dealer pricing and records the exception when the cohort check errors", async () => {
    const repoError = new UnknownRepositoryError("boom")
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ convertUsdToBtcAtMidPrice: true }),
    )
    ipMocks.findEarliestByAccountId.mockResolvedValue(repoError)

    const result = await send({
      senderWalletId: cohortUsdWalletId,
      recipientWalletId: cohortBtcWalletId,
    })

    expect(result).toBe(PRICED_VIA_DEALER_SELL_BTC_FROM_USD)
    expect(mockBtcFromUsdMidPriceFn).not.toHaveBeenCalled()
    expect(recordExceptionInCurrentSpan).toHaveBeenCalledWith({
      error: repoError,
      level: ErrorLevel.Warn,
    })
  })

  it("prices at mid while the wind-down display switch is off", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ convertUsdToBtcAtMidPrice: true, enabled: false }),
    )

    const result = await send({
      senderWalletId: cohortUsdWalletId,
      recipientWalletId: cohortBtcWalletId,
    })

    expect(result).toBe(PRICED_VIA_MID)
    expect(dealerMocks.getSatsFromCentsForImmediateSell).not.toHaveBeenCalled()
  })

  it("settles a mid-priced self conversion at the mid ratio", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ convertUsdToBtcAtMidPrice: true }),
    )
    mockBtcFromUsdMidPriceFn.mockResolvedValue({
      amount: MID_CONVERTED_SATS,
      currency: WalletCurrency.Btc,
    })
    mockGetCurrentPriceAsDisplayPriceRatio.mockResolvedValue(displayPriceRatio)
    facadeMocks.recordIntraledger.mockResolvedValue({
      journalId: "journal-0" as LedgerJournalId,
    })
    mockGetTransactionForWalletByJournalId.mockResolvedValue({ id: "wallet-txn" })

    const result = await send({
      senderWalletId: cohortUsdWalletId,
      recipientWalletId: cohortBtcWalletId,
    })

    expect(result).not.toBeInstanceOf(Error)
    expect((result as PaymentSendResult).status).toBe(PaymentSendStatus.Success)
    const { amount } = facadeMocks.recordIntraledger.mock.calls[0][0]
    expect(amount).toEqual({
      btc: { amount: MID_CONVERTED_SATS, currency: WalletCurrency.Btc },
      usd: { amount: ENTERED_CENTS, currency: WalletCurrency.Usd },
    })
    expect(dealerMocks.getSatsFromCentsForImmediateSell).not.toHaveBeenCalled()
    expect(dealerMocks.getCentsFromSatsForImmediateSell).not.toHaveBeenCalled()
    expect(addAttributesToCurrentSpan).toHaveBeenCalledWith(MID_PRICE_SPAN_ATTRIBUTE)
  })
})
