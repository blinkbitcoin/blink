import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "buck-task.sh"


class BuckTaskTest(unittest.TestCase):
    def run_task(self, certificate=None, exit_code=0, existing_config=""):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo = root / "repo"
            repo.mkdir()
            if existing_config:
                (repo / ".buckconfig.local").write_text(existing_config)
            binary = root / "buck2"
            binary.write_text(
                "#!/usr/bin/env python3\n"
                "import json, os, pathlib, sys\n"
                "pathlib.Path('../invocation.json').write_text(json.dumps({\n"
                " 'args': sys.argv[1:], 'cwd': str(pathlib.Path.cwd()),\n"
                " 'config': pathlib.Path('.buckconfig.local').read_text()}))\n"
                "sys.exit(int(os.environ['TEST_EXIT']))\n"
            )
            binary.chmod(0o755)
            env = dict(os.environ, PATH=f"{root}:{os.environ['PATH']}",
                       BUCK_CMD="test", BUCK_TARGET="//apps/pay:test",
                       TEST_EXIT=str(exit_code))
            env.pop("SSL_CERT_FILE", None)
            if certificate is not None:
                env["SSL_CERT_FILE"] = certificate
            result = subprocess.run(["bash", str(SCRIPT)], cwd=root, env=env,
                                    capture_output=True, text=True)
            invocation = json.loads((root / "invocation.json").read_text())
            self.assertEqual(invocation["cwd"], str(repo.resolve()))
            self.assertTrue(invocation["config"].startswith(existing_config))
            self.assertIn("[buck2]\nfile_watcher = fs_hash_crawler\n", invocation["config"])
            return result.returncode, invocation["args"]

    def test_no_certificate(self):
        self.assertEqual(self.run_task(), (0, ["test", "//apps/pay:test"]))

    def test_empty_certificate(self):
        self.assertEqual(self.run_task(certificate=""),
                         (0, ["test", "//apps/pay:test"]))

    def test_certificate_and_existing_config(self):
        self.assertEqual(
            self.run_task(certificate="/cert bundle.pem", existing_config="[other]\nvalue = preserved\n"),
            (0, ["test", "//apps/pay:test", "--", "--env", "SSL_CERT_FILE=/cert bundle.pem"]),
        )

    def test_failure_propagates(self):
        for certificate in (None, "/cert.pem"):
            with self.subTest(certificate=certificate):
                self.assertEqual(self.run_task(certificate=certificate, exit_code=42)[0], 42)

    def test_config_write_failure_stops_before_buck(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "repo" / ".buckconfig.local").mkdir(parents=True)
            binary = root / "buck2"
            binary.write_text("#!/bin/sh\ntouch ../unexpected-invocation\n")
            binary.chmod(0o755)
            env = dict(os.environ, PATH=f"{root}:{os.environ['PATH']}",
                       BUCK_CMD="test", BUCK_TARGET="//apps/pay:test")
            result = subprocess.run(["bash", str(SCRIPT)], cwd=root, env=env,
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((root / "unexpected-invocation").exists())


if __name__ == "__main__":
    unittest.main()
