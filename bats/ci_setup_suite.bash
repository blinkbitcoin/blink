#!/bin/bash

export REPO_ROOT=$(git rev-parse --show-toplevel)
source "${REPO_ROOT}/bats/helpers/_common.bash"

TILT_PID_FILE="${BATS_ROOT_DIR}/.tilt_pid"

setup_suite() {
  # A killed task leaves tilt and its stack running on the host; clear them before booting.
  pkill -x tilt || true
  timeout --kill-after=30 300 buck2 run //dev:down || true

  background buck2 run //dev:up -- --bats=True > "${REPO_ROOT}/bats/.e2e-tilt.log"
  echo $! > "$TILT_PID_FILE"
  await_notifications_is_up
  await_api_keys_is_up
  await_api_is_up
  await_pay_is_up
}

teardown_suite() {
  if [[ -f "$TILT_PID_FILE" ]]; then
    kill "$(cat "$TILT_PID_FILE")" > /dev/null || true
  fi

  # A slow dev:down must not turn a green suite into a timed-out build; the next run cleans the host anyway.
  rc=0
  timeout --kill-after=30 300 buck2 run //dev:down || rc=$?
  if [[ "$rc" -eq 124 || "$rc" -eq 137 ]]; then
    echo "teardown_suite: dev:down timed out after 5 minutes, ignoring"
  elif [[ "$rc" -ne 0 ]]; then
    echo "teardown_suite: dev:down exited with ${rc}, ignoring"
  fi
}

await_api_is_up() {
  api_is_up() {
    exec_graphql 'anon' 'globals'
    network="$(graphql_output '.data.globals.network')"
    [[ "${network}" = "regtest" ]] || exit 1
  }

  retry 360 2 api_is_up
}

await_pay_is_up() {
  pay_is_up() {
    curl localhost:3002 || exit 1
  }

  retry 360 2 pay_is_up
}

await_api_keys_is_up() {
  api_keys_is_up() {
    curl localhost:5397/auth/check || exit 1
  }

  retry 360 2 api_keys_is_up
}

await_notifications_is_up() {
  notifications_is_up() {
    nc -zv localhost 6685 || exit 1
  }

  retry 360 2 notifications_is_up
}
