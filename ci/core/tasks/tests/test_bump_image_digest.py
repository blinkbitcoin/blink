"""Run chart bumps against temporary Git repositories without network access."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


TASKS = Path(__file__).resolve().parents[1]
GIT = shutil.which("git")


class BumpImageDigestTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for directory in ("home", "bin", "repo/.git", "repo/subgraph",
                          "charts-repo/charts/galoy/apollo-router", "edge-image"):
            (self.root / directory).mkdir(parents=True)
        self.charts = self.root / "charts-repo"
        self.values = self.charts / "charts/galoy/values.yaml"
        self.schema = self.charts / "charts/galoy/apollo-router/notifications-schema.graphql"
        self.environment = {
            **{key: value for key, value in os.environ.items()
               if not key.startswith("GIT_")},
            "HOME": str(self.root / "home"),
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": str(self.root / "home/.gitconfig"),
            "PATH": f"{self.root / 'bin'}:{os.environ['PATH']}",
            "BRANCH": "main", "COMPONENT": "notifications", "CHART": "galoy",
            "YAML_PATH": ".galoy.images.notifications.digest",
            "SUBGRAPH_SRC": "subgraph/schema.graphql",
            "REAL_GIT": GIT,
            "REAL_SED": shutil.which("sed"),
        }
        (self.root / "repo/.git/short_ref").write_text("newref\n")
        (self.root / "edge-image/digest").write_text("sha256:new\n")
        (self.root / "repo/subgraph/schema.graphql").write_text("type Query { new: String }\n")
        self.values.write_text(
            'galoy:\n  images:\n    notifications:\n      digest: "sha256:new"'
            ' # METADATA:: repository=https://github.com/blinkbitcoin/blink;'
            'commit_ref=newref;app=notifications;monorepo_subdir=core/notifications;\n'
        )
        shutil.copyfile(self.root / "repo/subgraph/schema.graphql", self.schema)
        # Only YAML editing is stubbed; Git operations and sed use real executables.
        self.executable("yq", '''#!/usr/bin/env python3
import os, re, sys
from pathlib import Path
path = Path(sys.argv[-1])
path.write_text(re.sub(r'digest: "[^"]*"', 'digest: "' + os.environ["digest"] + '"', path.read_text()))
''')
        self.executable("sed", '''#!/usr/bin/env python3
import os, sys
args = sys.argv[1:]
if sys.platform == "darwin" and args[0] == "-i":
    args.insert(1, "")
os.execv(os.environ["REAL_SED"], [os.environ["REAL_SED"], *args])
''')
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.invalid")
        self.git("config", "commit.gpgsign", "false")
        self.git("add", ".")
        self.git("commit", "-m", "Initial chart")
        self.initial = self.git("rev-parse", "HEAD")
        self.git("checkout", "--detach")

    def executable(self, name, content):
        path = self.root / "bin" / name
        path.write_text(content)
        path.chmod(0o755)

    def git(self, *args):
        return subprocess.check_output(
            [GIT, *args], cwd=self.charts, env=self.environment,
            text=True, stderr=subprocess.PIPE,
        ).strip()

    def run_task(self, task="bump-image-digest.sh"):
        return subprocess.run(
            [shutil.which("bash"), str(TASKS / task)], cwd=self.root,
            env=self.environment, capture_output=True, text=True,
        )

    def test_no_change_preserves_head_and_skips_pr(self):
        result = self.run_task()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("No chart changes to commit", result.stdout)
        self.assertEqual(self.git("rev-parse", "HEAD"), self.initial)
        self.assertEqual(self.git("status", "--porcelain"), "")
        result = self.run_task("open-charts-pr.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("no PR needed", result.stdout)

    def test_changed_digest_commits_and_retry_preserves_pending_bump(self):
        (self.root / "edge-image/digest").write_text("sha256:updated\n")
        result = self.run_task()
        self.assertEqual(result.returncode, 0, result.stderr)
        bumped = self.git("rev-parse", "HEAD")
        self.assertNotEqual(bumped, self.initial)
        self.assertIn('digest: "sha256:updated"', self.values.read_text())
        result = self.run_task()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.git("rev-parse", "HEAD"), bumped)
        self.assertNotEqual(self.git("diff", "main", "HEAD"), "")

    def test_schema_only_change_is_committed(self):
        (self.root / "repo/subgraph/schema.graphql").write_text("type Query { updated: String }\n")
        result = self.run_task()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.git("diff", "--name-only", "main", "HEAD"),
                         "charts/galoy/apollo-router/notifications-schema.graphql")

    def test_commit_failure_remains_failure(self):
        (self.root / "edge-image/digest").write_text("sha256:updated\n")
        hook = self.charts / ".git/hooks/pre-commit"
        hook.write_text("#!/bin/sh\necho 'commit rejected' >&2\nexit 1\n")
        hook.chmod(0o755)
        result = self.run_task()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("commit rejected", result.stderr)
        self.assertEqual(self.git("rev-parse", "HEAD"), self.initial)

    def test_diff_error_preserves_exit_code(self):
        self.executable("git", '''#!/usr/bin/env python3
import os, sys
if sys.argv[1:3] == ["diff", "--cached"]:
    print("index comparison failed", file=sys.stderr)
    sys.exit(128)
os.execv(os.environ["REAL_GIT"], [os.environ["REAL_GIT"], *sys.argv[1:]])
''')
        result = self.run_task()
        self.assertEqual(result.returncode, 128, result.stderr)
        self.assertIn("index comparison failed", result.stderr)
        self.assertEqual(self.git("rev-parse", "HEAD"), self.initial)

    def test_missing_base_fails_both_tasks(self):
        self.environment["BRANCH"] = "missing-base"
        for task in ("bump-image-digest.sh", "open-charts-pr.sh"):
            with self.subTest(task=task):
                result = self.run_task(task)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.git("rev-parse", "HEAD"), self.initial)


if __name__ == "__main__":
    unittest.main()
