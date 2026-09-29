"""Exercise the chart PR task without network access or real credentials."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


TASK = Path(__file__).resolve().parents[1] / "open-charts-pr.sh"
STUB = r'''#!/usr/bin/env python3
import json
import os
from pathlib import Path
import sys

name = Path(sys.argv[0]).name
args = sys.argv[1:]
with open(os.environ["CALLS"], "a") as calls:
    calls.write(json.dumps([name, *args]) + "\n")

if name == "buck2":
    assert args == ["--isolation-dir", "chart-pr-query", "uquery", "-c",
                    "buck2.file_watcher=fs_hash_crawler",
                    'inputs(deps("//core/notifications:"))'], args
    print("core/notifications/src/lib.rs")
    if os.environ["QUERY_FAIL"] == "1":
        print("dependency query failed", file=sys.stderr)
        sys.exit(2)
elif name == "git":
    if args[:1] == ["diff"]:
        assert args == ["diff", "--quiet", "main", "HEAD"], args
        sys.exit(int(os.environ["CHART_DIFF_STATUS"]))
    elif args[:2] == ["config", "--global"]:
        print("test-user")
    elif args[:1] == ["log"]:
        if "--format=%H" in args:
            print("abc123")
        else:
            print("feat: update notifications (#123)")
    elif args[:1] == ["diff-tree"]:
        print("core/notifications/src/lib.rs")
    elif args[:1] == ["cliff"]:
        print("Notification update")
elif name == "yq":
    print("sha256:old")
elif name == "gh-token":
    print('{"token":"fixture-token"}')
elif name == "jq":
    print(json.load(sys.stdin)["token"])
'''


class OpenChartsPrTest(unittest.TestCase):
    def run_task(self, fail=False, chart_diff_status=1):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for path in ("bin", "repo/.git", "charts-repo/charts/galoy", "edge-image"):
                (root / path).mkdir(parents=True)
            (root / "repo/.git/short_ref").write_text("newref\n")
            (root / "edge-image/digest").write_text("sha256:new\n")
            (root / "charts-repo/charts/galoy/values.yaml").write_text(
                'digest: "sha256:old" # repository=https://example.invalid/app;'
                'commit_ref=oldref;\n'
            )
            for name in ("buck2", "git", "yq", "gh-token", "gh", "jq"):
                executable = root / "bin" / name
                executable.write_text(STUB)
                executable.chmod(0o755)
            environment = {
                **os.environ,
                "PATH": f"{root / 'bin'}:{os.environ['PATH']}",
                "CALLS": str(root / "calls.jsonl"),
                "QUERY_FAIL": "1" if fail else "0",
                "CHART_DIFF_STATUS": str(chart_diff_status),
                "BRANCH": "main",
                "BOT_BRANCH": "bump-notifications-component",
                "COMPONENT": "notifications",
                "YAML_PATH": ".galoy.images.notifications.digest",
                "CHART": "galoy",
                "GH_APP_ID": "fixture-app",
                "GH_APP_PRIVATE_KEY": "fixture-key",
            }
            result = subprocess.run(
                [shutil.which("bash"), str(TASK)],
                cwd=root, env=environment, text=True, capture_output=True,
            )
            calls = [json.loads(line) for line in (root / "calls.jsonl").read_text().splitlines()]
            body = (root / "body.md").read_text() if (root / "body.md").exists() else ""
            return result, calls, body

    def test_query_success_continues_to_pr_with_relevant_changes(self):
        result, calls, body = self.run_task()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(sum(call[0] == "buck2" for call in calls), 1)
        self.assertIn(["git", "checkout", "newref", "--", "core/notifications/src/lib.rs"], calls)
        create = next(call for call in calls if call[:3] == ["gh", "pr", "create"])
        self.assertEqual(create[create.index("--head") + 1], "bump-notifications-component")
        self.assertIn("feat: update notifications (#123)", body)
        self.assertIn("sha256:new", body)

    def test_query_failure_preserves_diagnostic_and_exit_code(self):
        result, calls, body = self.run_task(fail=True)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn("dependency query failed", result.stderr)
        self.assertEqual(calls[-1][0], "buck2")
        self.assertEqual(body, "")

    def test_unchanged_chart_skips_pr_and_external_operations(self):
        result, calls, body = self.run_task(chart_diff_status=0)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("no PR needed", result.stdout)
        self.assertEqual(calls, [["git", "diff", "--quiet", "main", "HEAD"]])
        self.assertEqual(body, "")

    def test_chart_comparison_failure_stops_the_task(self):
        result, calls, body = self.run_task(chart_diff_status=128)
        self.assertEqual(result.returncode, 128, result.stderr)
        self.assertEqual(calls, [["git", "diff", "--quiet", "main", "HEAD"]])
        self.assertEqual(body, "")


if __name__ == "__main__":
    unittest.main()
