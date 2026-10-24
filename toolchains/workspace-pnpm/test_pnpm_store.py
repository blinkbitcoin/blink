"""Check the real installers with a fake pnpm and a persistent download store."""
import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import sys
import tempfile
import unittest
from unittest.mock import patch


SCRIPTS = Path(__file__).parent


class PnpmStoreTest(unittest.TestCase):
    def test_installers_reuse_downloads_but_reinstall_with_a_frozen_lockfile(self):
        for script in ("build_node_modules.py", "build_workspace_node_modules.py"):
            for use_store in (False, True):
                for prod in ((False, True) if script == "build_node_modules.py" else (False,)):
                    with self.subTest(script=script, store=use_store, prod=prod), \
                         tempfile.TemporaryDirectory(prefix="pnpm store ") as directory:
                        root = Path(directory)
                        bin_dir = root / "bin"
                        bin_dir.mkdir()
                        fake = (
                            f"#!{sys.executable}\n"
                            "import json,os,pathlib,sys\n"
                            "args = sys.argv[1:]\n"
                            "if pathlib.Path(sys.argv[0]).name == 'turbo':\n"
                            "    out = pathlib.Path(args[args.index('--out-dir') + 1])\n"
                            "    (out / 'json').mkdir()\n"
                            "    (out / 'pnpm-lock.yaml').write_text('lockfileVersion: 9')\n"
                            "else:\n"
                            "    with open(os.environ['PNPM_CALLS'], 'a') as f:\n"
                            "        f.write(json.dumps(args) + '\\n')\n"
                            "    assert args[:2] == ['install', '--frozen-lockfile']\n"
                            "    if '--store-dir' in args:\n"
                            "        store = pathlib.Path(args[args.index('--store-dir') + 1])\n"
                            "        assert store.is_absolute()\n"
                            "        store.mkdir(exist_ok=True)\n"
                            "        (store / 'download').touch()\n"
                            "    pathlib.Path('node_modules').mkdir(exist_ok=True)\n"
                        )
                        for name in ("pnpm", "turbo"):
                            tool = bin_dir / name
                            tool.write_text(fake)
                            tool.chmod(0o755)
                        env = {"PATH": f"{bin_dir}:{os.environ['PATH']}", "PNPM_CALLS": str(root / "calls")}
                        for run in range(2):
                            out = root / f"out{run}/result"
                            if script == "build_node_modules.py":
                                args = ["--package-dir", "app", "--turbo-bin", str(bin_dir / "turbo")]
                                if prod:
                                    args += ["--prod-only"]
                            else:
                                args = ["--root-dir", str(root)]
                            if use_store:
                                args += ["--store-dir", str(root / "cache")]
                            args += [str(out)]
                            with patch.dict(os.environ, env), patch.object(sys, "argv", [script, *args]), \
                                 contextlib.redirect_stderr(io.StringIO()), \
                                 self.assertRaises(SystemExit) as exit_result:
                                runpy.run_path(str(SCRIPTS / script), run_name="__main__")
                            self.assertEqual(exit_result.exception.code, 0)
                            self.assertTrue((out / "node_modules").is_dir())
                        calls = [json.loads(line) for line in (root / "calls").read_text().splitlines()]
                        expected = ["install", "--frozen-lockfile"]
                        if use_store:
                            expected += ["--store-dir", str(root / "cache"), "--prefer-offline"]
                        if prod:
                            expected += ["--prod"]
                        self.assertEqual(calls, [expected, expected])
                        self.assertEqual((root / "cache/download").exists(), use_store)


if __name__ == "__main__":
    unittest.main()
