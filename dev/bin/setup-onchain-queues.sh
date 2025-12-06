#!/bin/bash
set -euo pipefail

DEV_DIR="$(dirname "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")")"
source "${DEV_DIR}/helpers/cli.sh"

# Configuration: Name -> "Interval Priority"
declare -A QUEUE_CONFIGS=(
  ["dev-medium-queue"]="15 half-hour"
  ["dev-slow-queue"]="30 one-hour"
)

fetch_current_queues() {
  bria_cli list-payout-queues
}

queue_exists_in_json() {
  local name="$1"
  local json="$2"
  jq -e --arg name "$name" '.PayoutQueues[] | select(.name == $name)' <<< "$json" >/dev/null 2>&1
}

create_queue() {
  local name="$1"
  local interval="$2"
  local priority="$3"

  printf 'Creating queue "%s" (Interval: %s, Priority: %s)...\n' "$name" "$interval" "$priority"
  bria_cli create-payout-queue -n "$name" --interval-trigger "$interval" --tx-priority "$priority"
}

main() {
  echo "Checking payout queues configuration..."

  local current_queues=$(fetch_current_queues)

  for name in "${!QUEUE_CONFIGS[@]}"; do
    read -r interval priority <<< "${QUEUE_CONFIGS[$name]}"
    if queue_exists_in_json "$name" "$current_queues"; then
      printf 'Queue "%s" already exists.\n' "$name"
      continue
    fi
    create_queue "$name" "$interval" "$priority"
  done

  echo "Verifying final state..."
  local final_state
  final_state=$(fetch_current_queues)
  local missing=()

  for name in "${!QUEUE_CONFIGS[@]}"; do
    if ! queue_exists_in_json "$name" "$final_state"; then
      missing+=("$name")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    printf 'Error: The following queues failed to initialize:\n' >&2
    printf ' - %s\n' "${missing[@]}" >&2
    exit 1
  fi

  echo "All required payout queues are present and ready."
}

main "$@"
