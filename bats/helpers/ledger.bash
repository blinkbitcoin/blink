CURRENT_FILE=${BASH_SOURCE:-bats/helpers/.}
source "$(dirname "$CURRENT_FILE")/_common.bash"
source "$(dirname "$CURRENT_FILE")/cli.bash"

METRICS_ENDPOINT="localhost:3003/metrics"

balance_for_check() {
  redis_cli FLUSHALL > /dev/null 2>&1 || true

  get_metric() {
    metric_name=$1

    retry 10 1 curl -s "$METRICS_ENDPOINT"
    curl -s "$METRICS_ENDPOINT" \
      | awk "/^$metric_name/ { print \$2 }"
  }

  lnd_balance_sync=$(get_metric "galoy_lndBalanceSync")
  is_number "$lnd_balance_sync" "lnd_balance_sync"
  abs_lnd_balance_sync=$(abs $lnd_balance_sync)

  assets_eq_liabilities=$(get_metric "galoy_assetsEqLiabilities")
  is_number "$assets_eq_liabilities" "assets_eq_liabilities"
  abs_assets_eq_liabilities=$(abs $assets_eq_liabilities)

  echo $(( $abs_lnd_balance_sync + $abs_assets_eq_liabilities ))
}

balance_for_check_is_zero() {
  [[ "$(balance_for_check)" == 0 ]]
}

# Wait for the exporter metrics used by the BATS accounting invariant to
# converge. Most tests use the default short window, while onchain settlement
# tests can pass a larger attempt count because Bria/LND/exporter updates are
# asynchronous on GitHub runners.
assert_balance_for_check() {
  local attempts=${1:-10}
  local delay=${2:-1}

  if retry "$attempts" "$delay" balance_for_check_is_zero; then
    return 0
  fi

  balance="$(balance_for_check)"
  fail "Error: balance_for_check failed ($balance)"
}
