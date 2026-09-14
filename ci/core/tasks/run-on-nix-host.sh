#!/bin/bash

set -eu

export PACKAGE_DIR="${PACKAGE_DIR:-.}"
export CI_ROOT=$(pwd)

host_name=$(cat nix-host/metadata | jq -r '.docker_host_name')
echo "Running on host: ${host_name}"
host_zone=$(cat nix-host/metadata | jq -r '.docker_host_zone')
gcp_project=$(cat nix-host/metadata | jq -r '.docker_host_project')

gcloud_ssh() {
  gcloud compute ssh "${host_name}" \
    --zone="${host_zone}" \
    --project="${gcp_project}" \
    --ssh-key-file="${CI_ROOT}/login.ssh" \
    --tunnel-through-iap \
    --command "$@" 2> /dev/null
}

# Same as gcloud_ssh but keeps stderr: used where the output is the evidence.
gcloud_ssh_verbose() {
  gcloud compute ssh "${host_name}" \
    --zone="${host_zone}" \
    --project="${gcp_project}" \
    --ssh-key-file="${CI_ROOT}/login.ssh" \
    --tunnel-through-iap \
    --command "$@"
}

# Leave the host exactly as a fresh run expects it, and say what was there.
# A previous attempt killed by the task timeout leaves its whole session on
# the host (the runner below detaches it from ssh, so nothing dies with the
# connection): bats, tilt, the stoppable-trigger loop and the served binaries.
# A retry on top of them is meaningless, and a surviving bats would tear down
# the retry's stack. Kill that session first, then anything by name. The buck2
# daemon (buck2d) is deliberately left alone: it holds no ports or containers
# and restarting it costs minutes.
cleanup_host() {
  echo "Cleaning up ${host_name} before the run"
  gcloud_ssh_verbose "
    echo '--- previous run on this host, last 40 lines (if any)'
    tail -n 40 \$HOME/.ci-run.log 2>/dev/null || true
    echo '--- containers before cleanup'
    docker ps -a
    echo '--- leftover processes before cleanup'
    pgrep -af '[t]ilt|[/]buck-out/v2/gen/|[r]un-stoppable-trigger|[b]ats-exec|[c]i_run.sh' || true
    if [ -s \$HOME/.ci-run.sid ]; then
      sid=\$(cat \$HOME/.ci-run.sid)
      echo \"--- killing session \$sid of the previous run\"
      pkill -TERM -s \"\$sid\" || true
      sleep 3
      pkill -KILL -s \"\$sid\" || true
    fi
    pkill -f '[r]un-stoppable-trigger' || true
    pkill -x tilt || true
    pkill -f '[b]uck2 run' || true
    pkill -f '[/]buck-out/v2/gen/' || true
    pkill -f '[b]ats-exec|[c]i_run.sh' || true
    sleep 3
    pkill -KILL -x tilt || true
    pkill -KILL -f '[/]buck-out/v2/gen/|[r]un-stoppable-trigger|[b]ats-exec|[c]i_run.sh' || true
    docker ps -aq | xargs -r docker rm -fv
    rm -f ${REPO_PATH}/bats/.trigger_pid ${REPO_PATH}/bats/.stop_trigger ${REPO_PATH}/bats/.tilt_pid \$HOME/.ci-run.sid
    leftovers=\$(pgrep -af '[t]ilt|[/]buck-out/v2/gen/|[r]un-stoppable-trigger|[b]ats-exec|[c]i_run.sh' || true)
    if [ -n \"\$leftovers\" ] || [ -n \"\$(docker ps -aq)\" ]; then
      echo 'cleanup_host: host is still dirty after cleanup'
      echo \"\$leftovers\"
      docker ps -a
      exit 1
    fi
    echo '--- host clean'
  "
}

cat <<EOF > "${CI_ROOT}/gcloud-creds.json"
${GOOGLE_CREDENTIALS}
EOF
cat <<EOF > "${CI_ROOT}/login.ssh"
${SSH_PRIVATE_KEY}
EOF
chmod 600 "${CI_ROOT}/login.ssh"
cat <<EOF > "${CI_ROOT}/login.ssh.pub"
${SSH_PUB_KEY}
EOF
gcloud auth activate-service-account --key-file "${CI_ROOT}/gcloud-creds.json" 2> /dev/null

cleanup_host

login_user="sa_$(cat "${CI_ROOT}/gcloud-creds.json" | jq -r '.client_id')"

gcloud compute start-iap-tunnel "${host_name}" --zone="${host_zone}" --project="${gcp_project}" 22 --local-host-port=localhost:2222 &
tunnel_pid="$!"

# Retry loop with a 1-second sleep to wait for the rsync command to succeed
rsync_ready=false
for i in {1..30}; do
  rsync -avr --delete --exclude="buck-out/**" --exclude="**/node_modules/**" --exclude="dev/.data/**" \
    -e "ssh -o StrictHostKeyChecking=no -i ${CI_ROOT}/login.ssh -p 2222" \
    "${REPO_PATH}/" \
    "${login_user}@localhost:${REPO_PATH}" && {
    rsync_ready=true
    break
  } || {
    echo "rsync command failed, retrying in 1 second (attempt $i/30)..."
    sleep 1
  }
done

if [ "$rsync_ready" = false ]; then
  echo "rsync command failed after 30 attempts. Exiting."
  exit 1
fi

kill "${tunnel_pid}"

# Run the command detached from the ssh session: its own session (setsid),
# stdin from /dev/null, stdout/stderr into a file in \$HOME, outside the
# rsynced tree. tilt leaves background children behind; if they inherited the
# session's stdio the session would never close and the task would idle until
# its timeout even though the command has exited. The file is streamed with
# tail --pid, and the recorded status is what we return. The session id is
# written so the next cleanup_host can kill everything this run leaves.
gcloud_ssh_verbose "
  rm -f \$HOME/.ci-run.log \$HOME/.ci-run.status \$HOME/.ci-run.sid
  touch \$HOME/.ci-run.log
  setsid -w bash -c '
    echo \$\$ > \$HOME/.ci-run.sid
    cd ${REPO_PATH} && cd ${PACKAGE_DIR} && nix develop -c ${CMD}
    echo \$? > \$HOME/.ci-run.status
  ' > \$HOME/.ci-run.log 2>&1 < /dev/null &
  runner=\$!
  tail -n +1 -f --pid=\$runner \$HOME/.ci-run.log
  wait \$runner || true
  status=\$(cat \$HOME/.ci-run.status 2>/dev/null)
  exit \${status:-1}
"
