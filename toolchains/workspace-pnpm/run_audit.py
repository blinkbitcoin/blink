#!/usr/bin/env python3
"""
Audits npm dependencies against the npm registry bulk advisory endpoint.

The legacy audit endpoints (/-/npm/v1/security/audits) that `pnpm audit` uses
were retired by npmjs.org on 2026-07-15 (they respond 410), so packages are
read from pnpm-lock.yaml and posted to the replacement endpoint directly.

Since 2026-07-26 the endpoint returns gzip-compressed bodies with no
Content-Encoding header, so responses are sniffed rather than trusting headers.
"""
import argparse
import gzip
import json
import re
import sys
import urllib.request

BULK_ADVISORY_URL = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk"

# Checked-in waivers, read from the workspace root like pnpm-lock.yaml.
IGNORE_FILE = "audit-ignore.json"

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
LOCKFILE_PACKAGE_KEY = re.compile(r"^  /(?P<name>.+)@(?P<version>[^()@/]+?)(\([^)]*\))*:$")


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
            advisories.update(json.loads(decode_body(response.read())))
    return advisories


def decode_body(body):
    if body[:2] == b"\x1f\x8b":
        return gzip.decompress(body)
    return body


GHSA_ID = re.compile(r"^GHSA(-[a-z0-9]{4}){3}$", re.IGNORECASE)


def load_ignored_ghsas(path=IGNORE_FILE):
    try:
        with open(path) as ignore_file:
            raw = json.load(ignore_file)
    except FileNotFoundError:
        return {}
    except ValueError as err:
        # A checked-in but unparsable waiver file is a repo bug; failing loud
        # beats silently auditing with zero waivers and confusing the reader.
        sys.exit(f"could not parse {path}: {err!r}")
    entries = raw.get("ignore", [])
    if not isinstance(entries, list):
        sys.exit(f"{path}: 'ignore' must be a list")
    # Malformed entries fail loud rather than sit silently inert: a waiver that
    # never matches is worse than no waiver, and this file sets precedent.
    ignored = {}
    for entry in entries:
        if not isinstance(entry, dict):
            sys.exit(f"{path}: every ignore entry must be an object")
        ghsa = entry.get("ghsa")
        if not isinstance(ghsa, str) or not GHSA_ID.match(ghsa):
            sys.exit(f"{path}: missing or malformed 'ghsa': {ghsa!r}")
        for field in ("reason", "ref"):
            value = entry.get(field)
            if not isinstance(value, str) or not value.strip():
                sys.exit(f"{path}: entry {ghsa} needs a non-empty '{field}'")
        key = ghsa.lower()
        if key in ignored:
            sys.exit(f"{path}: duplicate entry for {ghsa}")
        ignored[key] = entry["reason"]
    return ignored


def advisory_ghsa(advisory):
    url = advisory.get("url") or ""
    if "/advisories/" not in url:
        return None
    segment = url.rstrip("/").rsplit("/", 1)[-1]
    if not GHSA_ID.match(segment):
        return None
    return segment


def partition_ignored(matching, ignored_ghsas):
    kept, waived = [], []
    for name, advisory in matching:
        ghsa = advisory_ghsa(advisory)
        if ghsa is not None and ghsa.lower() in ignored_ghsas:
            waived.append((name, advisory, ghsa))
            continue
        kept.append((name, advisory))
    return kept, waived


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
    # OSError covers URLError/TimeoutError/BadGzipFile, ValueError covers
    # JSONDecodeError/UnicodeDecodeError - a narrower tuple lets an unexpected
    # wire format escape and defeat --ignore-registry-errors.
    except (OSError, ValueError) as err:
        print(f"Could not fetch advisories: {err!r}", file=sys.stderr)
        if not ignore_registry_errors:
            sys.exit(1)
        print("audit skipped: registry unreachable or unreadable", file=sys.stderr)
        sys.exit(0)

    matching = [
        (name, advisory)
        for name, package_advisories in advisories.items()
        for advisory in package_advisories
        if severity_meets_threshold(advisory.get("severity"), args.audit_level)
    ]

    ignored_ghsas = load_ignored_ghsas()
    matching, waived = partition_ignored(matching, ignored_ghsas)
    for name, advisory, ghsa in waived:
        print(
            f"ignored advisory {ghsa} ({advisory['severity']}: {name})"
            f" per {IGNORE_FILE}: {ignored_ghsas[ghsa.lower()]}"
        )
    for unused in sorted(set(ignored_ghsas) - {g.lower() for _, _, g in waived}):
        print(
            f"note: waiver {unused} in {IGNORE_FILE} matched no current advisory"
            " at this level - consider removing it"
        )

    if matching:
        matching.sort(
            key=lambda entry: SEVERITY_ORDER.index(entry[1]["severity"]),
            reverse=True,
        )
        print(f"audit found advisories at or above '{args.audit_level}':")
        print_advisories(matching, packages)
        sys.exit(1)

    sys.exit(0)
