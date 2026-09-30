#!/bin/bash

set -e

cd repo

# CI tasks use isolated checkouts. Hash files instead of allocating
# inotify watches shared with every other container on the worker.
cat >> .buckconfig.local <<'EOF'

[buck2]
file_watcher = fs_hash_crawler
EOF

if [[ -z "${SSL_CERT_FILE}" ]]; then
  buck2 "${BUCK_CMD}" "${BUCK_TARGET}"
else
  buck2 "${BUCK_CMD}" "${BUCK_TARGET}" -- --env SSL_CERT_FILE="${SSL_CERT_FILE}"
fi
