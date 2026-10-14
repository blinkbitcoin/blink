#!/usr/bin/env bash
# Run one claimed workload on a pinned, private SSH Docker host.
set +x
set -euo pipefail
umask 077

# Remove credentials from every child environment, including validation tools.
private_key=${SSH_PRIVATE_KEY:-}
google_credentials=${GOOGLE_CREDENTIALS:-}
export -n private_key google_credentials
unset SSH_PRIVATE_KEY SSH_PUB_KEY GOOGLE_CREDENTIALS

fail() { echo "SSH Docker host task failed: $1" >&2; exit 1; }
relative_path() {
  [[ $1 =~ ^[A-Za-z0-9_.][A-Za-z0-9_./-]*$ && /$1/ != */../* ]]
}

repo=${REPO_PATH:-}
package=${PACKAGE_DIR-.}
command=${CMD:-}
if ! relative_path "$repo" || ! relative_path "$package"; then
  fail 'invalid workload path'
fi
[[ $command =~ [^[:space:]] && -d $repo ]] || fail 'missing workload input'
[[ -n $private_key && -n $google_credentials ]] || fail 'missing CI credentials'

# Validate before extracting: jq -r must not hide trailing newlines or coerce
# nonstrings. Only canonical RFC1918 IPv4 addresses are accepted.
jq -se '
  length == 1 and (.[0] |
  .transport == "ssh" and
  (.docker_host_name | type == "string" and test("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\z")) and
  (.ssh_host_key | type == "string" and test("^ssh-ed25519 [A-Za-z0-9+/]+={0,2}\\z")) and
  (.ssh_host | type == "string" and test("^(0|[1-9][0-9]{0,2})(\\.(0|[1-9][0-9]{0,2})){3}\\z") and
    (split(".") | map(tonumber) | all(. <= 255) and
      (.[0] == 10 or (.[0] == 172 and .[1] >= 16 and .[1] <= 31) or
       (.[0] == 192 and .[1] == 168)))))
' nix-host/metadata >/dev/null 2>&1 || fail 'invalid host metadata'
name=$(jq -r '.docker_host_name' nix-host/metadata)
host=$(jq -r '.ssh_host' nix-host/metadata)
key=$(jq -r '.ssh_host_key' nix-host/metadata)
tasks=$(cd -- "$(dirname -- "$0")" && pwd)
root=$(mktemp -d "${TMPDIR:-/tmp}/ssh-host-ci.XXXXXXXX")
run_dir=
active_pid=

# A background timeout lets Bash handle cancellation immediately while wait
# is interrupted. GNU timeout also bounds descendants after TERM with KILL.
bounded() {
  local duration=$1 status=0
  shift
  timeout --kill-after=15s "$duration" "$@" <&0 &
  active_pid=$!
  wait "$active_pid" || status=$?
  active_pid=
  return "$status"
}

# shellcheck disable=SC2317,SC2329 # Invoked by the EXIT trap.
cleanup() {
  local status=$?
  trap - EXIT
  trap '' HUP INT TERM
  if [[ -n $active_pid ]]; then
    kill -TERM "$active_pid" 2>/dev/null || true
    wait "$active_pid" 2>/dev/null || true
  fi
  if [[ -n $run_dir ]]; then
    if ! bounded 60s "${ssh[@]}" "bash -s -- $run_dir" < "$tasks/remote-nix-cleanup.sh"; then
      echo 'SSH Docker host cleanup failed; inspect host before reuse' >&2
      [[ $status != 0 ]] || status=1
    fi
  fi
  rm -rf -- "$root"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
trap 'exit 129' HUP

printf '%s\n' "$private_key" > "$root/key"
printf '%s\n' "$google_credentials" > "$root/google.json"
printf '%s %s\n' "$host" "$key" > "$root/known_hosts"
unset private_key google_credentials
export CLOUDSDK_CONFIG="$root/gcloud"
options=(ssh -i "$root/key" -o BatchMode=yes -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$root/known_hosts"
  -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3)
ssh=("${options[@]}" "ci@$host")

bounded 60s "${ssh[@]}" "bash -s -- $name" < "$tasks/remote-host-preflight.sh"
bounded 60s "${ssh[@]}" 'umask 077; mkdir -p .ci-run; mktemp -d .ci-run/run.XXXXXXXX' > "$root/run-dir"
candidate=$(cat "$root/run-dir")
[[ $candidate =~ ^\.ci-run/run\.[A-Za-z0-9]{8}$ ]] || fail 'invalid remote run directory'
run_dir=$candidate
bounded 60s "${ssh[@]}" 'docker ps -aq | xargs -r docker rm -fv'
# rsync parses -e with its own shell-like tokenizer, not Bash printf %q.
printf -v rsync_ssh '"%s" ' "${options[@]}"
# mktemp inherits TMPDIR: reject quotes/backslashes before rsync parses -e.
[[ $root != *[\"\\]* ]] || fail 'unsupported temporary directory'
bounded 300s rsync -avr --delete --exclude='buck-out/**' --exclude='**/node_modules/**' \
  --exclude='dev/.data/**' -e "$rsync_ssh" "$repo/" "ci@$host:$repo"
bounded 60s gcloud auth activate-service-account --key-file "$root/google.json" --quiet > /dev/null
bounded 60s gcloud auth print-access-token > "$root/token"
token=$(cat "$root/token")
[[ $token =~ [^[:space:]] ]] || fail 'no registry access token'
# Token stays on stdin; long-lived Google JSON never reaches the guest.
bounded 60s "${ssh[@]}" "docker --config $run_dir/docker login us.gcr.io --username oauth2accesstoken --password-stdin" <<< "$token" > /dev/null
unset token
printf -v remote_command 'bash -s -- %q %q %q %q' "$run_dir" "$repo" "$package" "$command"
bounded 2800s "${ssh[@]}" "$remote_command" < "$tasks/remote-nix-run.sh"
