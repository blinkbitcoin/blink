#!/usr/bin/env bash
set -euo pipefail
run_dir=$1
[[ $run_dir =~ ^\.ci-run/run\.[A-Za-z0-9]{8}$ ]] || exit 1
# Kill only a leader with this invocation's marker, never a recycled PID.
if test -f "$run_dir/runner.pid"; then
  pid=$(cat "$run_dir/runner.pid")
  if [[ $pid =~ ^[1-9][0-9]*$ ]] && test -r "/proc/$pid/environ" &&
     tr '\0' '\n' < "/proc/$pid/environ" | grep -qxF "CI_RUN_DIR=$HOME/$run_dir"; then
    kill -TERM -- "-$pid" 2>/dev/null || true
  fi
fi
# Credential cleanup finishes before any directory is removed.
rm -rf -- "$run_dir/docker"
# Match ci/core/tasks/run-on-nix-host.sh: ls -dt | tail -n +5 keeps the four
# newest run directories. Never remove this attempt's directory here.
if compgen -G '.ci-run/run.*' >/dev/null; then
  kept=0
  # shellcheck disable=SC2012 # Same newest-first order as the GCP host prune; each name is checked before rm.
  ls -dt .ci-run/run.* | while IFS= read -r path; do
    [[ $path =~ ^\.ci-run/run\.[A-Za-z0-9]+$ ]] || continue
    [ -L "$path" ] && continue
    [ -d "$path" ] || continue
    kept=$((kept + 1))
    if [ "$kept" -ge 5 ] && [ "$path" != "$run_dir" ]; then
      rm -rf -- "$path"
    fi
  done
fi
