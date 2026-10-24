"""Real child processes verify normal exits, signals, output, and env merging."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import runpy
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("run_npm_test.py")
spec = importlib.util.spec_from_file_location("run_npm_test", SCRIPT)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RunNpmTest(unittest.TestCase):
    def run_child(self, code, extra=None, env_file=None):
        with tempfile.TemporaryDirectory() as directory:
            args = ["--cwd", directory, "--bin", sys.executable]
            if env_file is not None:
                path = Path(directory, "env.json")
                path.write_text(json.dumps(env_file))
                args += ["--env-json", str(path)]
            args += ["--", "-c", code]
            env = {**os.environ, **(extra or {})}
            if not extra or "TEST" not in extra:
                env.pop("TEST", None)
            result = subprocess.run([sys.executable, str(SCRIPT), *args], env=env,
                                    capture_output=True, text=True, timeout=10)
            return result

    def test_success_preserves_streams_and_is_quiet(self):
        result = self.run_child("import sys; print('child output'); print('child error', file=sys.stderr)")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "child output\n")
        self.assertEqual(result.stderr, "child error\n")

    def test_failure_reports_status_without_arguments_or_secrets(self):
        result = self.run_child("import sys; secret = 'argument-secret'; sys.exit(7)",
                                {"SECRET": "environment-secret"})
        self.assertEqual(result.returncode, 7)
        self.assertRegex(result.stderr, r"exited with code 7 after \d+\.\d+s")
        self.assertNotIn("secret", result.stderr)

    def test_signals_report_name_number_and_normalized_exit(self):
        for sig in (signal.SIGKILL, signal.SIGTERM):
            with self.subTest(signal=sig):
                result = self.run_child(f"import os,signal; os.kill(os.getpid(), {sig.value})")
                self.assertEqual(result.returncode, 128 + sig.value)
                self.assertIn(f"terminated by {sig.name} ({sig.value})", result.stderr)

    def test_json_env_overrides_inherited_values_and_preserves_test_filter(self):
        result = self.run_child(
            "import os,sys; assert os.environ['VALUE'] == 'json'; "
            "assert os.environ['INHERITED'] == 'yes'; assert sys.argv[1:] == ['test filter']",
            {"VALUE": "outer", "INHERITED": "yes", "TEST": "test filter"},
            {"VALUE": "json"},
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_main_returns_status(self):
        # Exercise the importable entry point for branch coverage as well as the
        # real-process checks above (which prove actual signal semantics).
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory, "env.json")
            path.write_text('{"TEST": "filter"}')
            for code in (0, 7, -signal.SIGKILL, -999):
                for env_json in ([], ["--env-json", str(path)]):
                    with self.subTest(code=code, env_json=env_json), \
                         patch.dict(os.environ, {"TEST": ""}), \
                         patch.object(runner.subprocess, "call", return_value=code) as call, \
                         contextlib.redirect_stderr(io.StringIO()):
                        result = runner.main(["--cwd", directory, "--bin", sys.executable,
                                              *env_json, "--", "arg"])
                        self.assertEqual(result, code if code >= 0 else 128 - code)
                        self.assertEqual(call.call_args.args[0][-1], "filter" if env_json else "arg")

    def test_script_entry_point(self):
        with patch.object(sys, "argv", [str(SCRIPT), "--bin", sys.executable, "--", "-c", "pass"]), \
             patch.dict(os.environ, {"TEST": ""}), self.assertRaises(SystemExit) as result:
            runpy.run_path(str(SCRIPT), run_name="__main__")
        self.assertEqual(result.exception.code, 0)


if __name__ == "__main__":
    unittest.main()
