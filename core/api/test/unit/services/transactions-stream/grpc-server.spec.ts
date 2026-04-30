import { EventEmitter } from "events"

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

import { status } from "@grpc/grpc-js"

import { TransactionsStreamService } from "@/services/transactions-stream"
import { TransactionsGrpcServer } from "@/services/transactions-stream/grpc-server"
import { SubscribeTransactionsRequest } from "@/services/transactions-stream/proto/transactions_pb"

import { LedgerTransactionType } from "@/domain/ledger"
import {
  TransactionsStreamSettlementVia,
  TransactionsStreamTransactionType,
} from "@/domain/transactions-stream"
import { WalletCurrency } from "@/domain/shared"

type MockCall = EventEmitter & {
  request: SubscribeTransactionsRequest
  write: jest.Mock
  destroy: jest.Mock
}

const flushMicrotasks = async () => {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

const createCall = (afterTransactionId?: string): MockCall => {
  const request = new SubscribeTransactionsRequest()
  if (afterTransactionId !== undefined) request.setAfterTransactionId(afterTransactionId)

  const call = new EventEmitter() as MockCall
  call.request = request
  call.write = jest.fn().mockReturnValue(true)
  call.destroy = jest.fn()

  return call
}

const createEvent = (): TransactionStreamEvent => ({
  ledgerTransactionId: "661111111111111111111111" as LedgerTransactionId,
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
  timestamp: new Date("2024-01-01T00:00:05Z"),
})

const createLedgerTransaction = (id: string): LedgerTransaction<WalletCurrency> =>
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
    timestamp: new Date("2024-01-01T00:00:05Z"),
    feeKnownInAdvance: false,
    fee: undefined,
    usd: undefined,
    feeUsd: undefined,
  }) as LedgerTransaction<WalletCurrency>

async function* ledgerTransactionGenerator(values: LedgerTransaction<WalletCurrency>[]) {
  for (const value of values) yield value
}

describe("TransactionsGrpcServer", () => {
  it("returns INVALID_ARGUMENT for malformed cursors", () => {
    const transactionsStreamService = {
      subscribeToTransactions: jest.fn().mockReturnValue(new Error("invalid cursor")),
    }
    const grpcServer = TransactionsGrpcServer({
      transactionsStreamService: transactionsStreamService as never,
    })
    const call = createCall("not-an-object-id")

    grpcServer.subscribeTransactions(call as never)

    expect(call.destroy).toHaveBeenCalledTimes(1)
    expect(call.destroy.mock.calls[0][0].code).toBe(status.INVALID_ARGUMENT)
    expect(transactionsStreamService.subscribeToTransactions).toHaveBeenCalledWith({
      afterTransactionId: "not-an-object-id",
      onTransaction: expect.any(Function),
      onError: expect.any(Function),
    })
  })

  it("returns INVALID_ARGUMENT for explicitly empty cursors", () => {
    const transactionsStreamService = {
      subscribeToTransactions: jest.fn().mockReturnValue(new Error("invalid cursor")),
    }
    const grpcServer = TransactionsGrpcServer({
      transactionsStreamService: transactionsStreamService as never,
    })
    const call = createCall("")

    grpcServer.subscribeTransactions(call as never)

    expect(call.destroy).toHaveBeenCalledTimes(1)
    expect(call.destroy.mock.calls[0][0].code).toBe(status.INVALID_ARGUMENT)
    expect(transactionsStreamService.subscribeToTransactions).toHaveBeenCalledWith({
      afterTransactionId: "",
      onTransaction: expect.any(Function),
      onError: expect.any(Function),
    })
  })

  it("maps domain events to grpc messages", async () => {
    const close = jest.fn()
    const transactionsStreamService = {
      subscribeToTransactions: jest.fn().mockImplementation(({ onTransaction }) => {
        onTransaction(createEvent())
        return { close }
      }),
    }
    const grpcServer = TransactionsGrpcServer({
      transactionsStreamService: transactionsStreamService as never,
    })
    const call = createCall("661111111111111111111110")

    grpcServer.subscribeTransactions(call as never)
    await flushMicrotasks()

    expect(call.write).toHaveBeenCalledTimes(1)
    expect(call.write.mock.calls[0][0].getLedgerTransactionId()).toBe(
      "661111111111111111111111",
    )
    expect(call.write.mock.calls[0][0].getWalletId()).toBe("wallet-1")
    expect(call.write.mock.calls[0][0].getAccountId()).toBe("account-1")
    expect(call.write.mock.calls[0][0].getPaymentHash()).toBe("payment-hash")
    expect(call.write.mock.calls[0][0].getPreimage()).toBe("preimage")
    expect(call.write.mock.calls[0][0].getSatsAmount()).toBe(100)
    expect(call.write.mock.calls[0][0].getCentsAmount()).toBe(200)
    expect(call.write.mock.calls[0][0].getCurrency()).toBe(WalletCurrency.Btc)
    expect(call.write.mock.calls[0][0].getTimestamp()).toBe(1704067205)
    expect(close).not.toHaveBeenCalled()
  })

  it("replays transactions through grpc even if close fires during stream setup", async () => {
    const ledgerTransaction = createLedgerTransaction("661111111111111111111111")
    const ledgerService = {
      streamSettledTransactions: jest
        .fn()
        .mockReturnValue(ledgerTransactionGenerator([ledgerTransaction])),
    }
    const mapTransactionStreamEvent = jest.fn().mockResolvedValue(createEvent())
    const transactionsStreamService = TransactionsStreamService({
      ledgerService,
      mapTransactionStreamEvent,
    })
    const grpcServer = TransactionsGrpcServer({ transactionsStreamService })
    const call = createCall("000000000000000000000000")

    grpcServer.subscribeTransactions(call as never)
    call.emit("close")
    await flushMicrotasks()

    expect(ledgerService.streamSettledTransactions).toHaveBeenCalledWith({
      afterTransactionId: "000000000000000000000000",
      signal: expect.any(AbortSignal),
    })
    expect(mapTransactionStreamEvent).toHaveBeenCalledWith(ledgerTransaction)
    expect(call.write).toHaveBeenCalledTimes(1)
  })

  it("does not close the subscription on grpc close", () => {
    const close = jest.fn()
    const transactionsStreamService = {
      subscribeToTransactions: jest.fn().mockReturnValue({ close }),
    }
    const grpcServer = TransactionsGrpcServer({
      transactionsStreamService: transactionsStreamService as never,
    })
    const call = createCall("661111111111111111111110")

    grpcServer.subscribeTransactions(call as never)
    call.emit("close")

    expect(close).not.toHaveBeenCalled()
  })

  it("closes the subscription on client cancellation", () => {
    const close = jest.fn()
    const transactionsStreamService = {
      subscribeToTransactions: jest.fn().mockReturnValue({ close }),
    }
    const grpcServer = TransactionsGrpcServer({
      transactionsStreamService: transactionsStreamService as never,
    })
    const call = createCall("661111111111111111111110")

    grpcServer.subscribeTransactions(call as never)
    call.emit("cancelled")

    expect(close).toHaveBeenCalledTimes(1)
  })

  it("closes the subscription on grpc call errors", () => {
    const close = jest.fn()
    const transactionsStreamService = {
      subscribeToTransactions: jest.fn().mockReturnValue({ close }),
    }
    const grpcServer = TransactionsGrpcServer({
      transactionsStreamService: transactionsStreamService as never,
    })
    const call = createCall("661111111111111111111110")

    grpcServer.subscribeTransactions(call as never)
    call.emit("error", new Error("client stream failed"))

    expect(close).toHaveBeenCalledTimes(1)
  })

  it("destroys the grpc call on service stream errors", () => {
    const close = jest.fn()
    const streamError = new Error("change stream failed")
    let onError: ((err: Error) => void) | undefined
    const transactionsStreamService = {
      subscribeToTransactions: jest.fn().mockImplementation(({ onError: handler }) => {
        onError = handler
        return { close }
      }),
    }
    const grpcServer = TransactionsGrpcServer({
      transactionsStreamService: transactionsStreamService as never,
      logger: { error: jest.fn() } as unknown as Logger,
    })
    const call = createCall("661111111111111111111110")

    grpcServer.subscribeTransactions(call as never)
    onError?.(streamError)

    expect(close).toHaveBeenCalledTimes(1)
    expect(call.destroy).toHaveBeenCalledWith(streamError)
  })

  it("waits for grpc drain when writes apply backpressure", async () => {
    let onTransactionResult: Promise<void> | undefined
    const transactionsStreamService = {
      subscribeToTransactions: jest.fn().mockImplementation(({ onTransaction }) => {
        onTransactionResult = onTransaction(createEvent())
        return { close: jest.fn() }
      }),
    }
    const grpcServer = TransactionsGrpcServer({
      transactionsStreamService: transactionsStreamService as never,
    })
    const call = createCall("661111111111111111111110")
    call.write.mockReturnValueOnce(false)

    grpcServer.subscribeTransactions(call as never)
    await flushMicrotasks()

    let didFinish = false
    onTransactionResult?.then(() => {
      didFinish = true
    })
    await flushMicrotasks()

    expect(call.write).toHaveBeenCalledTimes(1)
    expect(didFinish).toBe(false)

    call.emit("drain")
    await onTransactionResult

    expect(didFinish).toBe(true)
  })
})
