#!/usr/bin/env bash
# This gate runs before the pool resource release, even when the task fails.
set -euo pipefail
transport=$(jq -er '.transport // "gcp"' nix-host/metadata)
if [[ $transport == ssh ]]; then
  if ! cmp -s nix-host/metadata host-cleanup/metadata; then
    echo 'SSH host quarantined: cleanup unconfirmed; retain claim for operator recovery' >&2
    exit 1
  fi
elif [[ $transport != gcp ]]; then
  echo 'Unknown host transport; retain claim' >&2
  exit 1
fi
