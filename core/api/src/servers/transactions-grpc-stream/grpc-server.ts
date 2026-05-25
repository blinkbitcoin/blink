import { handleServerStreamingCall, Metadata, ServiceError, status } from "@grpc/grpc-js"

import { transactionStreamEventToGrpcTransactionEvent } from "./convert"
import { ITransactionsStreamServer } from "./proto/transactions_grpc_pb"
import { SubscribeTransactionsRequest, TransactionEvent } from "./proto/transactions_pb"

import { TransactionsStream } from "@/app"
import { baseLogger } from "@/services/logger"
import { wrapAsyncToRunInSpan } from "@/services/tracing"

const logger = baseLogger.child({ module: "transactions-grpc-stream" })

const requestAfterTransactionId = (request: SubscribeTransactionsRequest) =>
  request.hasAfterTransactionId() ? request.getAfterTransactionId() : undefined

const toServiceError = ({
  code,
  message,
  details,
}: TransactionsGrpcServiceErrorArgs): ServiceError =>
  Object.assign(new Error(message), {
    code,
    details,
    metadata: new Metadata(),
  })

export const TransactionsGrpcServer = ({
  transactionsStream = TransactionsStream,
  logger: serviceLogger = logger,
}: TransactionsGrpcServerConfig = {}): ITransactionsStreamServer => {
  const subscribeTransactions: handleServerStreamingCall<
    SubscribeTransactionsRequest,
    TransactionEvent
  > = wrapAsyncToRunInSpan({
    root: true,
    namespace: "servers.transactions-grpc-stream",
    fnName: "subscribeTransactions",
    fn: async (call) => {
      let isClosed = false
      const subscriptionRef: TransactionsStreamSubscriptionRef = {}

      const cleanup = () => {
        if (isClosed) return
        isClosed = true
        subscriptionRef.current?.close()
      }

      const waitForDrainOrTerminalEvent = () =>
        new Promise<void>((resolve) => {
          const finish = () => {
            call.removeListener("drain", onDrain)
            call.removeListener("cancelled", onTerminal)
            call.removeListener("error", onTerminal)
            resolve()
          }

          const onDrain = () => finish()
          const onTerminal = () => {
            cleanup()
            finish()
          }

          call.once("drain", onDrain)
          call.once("cancelled", onTerminal)
          call.once("error", onTerminal)
        })

      const result = await transactionsStream.subscribeToTransactions({
        afterTransactionId: requestAfterTransactionId(call.request),
        onTransaction: async (event) => {
          if (isClosed) return
          const canContinue = call.write(
            transactionStreamEventToGrpcTransactionEvent(event),
          )
          if (!canContinue && !isClosed) await waitForDrainOrTerminalEvent()
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

      if (isClosed) {
        result.close()
        return
      }

      subscriptionRef.current = result

      call.on("cancelled", cleanup)
      call.on("error", cleanup)
    },
  })

  return { subscribeTransactions }
}
