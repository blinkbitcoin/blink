type TransactionsGrpcServiceErrorArgs = {
  code: import("@grpc/grpc-js").status
  message: string
  details: string
}

type TransactionsStreamSubscriptionRef = {
  current?: TransactionsStreamSubscription
}

type TransactionsGrpcServerConfig = {
  transactionsStream?: ReturnType<
    typeof import("@/app/transactions-stream").TransactionsStream
  >
  logger?: Logger
}
