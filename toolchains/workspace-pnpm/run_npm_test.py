#!/usr/bin/env python3
"""
Runs a program in a directory.
"""
import argparse
import json
import os
import signal
import subprocess
import sys
import time

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cwd",
        help="Directory under which to run the program",
    )
    parser.add_argument(
        "--bin",
        help="Binary to execute program with",
    )
    parser.add_argument(
        "--env-json",
        help="Env file to load variables from",
    )
    parser.add_argument(
        "args",
        help="Program and arguments",
        nargs=argparse.REMAINDER,
    )

    args = parser.parse_args(argv)

    env = os.environ.copy()
    if (args.env_json):
        with open(args.env_json, 'r') as file:
            env_dict = json.load(file)
        env = {**env, **env_dict}

    bin_args = args.args[1:] # ignore '--' separator
    if env.get("TEST"):
        bin_args.append(env.get("TEST"))
    cmd = [os.path.abspath(args.bin), *bin_args]

    started = time.monotonic()
    exit_code = subprocess.call(cmd, cwd=args.cwd, env=env)
    elapsed = time.monotonic() - started
    # Never print command arguments or environment values: either can contain
    # secrets. Preserve the distinction between a signal and a normal exit.
    if exit_code < 0:
        signum = -exit_code
        try:
            signal_name = signal.Signals(signum).name
        except ValueError:
            # Intermediate Linux realtime signals need not have enum names.
            signal_name = "signal"
        print(f"Test subprocess terminated by {signal_name} "
              f"({signum}) after {elapsed:.1f}s", file=sys.stderr, flush=True)
        return 128 + signum
    if exit_code:
        print(f"Test subprocess exited with code {exit_code} after {elapsed:.1f}s",
              file=sys.stderr, flush=True)
    return exit_code

if __name__ == "__main__":
    sys.exit(main())
