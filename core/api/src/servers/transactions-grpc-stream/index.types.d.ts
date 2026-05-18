type TransactionsGrpcServiceErrorArgs = {
  code: import("@grpc/grpc-js").status
  message: string
  details: string
}

type TransactionsStreamSubscriptionRef = {
  current?: TransactionsStreamSubscription
}

type TransactionsGrpcServerConfig = {
  transactionsStream?: Pick<
    typeof import("@/app/transactions-stream"),
    "subscribeToTransactions"
  >
  logger?: Logger
}
