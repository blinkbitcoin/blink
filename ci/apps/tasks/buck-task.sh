#!/bin/bash

set -e

cd repo

trap 'buck2 kill || true' EXIT

runner_args=()
if [[ "${BUCK_CMD}" == "test" ]]; then
  # buck2's per-test default is 600s, which loaded CI workers exceed for tsc, eslint and jest
  runner_args+=(--timeout "${BUCK_TEST_TIMEOUT_SECS:-1200}")
fi
if [[ -n "${SSL_CERT_FILE}" ]]; then
  runner_args+=(--env SSL_CERT_FILE="${SSL_CERT_FILE}")
fi

if (( ${#runner_args[@]} )); then
  buck2 "${BUCK_CMD}" "${BUCK_TARGET}" -- "${runner_args[@]}"
else
  buck2 "${BUCK_CMD}" "${BUCK_TARGET}"
fi
