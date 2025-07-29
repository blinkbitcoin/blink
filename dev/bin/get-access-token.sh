#!/bin/bash

set -e

# Show help if requested
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    cat << EOF
get-access-token.sh - Get OAuth2 access token for admin API

DESCRIPTION:
    Uses client credentials from .env.local to obtain an OAuth2 access token
    for authenticating with admin GraphQL APIs.

USAGE:
    $0 [--help|-h]

RELATED:
    Run dev/bin/setup-service.sh first to create the required credentials

REQUIREMENTS:
    - .env.local with ADMIN_API_CLIENT_ID and ADMIN_API_CLIENT_SECRET
    - Hydra public API running at http://localhost:4444

EOF
    exit 0
fi

# Check if .env.local exists
if [[ ! -f .env.local ]]; then
    echo "Error: .env.local file not found"
    echo "Run dev/bin/setup-service.sh first to create credentials"
    exit 1
fi

. ./.env.local

# Check if required variables are set
if [[ -z "$ADMIN_API_CLIENT_ID" || -z "$ADMIN_API_CLIENT_SECRET" ]]; then
    echo "Error: Missing ADMIN_API_CLIENT_ID or ADMIN_API_CLIENT_SECRET in .env.local"
    echo "Run dev/bin/setup-service.sh to create credentials"
    exit 1
fi

echo "Client ID: $ADMIN_API_CLIENT_ID"
echo "Client Secret: $ADMIN_API_CLIENT_SECRET"
echo ""

response=$(curl -s -w "HTTP_CODE:%{http_code}" -X POST http://localhost:4444/oauth2/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -u "$ADMIN_API_CLIENT_ID:$ADMIN_API_CLIENT_SECRET" \
  -d "grant_type=client_credentials&scope=editor")

# Extract HTTP code and body
http_code=$(echo "$response" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
response_body=$(echo "$response" | sed 's/HTTP_CODE:[0-9]*$//')

# Check if request was successful
if [[ "$http_code" != "200" ]]; then
    echo "Error: Failed to get access token (HTTP $http_code)"
    echo "Response: $response_body"
    exit 1
fi

# Extract and display access token
access_token=$(echo "$response_body" | jq -r '.access_token // empty')

if [[ -z "$access_token" ]]; then
    echo "Error: No access token in response"
    echo "Response: $response_body"
    exit 1
fi

echo "✓ Access token obtained successfully:"
echo "$access_token"
echo ""
echo "Usage example:"
echo "export admin_token=\"$access_token\""
echo ""
echo "# Search for Redis keys"
echo "curl -X POST http://localhost:4455/admin/graphql \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H \"Oauth2-Token: \$admin_token\" \\"
echo "  -d '{"
echo "    \"query\": \"query { redisKeysSearch(pattern: \\\"login_attempt_id:*\\\") }\""
echo "  }'"
echo ""
echo "# Remove a Redis key"
echo "curl -X POST http://localhost:4455/admin/graphql \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H \"Oauth2-Token: \$admin_token\" \\"
echo "  -d '{"
echo "    \"query\": \"mutation { redisKeyRemove(input: { key: \\\"login_attempt_id:+1234567890\\\" }) { success errors { message } } }\""
echo "  }'"


