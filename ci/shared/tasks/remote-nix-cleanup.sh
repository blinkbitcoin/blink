#!/usr/bin/env bash
set -euo pipefail
run_dir=$1
# Kill only a leader with this invocation's marker, never a recycled PID.
if test -f "$run_dir/runner.pid"; then
  pid=$(cat "$run_dir/runner.pid")
  if [[ $pid =~ ^[1-9][0-9]*$ ]] && test -r "/proc/$pid/environ" &&
     tr '\0' '\n' < "/proc/$pid/environ" | grep -qxF "CI_RUN_DIR=$HOME/$run_dir"; then
    kill -TERM -- "-$pid" 2>/dev/null || true
  fi
fi
rm -rf -- "$run_dir/docker"
