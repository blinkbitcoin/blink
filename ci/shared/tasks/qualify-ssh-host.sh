#!/usr/bin/env bash
set -euo pipefail
mkdir nix-host
printf '%s\n' "$HOST_METADATA_JSON" > nix-host/metadata
python3 pipeline-tasks/ci/shared/tasks/run-on-ssh-host.py
# Publish admission metadata only after SSH, Nix, Docker and registry checks pass.
cp nix-host/metadata qualified/metadata
jq -er '.docker_host_name' nix-host/metadata > qualified/name
