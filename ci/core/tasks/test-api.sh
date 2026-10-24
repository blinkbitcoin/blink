#!/usr/bin/env bash

set -euo pipefail

# Only cache pnpm's content-addressed downloads. Frozen-lockfile installs still
# construct fresh node_modules for this revision and runtime.
mkdir -p pnpm-store
store_dir="$(cd pnpm-store && pwd)"
cd repo
trap 'buck2 kill || true' EXIT

test_env=()
if [[ -n "${SSL_CERT_FILE:-}" ]]; then
  test_env=(--env "SSL_CERT_FILE=${SSL_CERT_FILE}")
fi

# Keep this list aligned with //core/api:test. Each invocation must finish
# successfully before we start the next, including dependency preparation.
# Type checking runs first without Jest or the full workspace install competing.
for target in check-type check-yaml audit check-circular-dependencies check-lint unit-tests; do
  started=$SECONDS
  echo "Starting API ${target}"
  # Buck's executor timeout bounds the test, while the Concourse task's 20m
  # timeout also bounds downloads, build actions, and the sum of all checks.
  buck2 test -j 2 -c "workspace_pnpm.store_dir=${store_dir}" \
    "//core/api:${target}" -- --timeout 600 "${test_env[@]}"
  echo "Passed API ${target} in $((SECONDS - started))s"
done
