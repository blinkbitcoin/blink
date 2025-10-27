#!/bin/bash
set -e

echo "Loading development environment..."
DEV_DIR="$(dirname "$(dirname "$(readlink -f "${BASH_SOURCE[0]}" || realpath "${BASH_SOURCE[0]}")")")"

# Export environment variables from serve-env.json
while IFS='=' read -r key value; do
  export "$key=$value"
done < <(cat "${DEV_DIR}/core-bundle/serve-env.json" | jq -r 'to_entries | .[] | "\(.key)=\(.value)"')

# Check if the API is running
echo "Checking if core API is running..."
if ! curl -s http://localhost:4012/healthz > /dev/null 2>&1; then
  echo "❌ Core API is not running on port 4012"
  echo "Please start the development stack with: buck2 run dev:up"
  exit 1
fi

echo "✅ Core API is running"
echo ""
echo "Running dealer API key creation script..."
cd "${DEV_DIR}/../core/api"
pnpm tsx src/debug/dealer-api-key.ts
