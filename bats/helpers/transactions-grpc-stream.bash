CURRENT_FILE=${BASH_SOURCE:-bats/helpers/.}
source "$(dirname "$CURRENT_FILE")/_common.bash"

export TRANSACTIONS_GRPC_STREAM_ADDRESS="${TRANSACTIONS_GRPC_STREAM_ADDRESS:-localhost:50053}"
export TRANSACTIONS_GRPC_STREAM_HEALTH_URL="${TRANSACTIONS_GRPC_STREAM_HEALTH_URL:-http://localhost:8889/healthz}"
export TRANSACTIONS_GRPC_STREAM_PROTO_IMPORT_PATH="${REPO_ROOT}/core/api/src/services/transactions-stream/proto"
export TRANSACTIONS_GRPC_STREAM_PROTO_FILE="transactions.proto"
export TRANSACTIONS_GRPC_STREAM_SERVICE_METHOD="services.transactions.v1.TransactionsStream/SubscribeTransactions"

transactions_grpc_stream_request() {
  local data="${1:-""}"
  shift || true

  grpcurl_request \
    "${TRANSACTIONS_GRPC_STREAM_PROTO_IMPORT_PATH}" \
    "${TRANSACTIONS_GRPC_STREAM_PROTO_FILE}" \
    "${TRANSACTIONS_GRPC_STREAM_ADDRESS}" \
    "${TRANSACTIONS_GRPC_STREAM_SERVICE_METHOD}" \
    "${data}" \
    "$@"
}

transactions_grpc_stream_is_up() {
  curl -fsS "${TRANSACTIONS_GRPC_STREAM_HEALTH_URL}" > /dev/null
}
