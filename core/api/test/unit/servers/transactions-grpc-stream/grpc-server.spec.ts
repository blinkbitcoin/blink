import { EventEmitter } from "events"

jest.mock("@/app", () => ({
  TransactionsStream: {
    subscribeToTransactions: jest.fn(),
  },
}))

import { status } from "@grpc/grpc-js"

import { TransactionsGrpcServer } from "@/servers/transactions-grpc-stream/grpc-server"
import { SubscribeTransactionsRequest } from "@/servers/transactions-grpc-stream/proto/transactions_pb"

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
  satsAmount: 100,
  centsAmount: 200,
  currency: WalletCurrency.Btc,
  type: TransactionsStreamTransactionType.Received,
  settlementVia: TransactionsStreamSettlementVia.Lightning,
  pending: false,
  timestamp: new Date("2024-01-01T00:00:05Z"),
})

describe("TransactionsGrpcServer", () => {
  it("returns INVALID_ARGUMENT for malformed cursors", async () => {
    const transactionsStream = {
      subscribeToTransactions: jest.fn().mockResolvedValue(new Error("invalid cursor")),
    }
    const grpcServer = TransactionsGrpcServer({
      transactionsStream: transactionsStream as never,
    })
    const call = createCall("not-an-object-id")

    grpcServer.subscribeTransactions(call as never)
    await flushMicrotasks()

    expect(call.destroy).toHaveBeenCalledTimes(1)
    expect(call.destroy.mock.calls[0][0].code).toBe(status.INVALID_ARGUMENT)
    expect(transactionsStream.subscribeToTransactions).toHaveBeenCalledWith({
      afterTransactionId: "not-an-object-id",
      onTransaction: expect.any(Function),
      onError: expect.any(Function),
    })
  })

  it("returns INVALID_ARGUMENT for explicitly empty cursors", async () => {
    const transactionsStream = {
      subscribeToTransactions: jest.fn().mockResolvedValue(new Error("invalid cursor")),
    }
    const grpcServer = TransactionsGrpcServer({
      transactionsStream: transactionsStream as never,
    })
    const call = createCall("")

    grpcServer.subscribeTransactions(call as never)
    await flushMicrotasks()

    expect(call.destroy).toHaveBeenCalledTimes(1)
    expect(call.destroy.mock.calls[0][0].code).toBe(status.INVALID_ARGUMENT)
    expect(transactionsStream.subscribeToTransactions).toHaveBeenCalledWith({
      afterTransactionId: "",
      onTransaction: expect.any(Function),
      onError: expect.any(Function),
    })
  })

  it("maps domain events to grpc messages", async () => {
    const close = jest.fn()
    const transactionsStream = {
      subscribeToTransactions: jest.fn().mockImplementation(({ onTransaction }) => {
        onTransaction(createEvent())
        return { close }
      }),
    }
    const grpcServer = TransactionsGrpcServer({
      transactionsStream: transactionsStream as never,
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
    expect(call.write.mock.calls[0][0].getSatsAmount()).toBe(100)
    expect(call.write.mock.calls[0][0].getCentsAmount()).toBe(200)
    expect(call.write.mock.calls[0][0].getCurrency()).toBe(WalletCurrency.Btc)
    expect(call.write.mock.calls[0][0].getTimestamp()).toBe(1704067205)
    expect(close).not.toHaveBeenCalled()
  })

  it("replays transactions through grpc even if close fires during stream setup", async () => {
    const transactionsStream = {
      subscribeToTransactions: jest.fn().mockImplementation(({ onTransaction }) => {
        onTransaction(createEvent())
        return { close: jest.fn() }
      }),
    }
    const grpcServer = TransactionsGrpcServer({
      transactionsStream: transactionsStream as never,
    })
    const call = createCall("000000000000000000000000")

    grpcServer.subscribeTransactions(call as never)
    call.emit("close")
    await flushMicrotasks()

    expect(transactionsStream.subscribeToTransactions).toHaveBeenCalledWith({
      afterTransactionId: "000000000000000000000000",
      onTransaction: expect.any(Function),
      onError: expect.any(Function),
    })
    expect(call.write).toHaveBeenCalledTimes(1)
  })

  it("does not close the subscription on grpc close", async () => {
    const close = jest.fn()
    const transactionsStream = {
      subscribeToTransactions: jest.fn().mockResolvedValue({ close }),
    }
    const grpcServer = TransactionsGrpcServer({
      transactionsStream: transactionsStream as never,
    })
    const call = createCall("661111111111111111111110")

    grpcServer.subscribeTransactions(call as never)
    await flushMicrotasks()
    call.emit("close")

    expect(close).not.toHaveBeenCalled()
  })

  it("closes the subscription on client cancellation", async () => {
    const close = jest.fn()
    const transactionsStream = {
      subscribeToTransactions: jest.fn().mockResolvedValue({ close }),
    }
    const grpcServer = TransactionsGrpcServer({
      transactionsStream: transactionsStream as never,
    })
    const call = createCall("661111111111111111111110")

    grpcServer.subscribeTransactions(call as never)
    await flushMicrotasks()
    call.emit("cancelled")

    expect(close).toHaveBeenCalledTimes(1)
  })

  it("closes the subscription on grpc call errors", async () => {
    const close = jest.fn()
    const transactionsStream = {
      subscribeToTransactions: jest.fn().mockResolvedValue({ close }),
    }
    const grpcServer = TransactionsGrpcServer({
      transactionsStream: transactionsStream as never,
    })
    const call = createCall("661111111111111111111110")

    grpcServer.subscribeTransactions(call as never)
    await flushMicrotasks()
    call.emit("error", new Error("client stream failed"))

    expect(close).toHaveBeenCalledTimes(1)
  })

  it("destroys the grpc call on app stream errors", async () => {
    const close = jest.fn()
    const streamError = new Error("change stream failed")
    let onError: ((err: Error) => void) | undefined
    const transactionsStream = {
      subscribeToTransactions: jest.fn().mockImplementation(({ onError: handler }) => {
        onError = handler
        return Promise.resolve({ close })
      }),
    }
    const grpcServer = TransactionsGrpcServer({
      transactionsStream: transactionsStream as never,
      logger: { error: jest.fn() } as unknown as Logger,
    })
    const call = createCall("661111111111111111111110")

    grpcServer.subscribeTransactions(call as never)
    await flushMicrotasks()
    onError?.(streamError)

    expect(close).toHaveBeenCalledTimes(1)
    expect(call.destroy).toHaveBeenCalledWith(streamError)
  })

  it("waits for grpc drain when writes apply backpressure", async () => {
    let onTransactionResult: Promise<void> | undefined
    const transactionsStream = {
      subscribeToTransactions: jest.fn().mockImplementation(({ onTransaction }) => {
        onTransactionResult = onTransaction(createEvent())
        return { close: jest.fn() }
      }),
    }
    const grpcServer = TransactionsGrpcServer({
      transactionsStream: transactionsStream as never,
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

  it("closes the subscription when cancellation fires while waiting for drain", async () => {
    const close = jest.fn()
    const call = createCall("661111111111111111111110")
    call.write.mockReturnValueOnce(false)

    let onTransaction:
      | ((event: TransactionStreamEvent) => void | Promise<void>)
      | undefined
    let onTransactionResult: void | Promise<void> | undefined
    const transactionsStream = {
      subscribeToTransactions: jest
        .fn()
        .mockImplementation(({ onTransaction: handler }) => {
          onTransaction = handler
          onTransactionResult = handler(createEvent())
          call.emit("cancelled")
          return { close }
        }),
    }
    const grpcServer = TransactionsGrpcServer({
      transactionsStream: transactionsStream as never,
    })

    grpcServer.subscribeTransactions(call as never)
    await flushMicrotasks()
    await onTransactionResult
    await onTransaction?.(createEvent())

    expect(close).toHaveBeenCalledTimes(1)
    expect(call.write).toHaveBeenCalledTimes(1)
  })
})
