#!/usr/bin/env python3
"""Run one claimed Blink CI workload on a pinned, private ZRH1 SSH host."""
import json
import os
from pathlib import Path
import re
import shlex
import signal
import subprocess
import tempfile


def require(condition, message):
    if not condition:
        raise ValueError(message)


def metadata(value):
    name = value.get("docker_host_name", "")
    require(value.get("transport") == "ssh", "Expected SSH pool metadata")
    require(re.fullmatch(r"zrh1-docker-host-0[1-4]-g[1-9][0-9]*", name), "Unexpected Docker host")
    key = value.get("ssh_host_key", "")
    require(re.fullmatch(r"ssh-ed25519 [A-Za-z0-9+/]+={0,2}", key), "Require a verified Ed25519 host key")
    return name, name + ".zrh1-docker-hosts.svc.cluster.local", key


def relative_path(value):
    require(bool(re.fullmatch(r"[A-Za-z0-9_.][A-Za-z0-9_./-]*", value)) and
            ".." not in value.split("/"), "Require a relative workload path without parent traversal")
    return value


def run(argv, *, capture=False, input=None, env=None, timeout=60):
    result = subprocess.run(argv, input=input, text=True, env=env, timeout=timeout,
                            stdout=subprocess.PIPE if capture else None, check=True)
    return result.stdout.strip() if capture else ""


def execute(environment, work=Path(".")):
    name, host, key = metadata(json.loads((work / "nix-host/metadata").read_text()))
    repo = relative_path(environment["REPO_PATH"])
    package = relative_path(environment.get("PACKAGE_DIR", "."))
    command = environment["CMD"]
    require(command.strip(), "Require a workload command")
    require((work / repo).is_dir(), "Missing repository input")
    require(environment.get("SSH_PRIVATE_KEY") and environment.get("GOOGLE_CREDENTIALS"), "Missing CI credentials")
    child_env = {k: v for k, v in environment.items() if k not in {"SSH_PRIVATE_KEY", "SSH_PUB_KEY", "GOOGLE_CREDENTIALS"}}
    with tempfile.TemporaryDirectory(prefix="zrh1-ci-") as tmp:
        root = Path(tmp)
        for filename, content in [("key", environment["SSH_PRIVATE_KEY"]),
                                  ("google.json", environment["GOOGLE_CREDENTIALS"]),
                                  ("known_hosts", f"{host} {key}\n")]:
            path = root / filename
            path.write_text(content + "\n")
            path.chmod(0o600)
        child_env["CLOUDSDK_CONFIG"] = str(root / "gcloud")
        options = ["ssh", "-i", str(root / "key"), "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes",
                   "-o", "StrictHostKeyChecking=yes", "-o", f"UserKnownHostsFile={root / 'known_hosts'}",
                   "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3"]
        ssh = options + ["ci@" + host]

        def remote(script, **kwargs):
            return run(ssh + [script], env=child_env, **kwargs)

        remote(f'test "$(hostname)" = {shlex.quote(name)} && test -f /var/lib/docker-host/ready && '
               'docker info >/dev/null && nix store ping --store daemon')
        run_dir = remote("umask 077; mkdir -p .ci-run; mktemp -d .ci-run/run.XXXXXXXX", capture=True)
        require(re.fullmatch(r"\.ci-run/run\.[A-Za-z0-9]{8}", run_dir), "Unexpected remote run directory")
        try:
            remote("docker ps -aq | xargs -r docker rm -fv")
            run(["rsync", "-avr", "--delete", "--exclude=buck-out/**", "--exclude=**/node_modules/**",
                 "--exclude=dev/.data/**", "-e", shlex.join(options), str(work / repo) + "/",
                 "ci@" + host + ":" + repo], env=child_env, timeout=300)
            run(["gcloud", "auth", "activate-service-account", "--key-file", str(root / "google.json"), "--quiet"],
                env=child_env, capture=True)
            token = run(["gcloud", "auth", "print-access-token"], env=child_env, capture=True)
            require(bool(token), "No registry access token returned")
            # Only the short-lived access token reaches the guest. A fresh config
            # prevents credentials from being left in the persistent CI home.
            remote(f"docker --config {shlex.quote(run_dir + '/docker')} login us.gcr.io "
                   "--username oauth2accesstoken --password-stdin", input=token + "\n", capture=True)
            script = Path(__file__).with_name("remote-nix-run.sh").read_text()
            remote("bash -s -- " + shlex.join([run_dir, repo, package, command]), input=script, timeout=2800)
        finally:
            # The process group is killed only if its leader still bears this
            # invocation's exact marker. Never kill an unrelated recycled PID.
            remote("bash -s -- " + shlex.quote(run_dir), input=r'''set -eu
run_dir=$1
if test -f "$run_dir/runner.pid"; then
  pid=$(cat "$run_dir/runner.pid")
  if [[ $pid =~ ^[1-9][0-9]*$ ]] && test -r "/proc/$pid/environ" &&
     tr '\0' '\n' < "/proc/$pid/environ" | grep -qxF "CI_RUN_DIR=$HOME/$run_dir"; then
    kill -TERM -- "-$pid" 2>/dev/null || true
  fi
fi
rm -rf -- "$run_dir/docker"
''')


def interrupted(signum, _frame):
    raise SystemExit(128 + signum)


def main():
    signal.signal(signal.SIGTERM, interrupted)
    try:
        execute(dict(os.environ))
    except (ValueError, KeyError, OSError, subprocess.SubprocessError) as error:
        # Never log the environment, token, private key, or subprocess input.
        print(f"ZRH1 task failed: {type(error).__name__}", flush=True)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
