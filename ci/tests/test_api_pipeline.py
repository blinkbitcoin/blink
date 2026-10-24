"""Validate the rendered API policy without changing a live pipeline."""
import json
from pathlib import Path
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(shutil.which("ytt"), "ytt is needed to render Concourse configuration")
class ApiPipelineTest(unittest.TestCase):
    def test_only_api_gets_the_deadline_cache_and_sequential_runner(self):
        result = subprocess.run(["ytt", "-f", "ci/core", "-o", "json"], cwd=ROOT,
                                capture_output=True, text=True, check=True)
        jobs = json.loads(result.stdout)["jobs"]
        api = next(job for job in jobs if job["name"] == "buck-test-api")
        self.assertTrue(api["serial"])
        task = api["plan"][1]
        self.assertEqual(task["timeout"], "20m")
        self.assertEqual(task["config"]["caches"], [{"path": "pnpm-store"}])
        self.assertEqual(task["config"]["run"]["path"], "pipeline-tasks/ci/core/tasks/test-api.sh")
        self.assertEqual(task["config"]["params"]["BUCK_TARGET"], "//core/api:test")
        for job in jobs:
            if job["name"].startswith("buck-test-") and job != api:
                other = job["plan"][1]
                self.assertNotIn("timeout", other)
                self.assertNotIn("caches", other["config"])
                self.assertEqual(other["config"]["run"]["path"], "pipeline-tasks/ci/apps/tasks/buck-task.sh")


if __name__ == "__main__":
    unittest.main()
