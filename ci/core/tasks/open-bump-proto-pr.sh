#!/bin/bash

set -eu

cd repo

gh repo set-default $(git remote get-url origin)
gh pr close ${BOT_BRANCH} || true
git checkout ${BRANCH}
gh pr create \
  --title "chore(deps): bump ${PROTO_NAME} proto" \
  --body "" \
  --base ${BRANCH} \
  --head ${BOT_BRANCH} \
  --label blinkbitcoinbot || true
