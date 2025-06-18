#!/bin/bash
set -e

DEV_DIR="$(dirname "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")")"
source "${DEV_DIR}/helpers/cli.sh"

# Create dev-medium-queue if not exist
QUEUE_NAME="dev-medium-queue"
INTERVAL=30

EXISTING_QUEUE=$(bria_cli list-payout-queues | jq -c ".PayoutQueues[] | select(.name == \"$QUEUE_NAME\")")
if [[ -n "$EXISTING_QUEUE" ]]; then
  echo "Queue '$QUEUE_NAME' already exists."
else
  echo "Creating queue '$QUEUE_NAME'..."
  bria_cli create-payout-queue -n "$QUEUE_NAME" --interval-trigger "$INTERVAL"
fi

# Create dev-slow-queue if not exist
QUEUE_NAME="dev-slow-queue"
INTERVAL=60

EXISTING_QUEUE=$(bria_cli list-payout-queues | jq -c ".PayoutQueues[] | select(.name == \"$QUEUE_NAME\")")
if [[ -n "$EXISTING_QUEUE" ]]; then
  echo "Queue '$QUEUE_NAME' already exists."
else
  echo "Creating queue '$QUEUE_NAME'..."
  bria_cli create-payout-queue -n "$QUEUE_NAME" --interval-trigger "$INTERVAL"
fi

# Validations
echo "Verifying that 'dev-medium-queue' and 'dev-slow-queue' queues exist..."

MISSING=()

if ! bria_cli list-payout-queues | jq -e '.PayoutQueues[] | select(.name == "dev-medium-queue")' > /dev/null; then
  MISSING+=("dev-medium-queue")
fi

if ! bria_cli list-payout-queues | jq -e '.PayoutQueues[] | select(.name == "dev-slow-queue")' > /dev/null; then
  MISSING+=("dev-slow-queue")
fi

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "The following queues are missing:"
  for NAME in "${MISSING[@]}"; do
    echo " - $NAME"
  done
  exit 1
fi

echo "All required payout queues are present and ready."
