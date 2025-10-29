#!/bin/bash

set -e

# Source helper scripts
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/helpers.sh"

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
TOKEN_NAME="dealer"

# Use login_user helper function
login_user "${TOKEN_NAME}" "${DEALER_PHONE}" "000000"

echo "✅ Successfully logged in"
echo ""

# Step 2: Create API key via GraphQL using gql helper
echo "🔑 Creating API key via GraphQL..."
variables="{\"input\": {\"name\": \"${API_KEY_NAME}\", \"expireInDays\": ${API_KEY_EXPIRE_DAYS}, \"scopes\": [\"READ\", \"WRITE\", \"RECEIVE\"]}}"

# Call exec_graphql and capture the result in $output
exec_graphql "${TOKEN_NAME}" 'api-key-create' "${variables}"

# Debug: show the full response
echo "Full GraphQL Response:"
echo "$output" | jq '.' 2>/dev/null || echo "$output"
echo ""

# Parse the response which is now in $output
api_key_response="$output"

# Check for errors
errors=$(echo "$api_key_response" | jq -r '.errors // empty' 2>/dev/null)
if [ -n "$errors" ] && [ "$errors" != "null" ] && [ "$errors" != "" ]; then
  echo "❌ GraphQL Error:"
  echo "$api_key_response" | jq '.errors' 2>/dev/null || echo "$errors"
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
