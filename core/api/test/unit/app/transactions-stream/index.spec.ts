jest.mock("@/services/ledger", () => ({
  LedgerService: jest.fn(),
}))

jest.mock("@/services/cache", () => ({
  LocalCacheService: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  WalletsRepository: jest.fn(),
}))

import { subscribeToTransactions } from "@/app/transactions-stream"
import { LedgerService } from "@/services/ledger"
import { LocalCacheService } from "@/services/cache"
import { WalletsRepository } from "@/services/mongoose"

import {
  TransactionsStreamSettlementVia,
  TransactionsStreamTransactionType,
} from "@/domain/transactions-stream"
import { LedgerTransactionType } from "@/domain/ledger"
import { UnknownLedgerError } from "@/domain/ledger/errors"
import { WalletCurrency } from "@/domain/shared"

afterEach(() => {
  jest.clearAllMocks()
})

const flushMicrotasks = async () => {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

const createLedgerTransaction = (
  id: string,
  overrides: Partial<LedgerTransaction<WalletCurrency>> = {},
): LedgerTransaction<WalletCurrency> =>
  ({
    id: id as LedgerTransactionId,
    walletId: "wallet-1" as WalletId,
    paymentHash: "payment-hash" as PaymentHash,
    type: LedgerTransactionType.Invoice,
    debit: 0 as Satoshis,
    credit: 100 as Satoshis,
    pendingConfirmation: false,
    currency: WalletCurrency.Btc,
    journalId: "journal-1" as LedgerJournalId,
    satsAmount: 100 as Satoshis,
    centsAmount: 200 as UsdCents,
    timestamp: new Date("2024-01-01T00:00:00Z"),
    feeKnownInAdvance: false,
    fee: undefined,
    usd: undefined,
    feeUsd: undefined,
    ...overrides,
  }) as LedgerTransaction<WalletCurrency>

const createEvent = (ledgerTransactionId: string): TransactionStreamEvent => ({
  ledgerTransactionId: ledgerTransactionId as LedgerTransactionId,
  walletId: "wallet-1" as WalletId,
  accountId: "account-1" as AccountId,
  paymentHash: "payment-hash",
  satsAmount: 100,
  centsAmount: 200,
  currency: WalletCurrency.Btc,
  type: TransactionsStreamTransactionType.Received,
  settlementVia: TransactionsStreamSettlementVia.Lightning,
  pending: false,
  timestamp: new Date("2024-01-01T00:00:00Z"),
})

async function* ledgerTransactionGenerator(
  values: Array<LedgerTransaction<WalletCurrency> | LedgerError>,
) {
  for (const value of values) yield value
}

const mockDependencies = ({
  ledgerValues = [],
  cachedAccountId = new Error("cache miss"),
  walletResult = { accountId: "account-1" as AccountId },
}: {
  ledgerValues?: Array<LedgerTransaction<WalletCurrency> | LedgerError>
  cachedAccountId?: AccountId | Error
  walletResult?: Pick<Wallet, "accountId"> | Error
} = {}) => {
  const ledgerService = {
    streamSettledTransactions: jest
      .fn()
      .mockReturnValue(ledgerTransactionGenerator(ledgerValues)),
  }
  const cacheService = {
    get: jest.fn().mockResolvedValue(cachedAccountId),
    set: jest.fn().mockResolvedValue("account-1"),
  }
  const walletsRepository = {
    findById: jest.fn().mockResolvedValue(walletResult),
  }

  ;(LedgerService as jest.Mock).mockReturnValue(ledgerService)
  ;(LocalCacheService as jest.Mock).mockReturnValue(cacheService)
  ;(WalletsRepository as jest.Mock).mockReturnValue(walletsRepository)

  return { ledgerService, cacheService, walletsRepository }
}

const subscribe = async (afterTransactionId?: string) => {
  const onTransaction = jest.fn()
  const onError = jest.fn()
  const subscription = await subscribeToTransactions({
    afterTransactionId,
    onTransaction,
    onError,
  })

  return { onTransaction, onError, subscription }
}

describe("subscribeToTransactions", () => {
  it("returns an error for malformed cursors", async () => {
    const { ledgerService } = mockDependencies()

    const { subscription } = await subscribe("not-an-object-id")

    expect(subscription).toBeInstanceOf(Error)
    expect(ledgerService.streamSettledTransactions).not.toHaveBeenCalled()
  })

  it("returns an error for explicitly empty cursors", async () => {
    const { ledgerService } = mockDependencies()

    const { subscription } = await subscribe("")

    expect(subscription).toBeInstanceOf(Error)
    expect(ledgerService.streamSettledTransactions).not.toHaveBeenCalled()
  })

  it("streams translated ledger transactions from the ledger service", async () => {
    const replayTxn = createLedgerTransaction("661111111111111111111112")
    const liveTxn = createLedgerTransaction("661111111111111111111113")
    const { ledgerService, cacheService, walletsRepository } = mockDependencies({
      ledgerValues: [replayTxn, liveTxn],
    })

    const { onTransaction, onError } = await subscribe("661111111111111111111111")
    await flushMicrotasks()

    expect(ledgerService.streamSettledTransactions).toHaveBeenCalledTimes(1)
    expect(ledgerService.streamSettledTransactions).toHaveBeenCalledWith({
      afterTransactionId: "661111111111111111111111",
      signal: expect.any(AbortSignal),
    })
    expect(cacheService.get).toHaveBeenCalledWith({
      key: "transactions-stream:wallet-account-id:wallet-1",
    })
    expect(walletsRepository.findById).toHaveBeenCalledWith("wallet-1")
    expect(onTransaction).toHaveBeenNthCalledWith(
      1,
      createEvent("661111111111111111111112"),
    )
    expect(onTransaction).toHaveBeenNthCalledWith(
      2,
      createEvent("661111111111111111111113"),
    )
    expect(onError).not.toHaveBeenCalled()
  })

  it("uses cached account ids for wallet lookups", async () => {
    const ledgerTransaction = createLedgerTransaction("661111111111111111111112")
    const { walletsRepository } = mockDependencies({
      ledgerValues: [ledgerTransaction],
      cachedAccountId: "account-1" as AccountId,
    })

    const { onTransaction } = await subscribe()
    await flushMicrotasks()

    expect(walletsRepository.findById).not.toHaveBeenCalled()
    expect(onTransaction).toHaveBeenCalledWith(createEvent("661111111111111111111112"))
  })

  it("starts at the ledger service live stream when no cursor is provided", async () => {
    const { ledgerService } = mockDependencies()

    const { onTransaction } = await subscribe()
    await flushMicrotasks()

    expect(ledgerService.streamSettledTransactions).toHaveBeenCalledWith({
      afterTransactionId: undefined,
      signal: expect.any(AbortSignal),
    })
    expect(onTransaction).not.toHaveBeenCalled()
  })

  it("does not emit when the ledger transaction has no wallet id", async () => {
    const ledgerTransaction = createLedgerTransaction("661111111111111111111112", {
      walletId: undefined,
    })
    const { walletsRepository } = mockDependencies({
      ledgerValues: [ledgerTransaction],
    })

    const { onTransaction, onError } = await subscribe()
    await flushMicrotasks()

    expect(walletsRepository.findById).not.toHaveBeenCalled()
    expect(onTransaction).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it("surfaces ledger errors from the stream", async () => {
    const ledgerError = new UnknownLedgerError("stream failed")
    mockDependencies({ ledgerValues: [ledgerError] })

    const { onError } = await subscribe()
    await flushMicrotasks()

    expect(onError).toHaveBeenCalledWith(ledgerError)
  })

  it("surfaces wallet lookup errors from the stream", async () => {
    const ledgerTransaction = createLedgerTransaction("661111111111111111111112")
    const lookupError = new Error("wallet lookup failed")
    mockDependencies({
      ledgerValues: [ledgerTransaction],
      walletResult: lookupError,
    })

    const { onTransaction, onError } = await subscribe()
    await flushMicrotasks()

    expect(onTransaction).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(lookupError)
  })

  it("aborts the ledger stream when the subscription is closed", async () => {
    let streamSignal: AbortSignal | undefined
    const ledgerService = {
      streamSettledTransactions: jest.fn(({ signal }: StreamSettledTransactionsArgs) => {
        streamSignal = signal

        return (async function* () {
          await new Promise<void>((resolve) => {
            signal?.addEventListener("abort", () => resolve(), { once: true })
          })
          yield createLedgerTransaction("661111111111111111111112")
        })()
      }),
    }
    ;(LedgerService as jest.Mock).mockReturnValue(ledgerService)
    ;(LocalCacheService as jest.Mock).mockReturnValue({
      get: jest.fn().mockResolvedValue(new Error("cache miss")),
      set: jest.fn(),
    })
    ;(WalletsRepository as jest.Mock).mockReturnValue({
      findById: jest.fn().mockResolvedValue({ accountId: "account-1" }),
    })

    const { subscription } = await subscribe()
    await flushMicrotasks()

    expect(subscription).not.toBeInstanceOf(Error)
    if (subscription instanceof Error) return

    subscription.close()
    await flushMicrotasks()

    expect(streamSignal?.aborted).toBe(true)
  })
})
