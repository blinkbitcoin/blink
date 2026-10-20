#!/usr/bin/env python3
"""
Asserts that a Next.js app keeps the image optimizer (/_next/image) disabled.

The optimizer is a public endpoint that decodes images server-side and has had
critical advisories (e.g. GHSA-2xp9-vwfh-vxw4). Every next/image source in our
apps is a static repo asset, so it is disabled with `images.unoptimized: true`;
this check stops that setting from being dropped without a security review.
See blinkbitcoin/blink-wip#1262.

The config is evaluated with node rather than parsed as text, so the check sees
what Next.js sees.
"""
import argparse
import json
import os
import subprocess
import sys

# Prints the evaluated `images` setting of the config passed as argv[1].
LOAD_IMAGES_CONFIG = """
const config = require(process.argv[1])
const resolved = typeof config === "function" ? config("phase-production-build", {}) : config
Promise.resolve(resolved).then((c) => process.stdout.write(JSON.stringify((c && c.images) || null)))
"""


def load_images_config(config_path):
    result = subprocess.run(
        ["node", "-e", LOAD_IMAGES_CONFIG, os.path.abspath(config_path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"could not load {config_path}:\n{result.stderr.strip()}")
    return json.loads(result.stdout)


def check(images):
    """Returns an error message, or None if the image optimizer is disabled."""
    if not isinstance(images, dict) or images.get("unoptimized") is not True:
        return (
            f"images.unoptimized must be true (found images={json.dumps(images)}). "
            "The Next.js image optimizer is disabled on purpose; do not re-enable it "
            "without a security review (see blinkbitcoin/blink-wip#1262)."
        )
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("config", help="path to the app's next.config.js")
    args = parser.parse_args()

    try:
        error = check(load_images_config(args.config))
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

    if error:
        print(f"{args.config}: {error}", file=sys.stderr)
        sys.exit(1)
    print(f"{args.config}: image optimizer disabled")


if __name__ == "__main__":
    main()
