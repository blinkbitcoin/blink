#!/usr/bin/env python3
"""
Runs audit for npm dependencies.
"""
import argparse
import json
import subprocess
import sys

SEVERITY_ORDER = [
    "low",
    "moderate",
    "high",
    "critical",
]


def sum_severities(severity_dict, start_level):
    start_index = SEVERITY_ORDER.index(start_level)
    return sum(
        severity_dict.get(level, 0)
        for level in SEVERITY_ORDER[start_index:]
    )


def severity_meets_threshold(severity, audit_level):
    return SEVERITY_ORDER.index(severity) >= SEVERITY_ORDER.index(audit_level)


def print_advisories(result_dict, audit_level):
    advisories = result_dict.get("advisories", {})
    matching_advisories = [
        advisory
        for advisory in advisories.values()
        if severity_meets_threshold(advisory["severity"], audit_level)
    ]

    matching_advisories.sort(
        key=lambda advisory: SEVERITY_ORDER.index(advisory["severity"]),
        reverse=True,
    )

    print(f"pnpm audit found advisories at or above '{audit_level}':")
    for advisory in matching_advisories:
        print()
        print(f"{advisory['severity']}: {advisory['module_name']}")
        print(f"  title: {advisory['title']}")
        if patched_versions := advisory.get("patched_versions"):
            print(f"  patched versions: {patched_versions}")
        if url := advisory.get("url"):
            print(f"  url: {url}")

        findings = advisory.get("findings", [])
        paths = [
            " > ".join(finding["paths"][0])
            for finding in findings
            if finding.get("paths")
        ]
        for path in paths[:3]:
            print(f"  path: {path}")
        if len(paths) > 3:
            print(f"  ... {len(paths) - 3} more paths")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--audit-level",
        help="Audit severity to print advisories against.",
    )
    parser.add_argument(
        "args",
        help="Audit arguments",
        nargs=argparse.REMAINDER,
    )

    args = parser.parse_args()
    audit_args = args.args[1:]  # ignore '--' separator

    pnpm_cmd = ["pnpm", "audit"]
    audit_cmd = [*pnpm_cmd, *audit_args]
    audit_cmd_json_out = [*audit_cmd, "--json"]

    result = subprocess.run(
        audit_cmd_json_out,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        result_dict = json.loads(result.stdout)
    except json.JSONDecodeError:
        print("Could not parse audit response. Got stdout value:", file=sys.stderr)
        print(result.stdout, file=sys.stderr)
        print("stderr:", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        sys.exit(1)

    num_vulns = sum_severities(
        result_dict["metadata"]["vulnerabilities"],
        args.audit_level
    )
    if num_vulns > 0:
        print_advisories(result_dict, args.audit_level)
        sys.exit(1)

    sys.exit(0)
