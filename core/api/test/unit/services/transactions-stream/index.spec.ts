import mongoose from "mongoose"

import {
  TransactionsStreamService,
  TransactionStreamQueries,
} from "@/services/transactions-stream"
import { TransactionStreamRecord } from "@/services/transactions-stream/helpers"

import {
  TransactionsStreamSettlementVia,
  TransactionsStreamTransactionType,
} from "@/domain/transactions-stream"
import { LedgerTransactionType } from "@/domain/ledger"
import { WalletCurrency } from "@/domain/shared"

jest.useFakeTimers()

afterAll(() => {
  jest.useRealTimers()
})

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const createLedgerTransaction = (
  id: string,
  overrides: Partial<TransactionStreamRecord> = {},
): TransactionStreamRecord =>
  ({
    _id: new mongoose.Types.ObjectId(id),
    accounts: "Liabilities:wallet-1",
    hash: "payment-hash",
    type: LedgerTransactionType.Invoice,
    pending: false,
    currency: WalletCurrency.Btc,
    satsAmount: 100,
    centsAmount: 200,
    credit: 100,
    datetime: new Date("2024-01-01T00:00:00Z"),
    timestamp: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  }) as TransactionStreamRecord

const createEvent = (ledgerTransactionId: string): TransactionStreamEvent => ({
  ledgerTransactionId: ledgerTransactionId as LedgerTransactionId,
  walletId: "wallet-1" as WalletId,
  accountId: "account-1" as AccountId,
  paymentHash: "payment-hash",
  preimage: "preimage",
  satsAmount: 100,
  centsAmount: 200,
  currency: WalletCurrency.Btc,
  type: TransactionsStreamTransactionType.Received,
  settlementVia: TransactionsStreamSettlementVia.Lightning,
  pending: false,
  timestamp: new Date("2024-01-01T00:00:00Z"),
})

const subscribe = ({
  service,
  afterTransactionId,
}: {
  service: ReturnType<typeof TransactionsStreamService>
  afterTransactionId?: string
}) => {
  const onTransaction = jest.fn()
  const onError = jest.fn()
  const subscription = service.subscribeToTransactions({
    afterTransactionId,
    onTransaction,
    onError,
  })

  return { onTransaction, onError, subscription }
}

describe("TransactionsStreamService", () => {
  it("returns an error for malformed cursors", () => {
    const transactionQueries: TransactionStreamQueries = {
      listSettledTransactionsAfter: jest.fn(),
      findLatestTransactionId: jest.fn(),
    }
    const service = TransactionsStreamService({
      transactionQueries,
      mapTransactionStreamEvent: jest.fn(),
    })

    const { subscription } = subscribe({
      service,
      afterTransactionId: "not-an-object-id",
    })

    expect(subscription).toBeInstanceOf(Error)
    expect(transactionQueries.listSettledTransactionsAfter).not.toHaveBeenCalled()
  })

  it("replays transactions when after_transaction_id is provided", async () => {
    const replayTxn = createLedgerTransaction("661111111111111111111112")
    const transactionQueries: TransactionStreamQueries = {
      listSettledTransactionsAfter: jest.fn().mockResolvedValue([replayTxn]),
      findLatestTransactionId: jest.fn(),
    }
    const mapTransactionStreamEvent = jest
      .fn()
      .mockResolvedValue(createEvent(replayTxn._id.toString()))
    const service = TransactionsStreamService({
      transactionQueries,
      mapTransactionStreamEvent,
      pollIntervalMs: 200,
    })

    const { onTransaction } = subscribe({
      service,
      afterTransactionId: "661111111111111111111111",
    })
    await flushMicrotasks()

    expect(transactionQueries.listSettledTransactionsAfter).toHaveBeenCalledWith({
      afterTransactionId: "661111111111111111111111",
      limit: 100,
    })
    expect(onTransaction).toHaveBeenCalledTimes(1)
    expect(onTransaction).toHaveBeenCalledWith(createEvent("661111111111111111111112"))
    expect(transactionQueries.findLatestTransactionId).not.toHaveBeenCalled()
  })

  it("starts from the current tip when no cursor is provided", async () => {
    const transactionQueries: TransactionStreamQueries = {
      listSettledTransactionsAfter: jest.fn().mockResolvedValue([]),
      findLatestTransactionId: jest
        .fn()
        .mockResolvedValue("661111111111111111111111" as LedgerTransactionId),
    }
    const mapTransactionStreamEvent = jest.fn()
    const service = TransactionsStreamService({
      transactionQueries,
      mapTransactionStreamEvent,
      pollIntervalMs: 200,
    })

    const { onTransaction } = subscribe({ service })
    await flushMicrotasks()

    expect(transactionQueries.listSettledTransactionsAfter).not.toHaveBeenCalled()
    expect(mapTransactionStreamEvent).not.toHaveBeenCalled()
    expect(onTransaction).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(200)

    expect(transactionQueries.listSettledTransactionsAfter).toHaveBeenCalledWith({
      afterTransactionId: "661111111111111111111111",
      limit: 100,
    })
  })

  it("polls new transactions after replay", async () => {
    const replayTxn = createLedgerTransaction("661111111111111111111112")
    const liveTxn = createLedgerTransaction("661111111111111111111113")
    const transactionQueries: TransactionStreamQueries = {
      listSettledTransactionsAfter: jest
        .fn()
        .mockResolvedValueOnce([replayTxn])
        .mockResolvedValueOnce([liveTxn]),
      findLatestTransactionId: jest.fn(),
    }
    const mapTransactionStreamEvent = jest
      .fn()
      .mockImplementation(async (txn: TransactionStreamRecord) =>
        createEvent(txn._id.toString()),
      )
    const service = TransactionsStreamService({
      transactionQueries,
      mapTransactionStreamEvent,
      pollIntervalMs: 200,
    })

    const { onTransaction } = subscribe({
      service,
      afterTransactionId: "661111111111111111111111",
    })
    await flushMicrotasks()
    await jest.advanceTimersByTimeAsync(200)

    expect(onTransaction).toHaveBeenCalledTimes(2)
    expect(transactionQueries.listSettledTransactionsAfter).toHaveBeenNthCalledWith(2, {
      afterTransactionId: "661111111111111111111112",
      limit: 100,
    })
    expect(onTransaction).toHaveBeenNthCalledWith(
      2,
      createEvent("661111111111111111111113"),
    )
  })

  it("does not overlap polling cycles", async () => {
    const listSettledTransactionsAfter = jest.fn<
      Promise<TransactionStreamRecord[]>,
      [{ afterTransactionId: LedgerTransactionId; limit: number }]
    >()
    const findLatestTransactionId = jest
      .fn<Promise<LedgerTransactionId | undefined>, []>()
      .mockResolvedValue("661111111111111111111111" as LedgerTransactionId)
    const transactionQueries: TransactionStreamQueries = {
      listSettledTransactionsAfter,
      findLatestTransactionId,
    }
    let resolveFirstPoll: ((value: TransactionStreamRecord[]) => void) | undefined
    const firstPoll = new Promise<TransactionStreamRecord[]>((resolve) => {
      resolveFirstPoll = resolve
    })
    listSettledTransactionsAfter.mockImplementationOnce(() => firstPoll)
    listSettledTransactionsAfter.mockResolvedValueOnce([])

    const service = TransactionsStreamService({
      transactionQueries,
      mapTransactionStreamEvent: jest.fn(),
      pollIntervalMs: 200,
    })

    subscribe({ service })
    await flushMicrotasks()

    await jest.advanceTimersByTimeAsync(600)
    expect(transactionQueries.listSettledTransactionsAfter).toHaveBeenCalledTimes(1)

    expect(resolveFirstPoll).toBeDefined()
    resolveFirstPoll!([])
    await flushMicrotasks()
    await jest.advanceTimersByTimeAsync(200)

    expect(transactionQueries.listSettledTransactionsAfter).toHaveBeenCalledTimes(2)
  })

  it("stops polling when the subscription is closed", async () => {
    const transactionQueries: TransactionStreamQueries = {
      listSettledTransactionsAfter: jest.fn().mockResolvedValue([]),
      findLatestTransactionId: jest
        .fn()
        .mockResolvedValue("661111111111111111111111" as LedgerTransactionId),
    }
    const service = TransactionsStreamService({
      transactionQueries,
      mapTransactionStreamEvent: jest.fn(),
      pollIntervalMs: 200,
    })

    const { subscription } = subscribe({ service })
    await flushMicrotasks()
    await jest.advanceTimersByTimeAsync(200)

    expect(transactionQueries.listSettledTransactionsAfter).toHaveBeenCalledTimes(1)

    expect(subscription).not.toBeInstanceOf(Error)
    if (subscription instanceof Error) return

    subscription.close()
    await jest.advanceTimersByTimeAsync(400)

    expect(transactionQueries.listSettledTransactionsAfter).toHaveBeenCalledTimes(1)
  })
})
