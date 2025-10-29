#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPERS_DIR="${SCRIPT_DIR}/../helpers"

# Source helper scripts
source "${HELPERS_DIR}/auth.sh"
source "${HELPERS_DIR}/gql.sh"

# Configuration
DEALER_PHONE="${DEALER_PHONE:-+16505554327}"
API_KEY_NAME="${API_KEY_NAME:-dealer-service-key}"
API_KEY_EXPIRE_DAYS="${API_KEY_EXPIRE_DAYS:-365}"

echo "🔐 Dealer API Key Creation Script"
echo "=================================="
echo "Phone: ${DEALER_PHONE}"
echo "API Key Name: ${API_KEY_NAME}"
echo "Expire in Days: ${API_KEY_EXPIRE_DAYS}"
echo ""

# Step 1: Login with dealer phone using auth helper
echo "📞 Logging in with dealer phone..."
auth_token=$(login_user "${DEALER_PHONE}")

if [ -z "$auth_token" ] || [ "$auth_token" == "null" ]; then
  echo "❌ Failed to login with phone ${DEALER_PHONE}"
  exit 1
fi

echo "✅ Successfully logged in"
echo ""

# Step 2: Create API key via GraphQL using gql helper
echo "🔑 Creating API key via GraphQL..."
variables="{\"input\": {\"name\": \"${API_KEY_NAME}\", \"expireInDays\": ${API_KEY_EXPIRE_DAYS}, \"scopes\": [\"READ\", \"WRITE\", \"RECEIVE\"]}}"
api_key_response=$(exec_graphql "${auth_token}" 'api-key-create' "${variables}")

# Check for errors
errors=$(echo "$api_key_response" | jq -r '.errors // empty')
if [ -n "$errors" ] && [ "$errors" != "null" ]; then
  echo "❌ GraphQL Error:"
  echo "$api_key_response" | jq '.errors'
  exit 1
fi

# Extract API key details
api_key_secret=$(echo "$api_key_response" | jq -r '.data.apiKeyCreate.apiKeySecret')
api_key_id=$(echo "$api_key_response" | jq -r '.data.apiKeyCreate.apiKey.id')
api_key_scopes=$(echo "$api_key_response" | jq -r '.data.apiKeyCreate.apiKey.scopes | join(", ")')
api_key_expires=$(echo "$api_key_response" | jq -r '.data.apiKeyCreate.apiKey.expiresAt')

if [ -z "$api_key_secret" ] || [ "$api_key_secret" == "null" ]; then
  echo "❌ Failed to create API key"
  echo "Response: $api_key_response"
  exit 1
fi

echo "✅ API Key created successfully!"
echo ""
echo "=================================="
echo "API Key Details:"
echo "=================================="
echo "Secret: ${api_key_secret}"
echo "ID: ${api_key_id}"
echo "Scopes: ${api_key_scopes}"
echo "Expires At: ${api_key_expires}"
echo "=================================="
echo ""
echo "💾 Save this secret securely - it won't be shown again!"
