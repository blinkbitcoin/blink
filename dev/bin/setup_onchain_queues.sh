#!/bin/bash
set -e

DEV_DIR="$(dirname "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")")"
source "${DEV_DIR}/helpers/cli.sh"

# Create medium-priority if not exist
QUEUE_NAME="medium-priority"
INTERVAL=30

EXISTING_QUEUE=$(bria_cli list-payout-queues | jq -c ".PayoutQueues[] | select(.name == \"$QUEUE_NAME\")")
if [[ -n "$EXISTING_QUEUE" ]]; then
  echo "Queue '$QUEUE_NAME' already exists."
else
  echo "Creating queue '$QUEUE_NAME'..."
  bria_cli create-payout-queue -n "$QUEUE_NAME" --interval-trigger "$INTERVAL"
fi

# Create low-priority if not exist
QUEUE_NAME="low-priority"
INTERVAL=60

EXISTING_QUEUE=$(bria_cli list-payout-queues | jq -c ".PayoutQueues[] | select(.name == \"$QUEUE_NAME\")")
if [[ -n "$EXISTING_QUEUE" ]]; then
  echo "Queue '$QUEUE_NAME' already exists."
else
  echo "Creating queue '$QUEUE_NAME'..."
  bria_cli create-payout-queue -n "$QUEUE_NAME" --interval-trigger "$INTERVAL"
fi

# Validations
echo "Verifying that 'medium-priority' and 'low-priority' queues exist..."

MISSING=()

if ! bria_cli list-payout-queues | jq -e '.PayoutQueues[] | select(.name == "medium-priority")' > /dev/null; then
  MISSING+=("medium-priority")
fi

if ! bria_cli list-payout-queues | jq -e '.PayoutQueues[] | select(.name == "low-priority")' > /dev/null; then
  MISSING+=("low-priority")
fi

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "The following queues are missing:"
  for NAME in "${MISSING[@]}"; do
    echo " - $NAME"
  done
  exit 1
fi

echo "All required payout queues are present and ready."
