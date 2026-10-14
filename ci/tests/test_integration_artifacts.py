"""Guard Actions status gating for integration failure diagnostics."""

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]


class IntegrationArtifactTests(unittest.TestCase):
    def test_upload_runs_after_failure_only_when_log_was_prepared(self):
        workflow = (ROOT / ".github/workflows/integration-test.yml").read_text()
        upload = re.search(
            r"(?m)^      - name: Upload Tilt log\n(?P<body>(?:        .*\n?)+)",
            workflow,
        )
        assert upload is not None, "Upload Tilt log step is missing"
        condition = re.search(r"(?m)^        if: (.+)$", upload["body"])
        assert condition is not None, "Upload Tilt log condition is missing"
        # A condition with no status function is implicitly success() && condition.
        self.assertEqual(
            condition[1],
            "always() && steps.prepare_tilt_log.outputs.prepared == 'true'",
        )


if __name__ == "__main__":
    unittest.main()
