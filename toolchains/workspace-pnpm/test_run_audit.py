#!/usr/bin/env python3
"""Standalone tests for run_audit.py waiver logic: python3 -m unittest test_run_audit

No CI wiring exists for python in this repo; run manually from this directory
when touching run_audit.py.
"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run_audit  # noqa: E402


def _advisory(ghsa, severity="critical"):
    return {
        "severity": severity,
        "title": "t",
        "url": f"https://github.com/advisories/{ghsa}",
    }


class PartitionIgnoredTest(unittest.TestCase):
    def test_listed_ghsa_is_waived(self):
        matching = [("next", _advisory("GHSA-p293-qw3h-jr36"))]
        kept, waived = run_audit.partition_ignored(
            matching, {"ghsa-p293-qw3h-jr36": "reason"}
        )
        self.assertEqual(kept, [])
        self.assertEqual(
            [(name, ghsa) for name, _, ghsa in waived],
            [("next", "GHSA-p293-qw3h-jr36")],
        )

    def test_match_is_case_insensitive(self):
        matching = [("next", _advisory("GHSA-P293-QW3H-JR36"))]
        kept, waived = run_audit.partition_ignored(
            matching, {"ghsa-p293-qw3h-jr36": "reason"}
        )
        self.assertEqual(kept, [])
        self.assertEqual(len(waived), 1)

    def test_unlisted_critical_still_fails(self):
        matching = [("next", _advisory("GHSA-aaaa-bbbb-cccc"))]
        kept, waived = run_audit.partition_ignored(
            matching, {"ghsa-p293-qw3h-jr36": "reason"}
        )
        self.assertEqual(kept, matching)
        self.assertEqual(waived, [])

    def test_empty_ignore_list_keeps_everything(self):
        matching = [
            ("next", _advisory("GHSA-p293-qw3h-jr36")),
            ("left-pad", _advisory("GHSA-aaaa-bbbb-cccc", "high")),
        ]
        kept, waived = run_audit.partition_ignored(matching, {})
        self.assertEqual(kept, matching)
        self.assertEqual(waived, [])

    def test_advisory_without_ghsa_url_is_never_waived(self):
        matching = [("next", {"severity": "critical", "title": "t", "url": ""})]
        kept, waived = run_audit.partition_ignored(
            matching, {"ghsa-p293-qw3h-jr36": "reason"}
        )
        self.assertEqual(kept, matching)
        self.assertEqual(waived, [])


class LoadIgnoredGhsasTest(unittest.TestCase):
    def test_missing_file_means_no_waivers(self):
        self.assertEqual(run_audit.load_ignored_ghsas("/nonexistent/nope.json"), {})

    def _write(self, payload):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(payload, f)
            self.addCleanup(os.unlink, f.name)
            return f.name

    def test_well_formed_file(self):
        path = self._write(
            {"ignore": [{"ghsa": "GHSA-p293-qw3h-jr36", "reason": "r", "ref": "x"}]}
        )
        self.assertEqual(
            run_audit.load_ignored_ghsas(path),
            {"ghsa-p293-qw3h-jr36": "r"},
        )

    def test_missing_reason_or_ref_fails_loud(self):
        for entry in (
            {"ghsa": "GHSA-p293-qw3h-jr36", "ref": "x"},
            {"ghsa": "GHSA-p293-qw3h-jr36", "reason": "r", "ref": "  "},
        ):
            path = self._write({"ignore": [entry]})
            with self.assertRaises(SystemExit):
                run_audit.load_ignored_ghsas(path)

    def test_malformed_ghsa_fails_loud(self):
        for ghsa in (123, "GHSA-p293", "https://github.com/advisories/GHSA-x"):
            path = self._write({"ignore": [{"ghsa": ghsa, "reason": "r", "ref": "x"}]})
            with self.assertRaises(SystemExit):
                run_audit.load_ignored_ghsas(path)

    def test_duplicate_ghsa_fails_loud(self):
        entry = {"ghsa": "GHSA-p293-qw3h-jr36", "reason": "r", "ref": "x"}
        path = self._write({"ignore": [entry, {**entry, "ghsa": "ghsa-P293-qw3h-jr36"}]})
        with self.assertRaises(SystemExit):
            run_audit.load_ignored_ghsas(path)

    def test_malformed_json_fails_loud(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            f.write("{not json")
            path = f.name
        try:
            with self.assertRaises(SystemExit):
                run_audit.load_ignored_ghsas(path)
        finally:
            os.unlink(path)

    def test_entry_without_ghsa_fails_loud(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump({"ignore": [{"reason": "no ghsa key"}]}, f)
            path = f.name
        try:
            with self.assertRaises(SystemExit):
                run_audit.load_ignored_ghsas(path)
        finally:
            os.unlink(path)

    def test_checked_in_ignore_file_satisfies_schema(self):
        # Deliberately does not pin specific GHSA ids: removing a shipped
        # waiver must not break this test. load_ignored_ghsas already fails
        # loud on any schema violation, so parsing IS the assertion.
        repo_root = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..")
        )
        path = os.path.join(repo_root, run_audit.IGNORE_FILE)
        ignored = run_audit.load_ignored_ghsas(path)
        for key in ignored:
            self.assertRegex(key, r"^ghsa(-[a-z0-9]{4}){3}$")


if __name__ == "__main__":
    unittest.main()
