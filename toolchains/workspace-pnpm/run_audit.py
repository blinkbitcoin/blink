#!/usr/bin/env python3
"""
Audits npm dependencies against the npm registry bulk advisory endpoint.

The legacy audit endpoints (/-/npm/v1/security/audits) that `pnpm audit` uses
were retired by npmjs.org on 2026-07-15 (they respond 410), so packages are
read from pnpm-lock.yaml and posted to the replacement endpoint directly.
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.request

BULK_ADVISORY_URL = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk"

CHUNK_SIZE = 1000

SEVERITY_ORDER = [
    "low",
    "moderate",
    "high",
    "critical",
]

# lockfile v6 package keys look like:
#   /@scope/name@1.2.3:
#   /name@1.2.3(peer@4.5.6)(other@7.8.9):
LOCKFILE_PACKAGE_KEY = re.compile(r"^  /(?P<name>.+)@(?P<version>[^()@/]+?)(\(.*\))*:$")


def collect_packages(lockfile_path):
    packages = {}
    with open(lockfile_path) as lockfile:
        version_line = lockfile.readline().strip()
        if not re.fullmatch(r"lockfileVersion: '?6[0-9.]*'?", version_line):
            sys.exit(
                f"unsupported lockfile ({version_line}): LOCKFILE_PACKAGE_KEY only"
                " understands v6 keys - update it for the new format"
            )
        for line in lockfile:
            match = LOCKFILE_PACKAGE_KEY.match(line.rstrip("\n"))
            if match:
                packages.setdefault(match["name"], set()).add(match["version"])
    if not packages:
        sys.exit("no packages parsed from lockfile - refusing to report a vacuous pass")
    return packages


def fetch_advisories(packages):
    advisories = {}
    names = sorted(packages)
    for start in range(0, len(names), CHUNK_SIZE):
        chunk = {
            name: sorted(packages[name])
            for name in names[start : start + CHUNK_SIZE]
        }
        request = urllib.request.Request(
            BULK_ADVISORY_URL,
            data=json.dumps(chunk).encode(),
            headers={"content-type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            advisories.update(json.load(response))
    return advisories


def severity_meets_threshold(severity, audit_level):
    return (
        severity in SEVERITY_ORDER
        and SEVERITY_ORDER.index(severity) >= SEVERITY_ORDER.index(audit_level)
    )


def print_advisories(matching, packages):
    for name, advisory in matching:
        print()
        print(f"{advisory['severity']}: {name}")
        print(f"  title: {advisory['title']}")
        print(f"  installed versions: {', '.join(sorted(packages[name]))}")
        if vulnerable := advisory.get("vulnerable_versions"):
            print(f"  vulnerable versions: {vulnerable}")
        if url := advisory.get("url"):
            print(f"  url: {url}")


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
    ignore_registry_errors = "--ignore-registry-errors" in audit_args

    packages = collect_packages("pnpm-lock.yaml")

    try:
        advisories = fetch_advisories(packages)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as err:
        print(f"Could not fetch advisories: {err}", file=sys.stderr)
        sys.exit(0 if ignore_registry_errors else 1)

    matching = [
        (name, advisory)
        for name, package_advisories in advisories.items()
        for advisory in package_advisories
        if severity_meets_threshold(advisory.get("severity"), args.audit_level)
    ]

    if matching:
        matching.sort(
            key=lambda entry: SEVERITY_ORDER.index(entry[1]["severity"]),
            reverse=True,
        )
        print(f"audit found advisories at or above '{args.audit_level}':")
        print_advisories(matching, packages)
        sys.exit(1)

    sys.exit(0)
