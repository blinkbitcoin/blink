jest.mock("@/services/ledger", () => ({
  LedgerService: jest.fn(() => ({
    streamSettledTransactions: jest.fn(),
  })),
}))

jest.mock("@/services/ledger/schema", () => ({
  TransactionMetadata: {
    findById: jest.fn(),
  },
}))

jest.mock("@/services/mongoose/schema", () => ({
  WalletInvoice: {
    findById: jest.fn(),
  },
}))

jest.mock("@/services/mongoose/wallets", () => ({
  WalletsRepository: jest.fn(),
}))

import { TransactionsStreamService } from "@/services/transactions-stream"

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
  preimage: "preimage",
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
    const ledgerService = {
      streamSettledTransactions: jest.fn(),
    }
    const service = TransactionsStreamService({
      ledgerService,
      mapTransactionStreamEvent: jest.fn(),
    })

    const { subscription } = subscribe({
      service,
      afterTransactionId: "not-an-object-id",
    })

    expect(subscription).toBeInstanceOf(Error)
    expect(ledgerService.streamSettledTransactions).not.toHaveBeenCalled()
  })

  it("returns an error for explicitly empty cursors", () => {
    const ledgerService = {
      streamSettledTransactions: jest.fn(),
    }
    const service = TransactionsStreamService({
      ledgerService,
      mapTransactionStreamEvent: jest.fn(),
    })

    const { subscription } = subscribe({
      service,
      afterTransactionId: "",
    })

    expect(subscription).toBeInstanceOf(Error)
    expect(ledgerService.streamSettledTransactions).not.toHaveBeenCalled()
  })

  it("streams translated ledger transactions from the ledger service", async () => {
    const replayTxn = createLedgerTransaction("661111111111111111111112")
    const liveTxn = createLedgerTransaction("661111111111111111111113")
    const ledgerService = {
      streamSettledTransactions: jest
        .fn()
        .mockReturnValue(ledgerTransactionGenerator([replayTxn, liveTxn])),
    }
    const mapTransactionStreamEvent = jest
      .fn()
      .mockImplementation(async (txn: LedgerTransaction<WalletCurrency>) =>
        createEvent(txn.id),
      )
    const service = TransactionsStreamService({
      ledgerService,
      mapTransactionStreamEvent,
    })

    const { onTransaction, onError } = subscribe({
      service,
      afterTransactionId: "661111111111111111111111",
    })
    await flushMicrotasks()

    expect(ledgerService.streamSettledTransactions).toHaveBeenCalledTimes(1)
    expect(ledgerService.streamSettledTransactions).toHaveBeenCalledWith({
      afterTransactionId: "661111111111111111111111",
      signal: expect.any(AbortSignal),
    })
    expect(mapTransactionStreamEvent).toHaveBeenNthCalledWith(1, replayTxn)
    expect(mapTransactionStreamEvent).toHaveBeenNthCalledWith(2, liveTxn)
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

  it("starts at the ledger service live stream when no cursor is provided", async () => {
    const ledgerService = {
      streamSettledTransactions: jest
        .fn()
        .mockReturnValue(ledgerTransactionGenerator([])),
    }
    const service = TransactionsStreamService({
      ledgerService,
      mapTransactionStreamEvent: jest.fn(),
    })

    const { onTransaction } = subscribe({ service })
    await flushMicrotasks()

    expect(ledgerService.streamSettledTransactions).toHaveBeenCalledWith({
      afterTransactionId: undefined,
      signal: expect.any(AbortSignal),
    })
    expect(onTransaction).not.toHaveBeenCalled()
  })

  it("does not emit when the mapper skips a ledger transaction", async () => {
    const ledgerTransaction = createLedgerTransaction("661111111111111111111112")
    const ledgerService = {
      streamSettledTransactions: jest
        .fn()
        .mockReturnValue(ledgerTransactionGenerator([ledgerTransaction])),
    }
    const service = TransactionsStreamService({
      ledgerService,
      mapTransactionStreamEvent: jest.fn().mockResolvedValue(undefined),
    })

    const { onTransaction, onError } = subscribe({ service })
    await flushMicrotasks()

    expect(onTransaction).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it("surfaces ledger errors from the stream", async () => {
    const ledgerError = new UnknownLedgerError("stream failed")
    const ledgerService = {
      streamSettledTransactions: jest
        .fn()
        .mockReturnValue(ledgerTransactionGenerator([ledgerError])),
    }
    const service = TransactionsStreamService({
      ledgerService,
      mapTransactionStreamEvent: jest.fn(),
      logger: { error: jest.fn() } as unknown as Logger,
    })

    const { onError } = subscribe({ service })
    await flushMicrotasks()

    expect(onError).toHaveBeenCalledWith(ledgerError)
  })

  it("surfaces mapper errors from the stream", async () => {
    const ledgerTransaction = createLedgerTransaction("661111111111111111111112")
    const mapperError = new Error("wallet lookup failed")
    const ledgerService = {
      streamSettledTransactions: jest
        .fn()
        .mockReturnValue(ledgerTransactionGenerator([ledgerTransaction])),
    }
    const service = TransactionsStreamService({
      ledgerService,
      mapTransactionStreamEvent: jest.fn().mockRejectedValue(mapperError),
      logger: { error: jest.fn() } as unknown as Logger,
    })

    const { onTransaction, onError } = subscribe({ service })
    await flushMicrotasks()

    expect(onTransaction).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(mapperError)
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
    const service = TransactionsStreamService({
      ledgerService,
      mapTransactionStreamEvent: jest.fn(),
    })

    const { subscription } = subscribe({ service })
    await flushMicrotasks()

    expect(subscription).not.toBeInstanceOf(Error)
    if (subscription instanceof Error) return

    subscription.close()
    await flushMicrotasks()

    expect(streamSignal?.aborted).toBe(true)
  })
})
