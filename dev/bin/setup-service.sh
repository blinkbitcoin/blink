#!/bin/bash

set -e

REPO_ROOT=$(git rev-parse --show-toplevel)

source ${REPO_ROOT}/dev/helpers/auth.sh

login_user "broker_token" "+16505554336" "000000"

HYDRA_ADMIN_API="http://localhost:4445" && \
client=$(curl -L -s -X POST $HYDRA_ADMIN_API/admin/clients \
-H 'Content-Type: application/json' \
-d '{ "grant_types": ["client_credentials"], "scope": "editor" }')
echo $client
client_id=$(echo $client | jq -r '.client_id')
client_secret=$(echo $client | jq -r '.client_secret')

cat <<EOF > .env.local
ADMIN_API_CLIENT_ID="$client_id"
ADMIN_API_CLIENT_SECRET="$client_secret"
EOF

echo "done"
