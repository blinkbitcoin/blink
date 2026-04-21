import { handleServerStreamingCall, Metadata, ServiceError, status } from "@grpc/grpc-js"

import { transactionStreamEventToGrpcTransactionEvent } from "./convert"
import { ITransactionsStreamServer } from "./proto/transactions_grpc_pb"
import { SubscribeTransactionsRequest, TransactionEvent } from "./proto/transactions_pb"

import {
  TransactionsStreamService,
  TransactionsStreamSubscription,
} from "@/services/transactions-stream"
import { baseLogger } from "@/services/logger"

const logger = baseLogger.child({ module: "transactions-grpc-stream" })

const toServiceError = ({
  code,
  message,
  details,
}: {
  code: status
  message: string
  details: string
}): ServiceError =>
  Object.assign(new Error(message), {
    code,
    details,
    metadata: new Metadata(),
  })

type TransactionsGrpcServerConfig = {
  transactionsStreamService?: ReturnType<typeof TransactionsStreamService>
  logger?: Logger
}

export const TransactionsGrpcServer = ({
  transactionsStreamService = TransactionsStreamService(),
  logger: serviceLogger = logger,
}: TransactionsGrpcServerConfig = {}): ITransactionsStreamServer => {
  const subscribeTransactions: handleServerStreamingCall<
    SubscribeTransactionsRequest,
    TransactionEvent
  > = (call) => {
    let isClosed = false
    const subscriptionRef: { current?: TransactionsStreamSubscription } = {}

    const cleanup = () => {
      if (isClosed) return
      isClosed = true
      subscriptionRef.current?.close()
    }

    const result = transactionsStreamService.subscribeToTransactions({
      afterTransactionId: call.request.getAfterTransactionId() || undefined,
      onTransaction: async (event) => {
        if (isClosed) return
        call.write(transactionStreamEventToGrpcTransactionEvent(event))
      },
      onError: (err) => {
        serviceLogger.error({ err }, "Failed to stream transactions")
        cleanup()
        call.destroy(err)
      },
    })

    if (result instanceof Error) {
      call.destroy(
        toServiceError({
          code: status.INVALID_ARGUMENT,
          message: "Invalid after_transaction_id",
          details: "after_transaction_id must be a valid Mongo ObjectId",
        }),
      )
      return
    }

    subscriptionRef.current = result

    call.on("cancelled", cleanup)
    call.on("close", cleanup)
    call.on("error", cleanup)
  }

  return { subscribeTransactions }
}
