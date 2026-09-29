#!/usr/bin/env python3
"""
Compose the GraphQL supergraph through Rover.
"""
import argparse
import os
import glob
import shutil
import stat
import subprocess
import sys
import tarfile
import platform


SUPERGRAPH_PLUGIN = "supergraph-v2.3.2"


def _pnpm_node_modules_dir(node_modules_root):
    """
    Resolve the `build_node_modules` output root to the pnpm package tree.

    The Buck rule passes the default output of `build_node_modules`, whose
    standardized shape is a root directory containing `node_modules`. Keep this
    strict so CI fails clearly if that rule's output contract changes.
    """
    node_modules = os.path.join(node_modules_root, "node_modules")
    if os.path.isdir(os.path.join(node_modules, ".pnpm")):
        return node_modules

    raise RuntimeError(
        f"Expected build_node_modules output root containing node_modules/.pnpm: {node_modules_root}"
    )


def _rover_binary_install_dir(path):
    """
    Locate binary-install's directory containing the real Rover executable.

    The npm `rover` entrypoint ultimately delegates to a binary installed by
    the `binary-install` package. Rover also looks for supergraph plugins in
    that same directory, so this is the source for the binary we copy into the
    action-local staging directory.
    """
    node_modules = _pnpm_node_modules_dir(path)
    matches = glob.glob(
        os.path.join(
            node_modules,
            ".pnpm",
            "binary-install@*",
            "node_modules",
            "binary-install",
            "node_modules",
            ".bin",
        )
    )
    if len(matches) != 1:
        raise RuntimeError(
            f"Expected one binary-install plugin directory, found {len(matches)}: {matches}"
        )

    return matches[0]


def _stage_supergraph_plugin(rover_bin, rover_node_modules, plugin_archive, out_path):
    """
    Stage Rover's pinned supergraph plugin for Linux CI runners.

    The npm package installs the Rover binary, but `rover supergraph compose`
    downloads `supergraph-v2.3.2` lazily into binary-install's `.bin` directory.
    That runtime download has timed out on GitHub Actions, so CI provides the
    Linux plugin archive as an explicit Buck input.

    Do not write the plugin into the generated node_modules tree. That tree is
    an input to this action and may be shared by other actions. Instead, copy
    the real Rover binary and the plugin into this action's scratch directory
    and point Rover at that private directory via APOLLO_NODE_MODULES_BIN_DIR.
    """
    # The pinned archive below is the Linux x86_64 plugin used by GitHub
    # runners. Other platforms should keep Rover's normal local behavior so a
    # developer on macOS does not accidentally execute a Linux plugin.
    if platform.system() != "Linux" or platform.machine() != "x86_64":
        return rover_bin, {}

    binary_install_dir = _rover_binary_install_dir(rover_node_modules)

    scratch_root = os.environ.get("BUCK_SCRATCH_PATH") or os.path.dirname(out_path)
    staged_dir = os.path.join(scratch_root, "rover-with-supergraph")
    os.makedirs(staged_dir, exist_ok=True)

    staged_rover = os.path.join(staged_dir, "rover")
    shutil.copy2(os.path.join(binary_install_dir, "rover"), staged_rover)
    current_mode = os.stat(staged_rover).st_mode
    os.chmod(staged_rover, current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    plugin_path = os.path.join(staged_dir, SUPERGRAPH_PLUGIN)

    with tarfile.open(plugin_archive, "r:gz") as archive:
        member = archive.getmember("dist/supergraph")
        extracted = archive.extractfile(member)
        if extracted is None:
            raise RuntimeError("Rover supergraph plugin archive did not contain dist/supergraph")

        with open(plugin_path, "wb") as plugin:
            shutil.copyfileobj(extracted, plugin)

    current_mode = os.stat(plugin_path).st_mode
    os.chmod(plugin_path, current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    return staged_rover, {"APOLLO_NODE_MODULES_BIN_DIR": staged_dir}

def main(args):
    # Use the staged Linux binary only when CI needs the pinned plugin path.
    rover_bin = args.rover_bin
    rover_bin, rover_env = _stage_supergraph_plugin(
        rover_bin,
        args.rover_node_modules,
        args.supergraph_plugin_archive,
        args.out_path,
    )

    # Prepare the environment variables from the subgraph argument
    env = os.environ.copy()
    env.update(rover_env)
    for subgraph in args.subgraph:
        key, path = subgraph.split('=')
        absolute_path = os.path.abspath(path)
        env[key] = absolute_path

    # Run the generator binary and pass the out-path directly to the command
    cmd = [
        rover_bin,
        "supergraph",
        "compose",
        "--config",
        args.config,
        "--output",
        args.out_path,  # The output path is passed directly to rover command
        "--elv2-license",
        "accept"
    ]

    # Print out the command for debugging purposes
    print("Running Command:")
    print(' '.join(cmd))

    try:
        # Run the command without redirecting stdout since output is handled by rover itself
        result = subprocess.run(cmd, stderr=subprocess.PIPE, text=True, env=env)

        # Check if the generator command was successful
        if result.returncode != 0:
            print(f"Error: The generator binary failed to run with error:\n{result.stderr}")
            sys.exit(result.returncode)

        print(f"Success: Output written to {args.out_path}")

    except Exception as e:
        print(f"An error occurred: {e}")
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--rover-bin",
        required=True,
        help="Path to rover bin",
    )
    parser.add_argument(
        "--rover-node-modules",
        required=True,
        help="Path to Rover's generated node_modules tree",
    )
    parser.add_argument(
        "--config",
        required=True,
        help="Path to supergraph-config",
    )
    parser.add_argument(
        "--supergraph-plugin-archive",
        required=True,
        help="Path to the pinned Rover supergraph plugin archive",
    )
    parser.add_argument(
        "--subgraph",
        action="append",
        default=[],
        help="Subgraph environment variables in the format ENV=path",
    )
    parser.add_argument(
        "out_path",
        help="Path to output the schema to",
    )

    args = parser.parse_args()
    main(args)
