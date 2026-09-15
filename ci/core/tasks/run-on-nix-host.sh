#!/bin/bash

set -eu

export PACKAGE_DIR="${PACKAGE_DIR:-.}"
export CI_ROOT=$(pwd)

host_name=$(cat nix-host/metadata | jq -r '.docker_host_name')
echo "Running on host: ${host_name}"
host_zone=$(cat nix-host/metadata | jq -r '.docker_host_zone')
gcp_project=$(cat nix-host/metadata | jq -r '.docker_host_project')

# stderr is kept on purpose: the host-side output is the evidence when a run misbehaves.
gcloud_ssh() {
  gcloud compute ssh "${host_name}" \
    --zone="${host_zone}" \
    --project="${gcp_project}" \
    --ssh-key-file="${CI_ROOT}/login.ssh" \
    --tunnel-through-iap \
    --command "$@"
}

# Report what the host looks like and remove leftover containers, stderr kept.
cleanup_host() {
  echo "Cleaning up ${host_name} before the run"
  gcloud_ssh "
    echo '--- previous run on this host, last 40 lines (if any)'
    tail -n 40 \$HOME/.ci-run/latest/log 2>/dev/null || true
    echo '--- containers before cleanup'
    docker ps -a
    echo '--- leftover processes (reported only)'
    pgrep -af '[t]ilt|[/]buck-out/v2/gen/|[r]un-stoppable-trigger|[b]ats-exec|[c]i_run.sh' || true
    docker ps -aq | xargs -r docker rm -fv || true
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

# Run detached: children left behind by tilt must not hold the ssh session open after the command exits.
# Each attempt gets its own directory, so a timed-out attempt still running cannot overwrite this one's status.
# Only the newest five attempts are kept on the host.
gcloud_ssh "
  mkdir -p \$HOME/.ci-run
  ls -dt \$HOME/.ci-run/run.* 2>/dev/null | tail -n +5 | xargs -r rm -rf
  run_dir=\$(mktemp -d \$HOME/.ci-run/run.XXXXXX)
  ln -sfn \$run_dir \$HOME/.ci-run/latest
  touch \$run_dir/log
  setsid -w bash -c '
    cd ${REPO_PATH} && cd ${PACKAGE_DIR} && nix develop -c ${CMD}
    echo \$? > '\$run_dir'/status
  ' > \$run_dir/log 2>&1 < /dev/null &
  runner=\$!
  tail -n +1 -f --pid=\$runner \$run_dir/log
  wait \$runner || true
  status=\$(cat \$run_dir/status 2>/dev/null)
  exit \${status:-1}
"
