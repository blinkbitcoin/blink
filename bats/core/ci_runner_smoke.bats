#!/usr/bin/env bats

@test "ci runner environment is available" {
  echo "runner=$(hostname) user=$(id -un) pwd=$(pwd)"
  [[ -n "$(hostname)" ]]
  [[ -n "$(id -un)" ]]
  [[ -n "$(pwd)" ]]
}
