import json
import os
from pathlib import Path
import shlex
import signal
import subprocess
import shutil
import tempfile
import time
import unittest

TASKS = Path(__file__).resolve().parents[1] / "tasks"

# Fake network commands only; the Bash task, jq, timeout, traps and files run
# for real. No fixture can contact a guest, cloud account or registry.
STUB = r'''#!/usr/bin/env python3
import json, os, pathlib, sys, time
name = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
assert not any(k in os.environ for k in ("SSH_PRIVATE_KEY", "SSH_PUB_KEY", "GOOGLE_CREDENTIALS", "private_key", "google_credentials"))
body = sys.stdin.read() if name == "ssh" else ""
log = pathlib.Path(os.environ["CALLS"])
calls = log.read_text().splitlines() if log.exists() else []
index = len(calls)
if name == "ssh":
    key = pathlib.Path(args[args.index("-i") + 1])
    assert key.stat().st_mode & 0o777 == 0o600
    assert key.parent.stat().st_mode & 0o777 == 0o700
    assert (key.parent / "google.json").stat().st_mode & 0o777 == 0o600
    assert (key.parent / "known_hosts").stat().st_mode & 0o777 == 0o600
    assert "StrictHostKeyChecking=yes" in args
with log.open("a") as f:
    f.write(json.dumps({"name": name, "args": args, "input": body}) + "\n")
if str(index) in os.environ.get("FAIL", "").split(","):
    sys.exit(7)
if str(index) == os.environ.get("BLOCK"):
    pathlib.Path(os.environ["BLOCKED"]).write_text(str(os.getpid()))
    while True: time.sleep(1)
if name == "ssh" and "mktemp" in args[-1]:
    print(os.environ.get("DIRECTORY", ".ci-run/run.12345678"))
if name == "gcloud" and args[:2] == ["auth", "print-access-token"]:
    print(os.environ.get("TOKEN", "TOKEN-FIXTURE"))
'''


class Transport(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="ssh fixture ")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "repo").mkdir()
        (self.root / "nix-host").mkdir()
        (self.root / "tmp").mkdir()
        self.meta = {"transport": "ssh", "docker_host_name": "docker-host-01-g1", "ssh_host": "10.100.1.2", "ssh_host_key": "ssh-ed25519 AAAATEST"}
        self.metadata_file = self.root / "nix-host/metadata"
        self.metadata_file.write_text(json.dumps(self.meta))
        binary = self.root / "bin"
        binary.mkdir()
        for name in ["ssh", "rsync", "gcloud"]:
            path = binary / name
            path.write_text(STUB)
            path.chmod(0o755)
        self.log = self.root / "calls"
        self.env = dict(os.environ, PATH=str(binary) + ":" + os.environ["PATH"],
            TMPDIR=str(self.root / "tmp"), CALLS=str(self.log), BLOCKED=str(self.root / "blocked"),
            REPO_PATH="repo", CMD="echo ok", SSH_PRIVATE_KEY="PRIVATE-FIXTURE", SSH_PUB_KEY="PUBLIC-FIXTURE",
            GOOGLE_CREDENTIALS="GOOGLE-FIXTURE")
        for key in ["PACKAGE_DIR", "FAIL", "TOKEN", "DIRECTORY", "BLOCK"]:
            self.env.pop(key, None)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def invoke(self, **updates):
        self.log.unlink(missing_ok=True)
        result = subprocess.run(["bash", str(TASKS / "run-on-ssh-host.sh")], cwd=self.root,
            env=dict(self.env, **updates), capture_output=True, text=True, timeout=20)
        self.assertFalse(list((self.root / "tmp").iterdir()), "local credentials leaked")
        for secret in ["PRIVATE-FIXTURE", "GOOGLE-FIXTURE", "TOKEN-FIXTURE"]:
            self.assertNotIn(secret, result.stdout + result.stderr)
            self.assertNotIn(secret, json.dumps([c["args"] for c in self.calls()]))
        return result

    def test_success_pins_key_scopes_registry_and_removes_local_secrets(self):
        command = "printf '%s\n' \"quoted $value\"; echo $(literal)\nexit 0"
        result = self.invoke(CMD=command, PACKAGE_DIR="core/api")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        login = next(c for c in calls if "login us.gcr.io" in c["args"][-1])
        self.assertEqual(login["input"], "TOKEN-FIXTURE\n")
        self.assertIn(".ci-run/run.12345678/docker", login["args"][-1])
        self.assertEqual(calls[-1]["input"], (TASKS / "remote-nix-cleanup.sh").read_text())
        # Decode the actual SSH command with Bash, preserving multiline commands.
        decoded = subprocess.check_output(["bash", "-c", 'set -- ' + calls[-2]["args"][-1] + '; printf "%s\\0" "$@"'])
        self.assertEqual(decoded.decode().split("\0")[:-1], ["bash", "-s", "--", ".ci-run/run.12345678", "repo", "core/api", command])
        rsync = next(c for c in calls if c["name"] == "rsync")
        ssh_args = shlex.split(rsync["args"][rsync["args"].index("-e") + 1])
        self.assertEqual(ssh_args, ["ssh", *calls[0]["args"][:-2]])

    def test_every_external_failure_cleans_up_and_preserves_status(self):
        self.assertEqual(self.invoke().returncode, 0)
        count = len(self.calls())
        for index in range(count):
            with self.subTest(index=index):
                result = self.invoke(FAIL=str(index))
                self.assertEqual(result.returncode, 1 if index == count - 1 else 7, result.stderr)
                if 2 <= index < count - 1:
                    self.assertEqual(self.calls()[-1]["input"], (TASKS / "remote-nix-cleanup.sh").read_text())

    def test_cleanup_failure_preserves_workload_failure(self):
        result = self.invoke(FAIL="7,8")
        self.assertEqual(result.returncode, 7)
        self.assertIn("cleanup failed", result.stderr)

    def test_timeout_cleans_up(self):
        # Shorten only the workload deadline; exercise real GNU timeout.
        binary = self.root / "bin/timeout"
        binary.write_text("#!/bin/bash\n" +
            'if [[ $2 == 2800s ]]; then set -- "$1" 0.2s "${@:3}"; fi\n' +
            "exec " + shlex.quote(shutil.which("timeout")) + ' "$@"\n')
        binary.chmod(0o755)
        result = self.invoke(BLOCK="7")
        self.assertEqual(result.returncode, 124, result.stderr)
        self.assertEqual(self.calls()[-1]["input"], (TASKS / "remote-nix-cleanup.sh").read_text())
        with self.assertRaises(ProcessLookupError):
            os.kill(int((self.root / "blocked").read_text()), 0)

    def test_unsupported_temporary_path_cleans_up(self):
        for suffix in ['quote"', 'back\\slash']:
            directory = self.root / "tmp" / suffix
            directory.mkdir()
            self.log.unlink(missing_ok=True)
            result = subprocess.run(["bash", str(TASKS / "run-on-ssh-host.sh")], cwd=self.root,
                env=dict(self.env, TMPDIR=str(directory)), capture_output=True, text=True)
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertFalse(list(directory.iterdir()))
            self.assertEqual(self.calls()[-1]["input"], (TASKS / "remote-nix-cleanup.sh").read_text())
            directory.rmdir()

    def test_missing_token_and_bad_directory_fail_closed(self):
        self.assertNotEqual(self.invoke(TOKEN="").returncode, 0)
        self.assertEqual(self.calls()[-1]["input"], (TASKS / "remote-nix-cleanup.sh").read_text())
        for directory in ["/wrong", ".ci-run/run.12345678; touch escaped", "../run.12345678"]:
            self.assertNotEqual(self.invoke(DIRECTORY=directory).returncode, 0)
            self.assertEqual(len(self.calls()), 2)

    def test_reject_untrusted_metadata_and_paths(self):
        for changes in [{"transport": "gcp"}, {"docker_host_name": "invalid name"}, {"docker_host_name": "host\n"},
                        {"docker_host_name": "a" * 64}, {"ssh_host": "8.8.8.8"}, {"ssh_host": "127.0.0.1"},
                        {"ssh_host": "bad"}, {"ssh_host": "10.01.1.1"}, {"ssh_host": "10.0.0.256"},
                        {"ssh_host": "10.0.0.1\n"}, {"ssh_host": "172.32.0.1"}, {"ssh_host": "172.15.0.1"},
                        {"ssh_host": None}, {"ssh_host_key": "ssh-ed25519 key\nextra"}, {"ssh_host_key": "ssh-ed25519 key\n"}]:
            with self.subTest(changes=changes):
                self.metadata_file.write_text(json.dumps(dict(self.meta, **changes)))
                self.assertNotEqual(self.invoke().returncode, 0)
                self.assertEqual(self.calls(), [])
        for value in ["not JSON", "null", "[]", json.dumps(self.meta) + "\n" + json.dumps(self.meta)]:
            self.metadata_file.write_text(value)
            self.assertNotEqual(self.invoke().returncode, 0)
            self.assertEqual(self.calls(), [])
        self.metadata_file.write_text(json.dumps(self.meta))
        for path in ["/root", "../repo", "repo/../other", "-option", "a b", ""]:
            for field in ["REPO_PATH", "PACKAGE_DIR"]:
                self.assertNotEqual(self.invoke(**{field: path}).returncode, 0)
                self.assertEqual(self.calls(), [])
        for address in ["10.1.2.3", "172.16.1.2", "172.31.255.255", "192.168.1.2"]:
            self.metadata_file.write_text(json.dumps(dict(self.meta, ssh_host=address)))
            self.assertEqual(self.invoke().returncode, 0)

    def test_missing_inputs_refuse_before_remote_access(self):
        for update in [{"CMD": " "}, {"SSH_PRIVATE_KEY": ""}, {"GOOGLE_CREDENTIALS": ""}, {"REPO_PATH": "missing"}]:
            self.assertNotEqual(self.invoke(**update).returncode, 0)
            self.assertEqual(self.calls(), [])

    def test_cancellation_runs_cleanup_and_removes_secrets(self):
        for sig in [signal.SIGTERM, signal.SIGINT, signal.SIGHUP]:
            with self.subTest(signal=sig):
                self.log.unlink(missing_ok=True)
                blocked = self.root / "blocked"
                blocked.unlink(missing_ok=True)
                process = subprocess.Popen(["bash", str(TASKS / "run-on-ssh-host.sh")], cwd=self.root,
                    env=dict(self.env, BLOCK="7"), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                try:
                    deadline = time.monotonic() + 10
                    while not blocked.exists() and process.poll() is None and time.monotonic() < deadline:
                        time.sleep(0.02)
                    self.assertTrue(blocked.exists())
                    process.send_signal(sig)
                    _, stderr = process.communicate(timeout=10)
                    self.assertEqual(process.returncode, 128 + sig, stderr)
                    self.assertEqual(self.calls()[-1]["input"], (TASKS / "remote-nix-cleanup.sh").read_text())
                    self.assertFalse(list((self.root / "tmp").iterdir()))
                    with self.assertRaises(ProcessLookupError):
                        os.kill(int(blocked.read_text()), 0)
                finally:
                    if process.poll() is None:
                        process.kill()
                        process.communicate()

    def test_remote_cleanup_without_live_pid(self):
        run_dir = self.root / ".ci-run/run.12345678"
        run_dir.mkdir(parents=True)
        for pid in [None, "not-a-pid", "999999999"]:
            (run_dir / "docker").mkdir()
            (run_dir / "docker/config.json").write_text("fixture-token")
            if pid is not None:
                (run_dir / "runner.pid").write_text(pid)
            result = subprocess.run(["bash", str(TASKS / "remote-nix-cleanup.sh"), ".ci-run/run.12345678"],
                cwd=self.root, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse((run_dir / "docker").exists())

    def test_remote_cleanup_requires_matching_process_marker(self):
        if not Path("/proc").exists():
            self.skipTest("Remote cleanup fixture requires Linux")
        run_dir = self.root / ".ci-run/run.12345678"
        run_dir.mkdir(parents=True)
        for matching in [True, False]:
            with self.subTest(matching=matching):
                (run_dir / "docker").mkdir()
                (run_dir / "docker/config.json").write_text("fixture-token")
                process = subprocess.Popen(["setsid", "sleep", "300"],
                    env=dict(os.environ, CI_RUN_DIR=str(run_dir) if matching else "unrelated"))
                try:
                    deadline = time.monotonic() + 3
                    while os.getpgid(process.pid) != process.pid and time.monotonic() < deadline:
                        time.sleep(0.01)
                    (run_dir / "runner.pid").write_text(str(process.pid))
                    result = subprocess.run(["bash", str(TASKS / "remote-nix-cleanup.sh"), ".ci-run/run.12345678"],
                        text=True, cwd=self.root, env=dict(os.environ, HOME=str(self.root)), capture_output=True)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertFalse((run_dir / "docker").exists())
                    if matching:
                        self.assertEqual(process.wait(timeout=3), -15)
                    else:
                        self.assertIsNone(process.poll())
                finally:
                    if process.poll() is None:
                        process.terminate()
                    process.wait(timeout=3)


class Preflight(unittest.TestCase):
    def test_identity_services_canonical_storage_and_mount(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name, body in {
                "hostname": 'echo "$HOSTNAME_FIXTURE"', "docker": 'exit "$DOCKER_STATUS"',
                "nix": 'exit "$NIX_STATUS"', "containerd": 'printf "%s\\n" "$CONFIG"; exit "$CONTAINERD_STATUS"',
                "findmnt": 'echo "$MOUNT"',
            }.items():
                path = root / name
                path.write_text("#!/bin/bash\n" + body + "\n")
                path.chmod(0o755)
            # Keep the readiness check hermetic without requiring /var writes.
            env_file = root / "env.sh"
            env_file.write_text('test() { if [[ $* == "-f /var/lib/docker-host/ready" ]]; then [[ $READY == 1 ]]; else builtin test "$@"; fi; }\n')
            base = dict(os.environ, PATH=str(root) + ":" + os.environ["PATH"], BASH_ENV=str(env_file),
                HOSTNAME_FIXTURE="docker-host-01", READY="1", DOCKER_STATUS="0", NIX_STATUS="0", CONTAINERD_STATUS="0",
                CONFIG='version = 2\nroot = "/var/lib/docker-host/containerd"\n[grpc]\naddress = "fixture"',
                MOUNT="/var/lib/docker-host")
            cases = [({}, True), ({"CONFIG": "root = '/var/lib/docker-host/containerd'\n[grpc]"}, True),
                     ({"HOSTNAME_FIXTURE": "wrong"}, False), ({"READY": "0"}, False),
                     ({"DOCKER_STATUS": "1"}, False), ({"NIX_STATUS": "1"}, False),
                     ({"CONTAINERD_STATUS": "1"}, False), ({"MOUNT": "/"}, False),
                     ({"CONFIG": 'root = "/var/lib/containerd"'}, False), ({"CONFIG": ''}, False),
                     ({"CONFIG": '[plugin]\nroot = "/var/lib/docker-host/containerd"'}, False),
                     ({"CONFIG": 'root = "/var/lib/docker-host/containerd"\nroot = "/var/lib/containerd"'}, False)]
            for changes, expected in cases:
                with self.subTest(changes=changes):
                    result = subprocess.run(["bash", str(TASKS / "remote-host-preflight.sh"), "docker-host-01"],
                        env=dict(base, **changes), capture_output=True, text=True)
                    self.assertEqual(result.returncode == 0, expected, result.stderr)


class PoolBootstrap(unittest.TestCase):
    def test_empty_retry_members_and_dirty_checkout(self):
        if not shutil.which("git"):
            self.skipTest("Git fixture requires git")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = root / "pool-repo"
            repo.mkdir()
            def git(*args):
                return subprocess.check_output(["git", "-C", str(repo), *args], text=True, stderr=subprocess.DEVNULL)
            git("init", "-b", "fixture")
            git("config", "user.name", "Fixture")
            git("config", "user.email", "fixture@example.invalid")
            git("config", "commit.gpgsign", "false")
            (repo / "existing").write_text("preserve")
            git("add", "existing")
            git("commit", "-m", "fixture")
            def bootstrap():
                return subprocess.run(["bash", str(TASKS / "initialize-ssh-pool.sh")], cwd=root, capture_output=True, text=True)
            self.assertEqual(bootstrap().returncode, 0)
            head = git("rev-parse", "HEAD")
            self.assertEqual(bootstrap().returncode, 0)
            self.assertEqual(git("rev-parse", "HEAD"), head)
            (repo / "dirty").touch()
            self.assertNotEqual(bootstrap().returncode, 0)
            (repo / "dirty").unlink()
            member = repo / "zrh1-docker-hosts/unclaimed/member"
            member.write_text("metadata")
            git("add", str(member))
            git("commit", "-m", "existing member")
            self.assertNotEqual(bootstrap().returncode, 0)
            self.assertEqual(member.read_text(), "metadata")
            self.assertEqual((repo / "existing").read_text(), "preserve")


class Qualification(unittest.TestCase):
    def test_failure_does_not_publish_metadata(self):
        for code in [0, 1]:
            with self.subTest(code=code), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                (root / "qualified").mkdir()
                binary = root / "bin"
                binary.mkdir()
                task = root / "pipeline-tasks/ci/shared/tasks/run-on-ssh-host.sh"
                task.parent.mkdir(parents=True)
                task.write_text(f"exit {code}\n")
                for name, content in {"jq": "echo docker-host-01-g1"}.items():
                    path = binary / name
                    path.write_text("#!/bin/sh\n" + content + "\n")
                    path.chmod(0o755)
                result = subprocess.run(["bash", str(TASKS / "qualify-ssh-host.sh")], cwd=root,
                                        env=dict(os.environ, PATH=str(binary) + ":" + os.environ["PATH"], HOST_METADATA_JSON='{"fixture":true}'),
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode, code)
                self.assertEqual((root / "qualified/name").exists(), code == 0)
                self.assertEqual((root / "qualified/metadata").exists(), code == 0)


class Deployment(unittest.TestCase):
    def test_qualification_wrapper_validates_before_mutation(self):
        for target, fail, expected in [("wrong", "", []), ("zrh1-org", "validate-pipeline", ["validate-pipeline"]),
                                        ("zrh1-org", "", ["validate-pipeline", "set-pipeline", "unpause-pipeline"])]:
            with self.subTest(target=target, fail=fail), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                inventory = root / "inventory.yml"
                inventory.touch()
                for name, body in {"ytt": "echo 'jobs: []'", "fly": 'echo "$3" >> "$CALLS"; test "$3" != "$FAIL"'}.items():
                    path = root / name
                    path.write_text("#!/bin/sh\n" + body + "\n")
                    path.chmod(0o755)
                calls = root / "calls"
                result = subprocess.run(["bash", str(TASKS.parent / "repipe-qualification")], cwd=root,
                    env=dict(os.environ, PATH=str(root) + ":" + os.environ["PATH"], FLY_TARGET=target,
                             HOSTS_VALUES=str(inventory), PIPELINE_TASKS_BRANCH="fixture", CALLS=str(calls), FAIL=fail),
                    capture_output=True, text=True)
                self.assertEqual(result.returncode == 0, target == "zrh1-org" and not fail)
                self.assertEqual(calls.read_text().splitlines() if calls.exists() else [], expected)

    def test_both_entrypoints_dispatch_ssh_and_preserve_legacy(self):
        for pipeline in ["core", "apps"]:
            for transport in ["ssh", "gcp"]:
                with self.subTest(pipeline=pipeline, transport=transport), tempfile.TemporaryDirectory() as tmp:
                    root = Path(tmp)
                    marker = root / "called"
                    # Copy the actual entrypoint and stop at each transport boundary.
                    entry = root / "ci" / pipeline / "tasks/run-on-nix-host.sh"
                    entry.parent.mkdir(parents=True)
                    shutil.copyfile(TASKS.parents[1] / pipeline / "tasks/run-on-nix-host.sh", entry)
                    helper = root / "ci/shared/tasks/run-on-ssh-host.sh"
                    helper.parent.mkdir(parents=True)
                    helper.write_text('echo ssh > "$MARKER"; exit 0\n')
                    for name, body in {"jq": 'echo "$TRANSPORT"',
                                       "cat": 'echo gcp > "$MARKER"; exit 91', "gcloud": "exit 91"}.items():
                        path = root / name
                        path.write_text("#!/bin/sh\n" + body + "\n")
                        path.chmod(0o755)
                    result = subprocess.run(["bash", str(entry)], cwd=root,
                        env=dict(os.environ, PATH=str(root) + ":" + os.environ["PATH"], TRANSPORT=transport, MARKER=str(marker)),
                        capture_output=True, text=True)
                    self.assertEqual(marker.read_text().strip(), transport)
                    if transport == "ssh":
                        self.assertEqual(result.returncode, 0)


class RemoteRunner(unittest.TestCase):
    def test_success_failure_and_background_children_are_bounded(self):
        # Linux integration fixture exercises the actual remote supervisor with
        # fake Nix, not a mock of the supervisor's process and status handling.
        if not Path("/proc").exists():
            self.skipTest("Remote supervisor integration requires Linux /proc and setsid")
        for code in [0, 7]:
            with self.subTest(code=code), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                (root / "repo").mkdir()
                (root / ".ci-run/run.12345678").mkdir(parents=True)
                binary = root / "bin"
                binary.mkdir()
                nix = binary / "nix"
                nix.write_text('#!/bin/bash\nshift 2\nexec "$@"\n')
                nix.chmod(0o755)
                command = f"sleep 300 & echo $! > child.pid; echo fixture; exit {code}"
                result = subprocess.run(["bash", str(TASKS / "remote-nix-run.sh"), ".ci-run/run.12345678", "repo", ".", command],
                                        env=dict(os.environ, HOME=tmp, PATH=str(binary) + ":" + os.environ["PATH"]),
                                        capture_output=True, text=True, timeout=15)
                self.assertEqual(result.returncode, code, result.stderr)
                pid = (root / "repo/child.pid").read_text().strip()
                proc = Path("/proc") / pid / "stat"
                self.assertTrue(not proc.exists() or proc.read_text().split()[2] == "Z")


    def test_cancellation_kills_term_ignoring_children_and_missing_path_fails(self):
        if not Path("/proc").exists():
            self.skipTest("Remote supervisor integration requires Linux")
        for mode in ["cancel", "missing"]:
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                (root / "repo").mkdir()
                (root / ".ci-run/run.12345678").mkdir(parents=True)
                binary = root / "bin"
                binary.mkdir()
                nix = binary / "nix"
                nix.write_text('#!/bin/bash\nshift 2\nexec "$@"\n')
                nix.chmod(0o755)
                command = 'trap "" TERM; sleep 300 & echo $! > child.pid; while :; do sleep 1; done'
                proc = subprocess.Popen(["bash", str(TASKS / "remote-nix-run.sh"), ".ci-run/run.12345678", "repo",
                                         "." if mode == "cancel" else "missing", command],
                    env=dict(os.environ, HOME=tmp, PATH=str(binary) + ":" + os.environ["PATH"]),
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                try:
                    if mode == "cancel":
                        deadline = time.monotonic() + 5
                        while not (root / "repo/child.pid").exists() and time.monotonic() < deadline:
                            time.sleep(0.05)
                        self.assertTrue((root / "repo/child.pid").exists())
                        proc.terminate()
                    proc.communicate(timeout=10)
                    self.assertEqual(proc.returncode, 143 if mode == "cancel" else 1)
                    if mode == "cancel":
                        pid = (root / "repo/child.pid").read_text().strip()
                        stat = Path("/proc") / pid / "stat"
                        self.assertTrue(not stat.exists() or stat.read_text().split()[2] == "Z")
                finally:
                    if proc.poll() is None:
                        proc.kill()
                        proc.communicate()


if __name__ == "__main__":
    unittest.main()
