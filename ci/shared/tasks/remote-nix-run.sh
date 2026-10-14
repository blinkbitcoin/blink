#!/usr/bin/env bash
# Executed as ci over the already authenticated, pinned SSH connection.
set -euo pipefail
run_dir="$HOME/$1"
export CI_RUN_DIR="$run_dir" REPO_PATH="$HOME/$2" PACKAGE_DIR="$3" CMD="$4"
export DOCKER_CONFIG="$run_dir/docker"
cat > "$run_dir/command.sh" <<'COMMAND'
#!/usr/bin/env bash
set +e
cd "$REPO_PATH/$PACKAGE_DIR" && timeout --foreground --kill-after=15s 45m nix develop -c bash -c "$CMD"
printf '%s\n' "$?" > "$CI_RUN_DIR/status"
# Keep the session leader alive until the supervising shell terminates the
# whole group, including any children left behind by the workload.
while :; do sleep 60; done
COMMAND
setsid bash "$run_dir/command.sh" > "$run_dir/log" 2>&1 < /dev/null &
runner=$!
printf '%s\n' "$runner" > "$run_dir/runner.pid"
# shellcheck disable=SC2329 # Invoked by the EXIT trap.
cleanup() {
  kill -TERM -- "-$runner" 2>/dev/null || true
  sleep 1
  kill -KILL -- "-$runner" 2>/dev/null || true
  wait "$runner" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 143' HUP INT TERM
tail -n +1 -f --pid="$runner" "$run_dir/log" &
while ! test -f "$run_dir/status"; do
  kill -0 "$runner"
  sleep 1
done
exit "$(cat "$run_dir/status")"
