#!/bin/bash

set -eu

export digest="$(cat ./edge-image/digest)"
export ref=$(cat ./repo/.git/short_ref)

# if SUBGRAPH_SRC is not an empty string, copy the subgraph from the source to the destination
if [[ -n "${SUBGRAPH_SRC}" ]]; then
  cp "./repo/${SUBGRAPH_SRC}" "./charts-repo/charts/galoy/apollo-router/${COMPONENT}-schema.graphql"
fi

pushd charts-repo

yq -i e "${YAML_PATH} = strenv(digest)" "./charts/${CHART}/values.yaml"

monorepo_subdir=$(grep "$digest" "./charts/${CHART}/values.yaml" | grep -o 'monorepo_subdir=[^;]*')
sed -i "s|\(${YAML_PATH##*.}: \"${digest}\"\).*\$|\1 # METADATA:: repository=https://github.com/blinkbitcoin/blink;commit_ref=${ref};app=${COMPONENT};${monorepo_subdir};|g" "./charts/${CHART}/values.yaml"


if [[ -z $(git config --global user.email) ]]; then
  git config --global user.email "202112752+blinkbitcoinbot@users.noreply.github.com"
fi
if [[ -z $(git config --global user.name) ]]; then
  git config --global user.name "blinkbitcoinbot"
fi

(
  cd "$(git rev-parse --show-toplevel)"
  git merge --no-edit "${BRANCH}"
  git add -A
  git status
  if git diff --cached --quiet; then
    echo "No chart changes to commit."
    exit 0
  else
    diff_status=$?
    if [[ "$diff_status" -ne 1 ]]; then
      exit "$diff_status"
    fi
  fi
  git commit -m "chore(deps): bump '${COMPONENT}' image to '${digest}'"
)
