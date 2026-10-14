#!/usr/bin/env bash
# One-time pool bootstrap. Existing members require an explicit recovery plan.
set -euo pipefail
cd pool-repo
test -z "$(git status --porcelain)"
existing=$(git ls-tree -r --name-only HEAD zrh1-docker-hosts)
while IFS= read -r path; do
  case "$path" in
    ''|zrh1-docker-hosts/claimed/.gitkeep|zrh1-docker-hosts/unclaimed/.gitkeep) ;;
    *) echo 'ZRH1 pool already has members; refuse bootstrap.' >&2; exit 1 ;;
  esac
done <<< "$existing"
for path in zrh1-docker-hosts zrh1-docker-hosts/claimed zrh1-docker-hosts/unclaimed zrh1-docker-hosts/claimed/.gitkeep zrh1-docker-hosts/unclaimed/.gitkeep; do
  test ! -L "$path"
done
mkdir -p zrh1-docker-hosts/{claimed,unclaimed}
touch zrh1-docker-hosts/{claimed,unclaimed}/.gitkeep
git add zrh1-docker-hosts/claimed/.gitkeep zrh1-docker-hosts/unclaimed/.gitkeep
if ! git diff --cached --quiet; then
  git -c user.name='CI Pool Resource' -c user.email=ci-pool@localhost \
    commit -m 'Initialize empty ZRH1 Docker host pool'
fi
