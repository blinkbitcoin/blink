"""Exercise the actual API task with a recording Buck executable."""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[4]
SCRIPT = ROOT / "ci/core/tasks/test-api.sh"
TARGETS = ["check-type", "check-yaml", "audit", "check-circular-dependencies",
           "check-lint", "unit-tests"]


class ApiTaskTest(unittest.TestCase):
    def run_task(self, fail_target="", ssl="", kill_code=0):
        with tempfile.TemporaryDirectory(prefix="api task ") as directory:
            root = Path(directory)
            (root / "repo").mkdir()
            bin_dir = root / "bin"
            bin_dir.mkdir()
            fake = bin_dir / "buck2"
            fake.write_text(
                "#!/usr/bin/env python3\n"
                "import json,os,sys\n"
                "with open(os.environ['CALL_LOG'], 'a') as f:\n"
                "    f.write(json.dumps(sys.argv[1:]) + '\\n')\n"
                "if sys.argv[1] == 'kill': sys.exit(int(os.environ['KILL_CODE']))\n"
                "if '//core/api:' + os.environ['FAIL_TARGET'] in sys.argv: sys.exit(32)\n"
            )
            fake.chmod(0o755)
            env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}",
                   "CALL_LOG": str(root / "calls"), "FAIL_TARGET": fail_target,
                   "KILL_CODE": str(kill_code)}
            env.pop("SSL_CERT_FILE", None)
            if ssl:
                env["SSL_CERT_FILE"] = ssl
            result = subprocess.run(["bash", str(SCRIPT)], cwd=root, env=env,
                                    capture_output=True, text=True, timeout=10)
            calls = [json.loads(line) for line in (root / "calls").read_text().splitlines()]
            self.assertTrue((root / "pnpm-store").is_dir())
            for call in calls[:-1]:
                self.assertEqual(call[:3], ["test", "-j", "2"])
                self.assertEqual(call[3:5], ["-c", f"workspace_pnpm.store_dir={root.resolve() / 'pnpm-store'}"])
                self.assertEqual(call[6:9], ["--", "--timeout", "600"])
                self.assertEqual(call[9:], ["--env", f"SSL_CERT_FILE={ssl}"] if ssl else [])
            self.assertEqual(calls[-1], ["kill"])
            return result, [call[5].split(":")[1] for call in calls[:-1]]

    def test_all_checks_pass_with_and_without_ssl(self):
        for ssl in ("", "/tmp/cert path/ca.pem"):
            with self.subTest(ssl=ssl):
                result, targets = self.run_task(ssl=ssl)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(targets, TARGETS)
                self.assertIn("Passed API unit-tests", result.stdout)

    def test_each_failure_stops_later_checks_and_keeps_failure_status(self):
        for index, target in enumerate(TARGETS):
            with self.subTest(target=target):
                result, targets = self.run_task(fail_target=target, kill_code=9)
                self.assertEqual(result.returncode, 32, result.stderr)
                self.assertEqual(targets, TARGETS[:index + 1])
                self.assertNotIn(f"Passed API {target}", result.stdout)

    def test_cleanup_failure_does_not_turn_success_into_failure(self):
        result, _ = self.run_task(kill_code=9)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_runner_keeps_every_existing_suite_member(self):
        source = (ROOT / "core/api/BUCK").read_text()
        suite = re.search(r'test_suite\(\s*name = "test",\s*tests = \[(.*?)\]', source, re.S)
        self.assertIsNotNone(suite)
        members = re.findall(r'":([^"]+)"', suite.group(1))
        self.assertCountEqual(TARGETS, members)


if __name__ == "__main__":
    unittest.main()
