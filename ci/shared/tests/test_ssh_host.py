import importlib.util
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import shutil
import tempfile
import time
import unittest
from unittest.mock import patch
from types import SimpleNamespace

TASKS = Path(__file__).resolve().parents[1] / "tasks"
spec = importlib.util.spec_from_file_location("ssh_host", TASKS / "run-on-ssh-host.py")
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


class Transport(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "repo").mkdir()
        (self.root / "nix-host").mkdir()
        self.meta = {"transport": "ssh", "docker_host_name": "zrh1-docker-host-01-g1", "ssh_host": "10.100.1.2", "ssh_host_key": "ssh-ed25519 AAAATEST"}
        (self.root / "nix-host/metadata").write_text(json.dumps(self.meta))
        self.env = dict(os.environ, REPO_PATH="repo", CMD="echo ok", SSH_PRIVATE_KEY="PRIVATE-FIXTURE", GOOGLE_CREDENTIALS="GOOGLE-FIXTURE")
        self.calls = []
        self.secret_files = []

    def simulate(self, fail=None, token="TOKEN-FIXTURE", directory=".ci-run/run.12345678"):
        def invoke(argv, **kwargs):
            index = len(self.calls)
            self.calls.append((argv, kwargs))
            self.assertNotIn("SSH_PRIVATE_KEY", kwargs["env"])
            self.assertNotIn("GOOGLE_CREDENTIALS", kwargs["env"])
            if argv[0] == "ssh":
                key = Path(argv[argv.index("-i") + 1])
                self.secret_files.append(key)
                self.assertEqual(key.stat().st_mode & 0o777, 0o600)
                self.assertIn("StrictHostKeyChecking=yes", argv)
            if fail == index:
                raise subprocess.CalledProcessError(1, argv)
            if argv[0] == "ssh" and "mktemp" in argv[-1]:
                return directory
            if argv[:3] == ["gcloud", "auth", "print-access-token"]:
                return token
            return ""
        with patch.object(host, "run", side_effect=invoke):
            host.execute(self.env, self.root)

    def test_success_pins_key_scopes_registry_and_removes_local_secrets(self):
        self.simulate()
        serialized = json.dumps([c[0] for c in self.calls])
        for secret in ["PRIVATE-FIXTURE", "GOOGLE-FIXTURE", "TOKEN-FIXTURE"]:
            self.assertNotIn(secret, serialized)
        login = next(c for c in self.calls if "login us.gcr.io" in c[0][-1])
        self.assertEqual(login[1]["input"], "TOKEN-FIXTURE\n")
        self.assertIn(".ci-run/run.12345678/docker", login[0][-1])
        self.assertIn('rm -rf -- "$run_dir/docker"', self.calls[-1][1]["input"])
        self.assertTrue(all(not p.exists() for p in self.secret_files))

    def test_every_external_failure_cleans_up(self):
        self.simulate()
        count = len(self.calls)
        for index in range(count):
            with self.subTest(index=index):
                self.calls = []
                with self.assertRaises(subprocess.CalledProcessError):
                    self.simulate(fail=index)
                if 2 <= index < count - 1:
                    self.assertIn('rm -rf -- "$run_dir/docker"', self.calls[-1][1]["input"])
                self.assertTrue(all(not p.exists() for p in self.secret_files))

    def test_missing_token_and_bad_directory_fail_closed(self):
        with self.assertRaises(ValueError):
            self.simulate(token="")
        self.assertIn('rm -rf -- "$run_dir/docker"', self.calls[-1][1]["input"])
        self.calls = []
        with self.assertRaises(ValueError):
            self.simulate(directory="/wrong")
        self.assertEqual(len(self.calls), 2)

    def test_reject_untrusted_metadata_and_paths(self):
        for changes in [{"transport": "gcp"}, {"docker_host_name": "invalid name"}, {"ssh_host": "8.8.8.8"}, {"ssh_host": "127.0.0.1"}, {"ssh_host": "bad"}, {"ssh_host_key": "ssh-ed25519 key\nextra"}]:
            with self.assertRaises(ValueError):
                host.metadata(dict(self.meta, **changes))
        for path in ["/root", "../repo", "repo/../other", "-option", "a b", ""]:
            with self.assertRaises(ValueError):
                host.relative_path(path)
        self.assertEqual(host.relative_path("core/api"), "core/api")
        for address in ["10.1.2.3", "172.16.1.2", "192.168.1.2"]:
            self.assertEqual(host.metadata(dict(self.meta, ssh_host=address))[1], address)

    def test_missing_inputs_refuse_before_remote_access(self):
        for update in [{"CMD": " "}, {"SSH_PRIVATE_KEY": ""}, {"GOOGLE_CREDENTIALS": ""}, {"REPO_PATH": "missing"}]:
            original = self.env.copy()
            self.env.update(update)
            with self.assertRaises(ValueError):
                self.simulate()
            self.assertEqual(self.calls, [])
            self.env = original

    def test_process_adapter_and_entrypoint(self):
        with patch.object(host.subprocess, "run", return_value=SimpleNamespace(stdout=" output \n")):
            self.assertEqual(host.run(["fixture"], capture=True), "output")
            self.assertEqual(host.run(["fixture"]), "")
        with patch.object(host, "execute"), patch.object(host.signal, "signal"):
            host.main()
        with patch.object(host, "execute", side_effect=ValueError("PRIVATE-FIXTURE")), patch.object(host.signal, "signal"):
            output = io.StringIO()
            with contextlib.redirect_stdout(output), self.assertRaises(SystemExit) as raised:
                host.main()
            self.assertEqual(raised.exception.code, 1)
            self.assertNotIn("PRIVATE-FIXTURE", output.getvalue())
        with self.assertRaises(SystemExit) as raised:
            host.interrupted(15, None)
        self.assertEqual(raised.exception.code, 143)


    def test_remote_cleanup_requires_matching_process_marker(self):
        if not Path("/proc").exists():
            self.skipTest("Remote cleanup fixture requires Linux")
        self.simulate()
        script = self.calls[-1][1]["input"]
        run_dir = self.root / ".ci-run/run.12345678"
        run_dir.mkdir(parents=True)
        for matching in [True, False]:
            with self.subTest(matching=matching):
                (run_dir / "docker").mkdir()
                (run_dir / "docker/config.json").write_text("fixture-token")
                process = subprocess.Popen(["setsid", "sleep", "300"],
                    env=dict(os.environ, CI_RUN_DIR=str(run_dir) if matching else "unrelated"))
                try:
                    # Wait for setsid to establish its process group before cleanup.
                    deadline = time.monotonic() + 3
                    while os.getpgid(process.pid) != process.pid and time.monotonic() < deadline:
                        time.sleep(0.01)
                    (run_dir / "runner.pid").write_text(str(process.pid))
                    result = subprocess.run(["bash", "-s", "--", ".ci-run/run.12345678"], input=script,
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
                for name, content in {"python3": f"exit {code}", "jq": "echo zrh1-docker-host-01-g1"}.items():
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
                    # Stop immediately at the dispatch boundary in each path.
                    for name, body in {"jq": 'echo "$TRANSPORT"', "python3": 'echo ssh > "$MARKER"; exit 0',
                                       "cat": 'echo gcp > "$MARKER"; exit 91', "gcloud": "exit 91"}.items():
                        path = root / name
                        path.write_text("#!/bin/sh\n" + body + "\n")
                        path.chmod(0o755)
                    result = subprocess.run(["bash", str(TASKS.parents[1] / pipeline / "tasks/run-on-nix-host.sh")], cwd=root,
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
