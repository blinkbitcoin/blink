import { EventEmitter } from "events"

import { status } from "@grpc/grpc-js"

import { TransactionsGrpcServer } from "@/services/transactions-stream/grpc-server"
import { SubscribeTransactionsRequest } from "@/services/transactions-stream/proto/transactions_pb"

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
  await Promise.resolve()
  await Promise.resolve()
}

const createCall = (afterTransactionId?: string): MockCall => {
  const request = new SubscribeTransactionsRequest()
  if (afterTransactionId !== undefined) request.setAfterTransactionId(afterTransactionId)

  const call = new EventEmitter() as MockCall
  call.request = request
  call.write = jest.fn()
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

  it("maps domain events to grpc messages and closes the subscription", async () => {
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

    call.emit("close")

    expect(close).toHaveBeenCalledTimes(1)
  })
})
