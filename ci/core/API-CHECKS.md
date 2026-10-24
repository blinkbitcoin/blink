# API check execution

`buck-test-api` runs `ci/core/tasks/test-api.sh`. It runs type checking first,
then YAML, audit, circular-dependency, lint, and unit checks. Every check is
required; a nonzero exit stops the job before the next check starts. The
regression test compares this list with `//core/api:test` to catch drift.

Each Buck invocation uses two build execution slots. API Jest runs in one
process via `run_serially = True`. The Buck test executor allows 600 seconds per
check, and the Concourse task has a 20-minute deadline that also covers
dependency downloads and build actions. Resource fetching before the task and
Concourse cleanup can add time outside that deadline. A timeout remains a
failure; it does not skip a check or promote a revision.

The task caches `pnpm-store`, a pnpm content-addressed package store. It passes
the absolute store path through `workspace_pnpm.store_dir` to both the pruned
API installer and the full workspace installer needed by lint. Both retain
`--frozen-lockfile` and use `--prefer-offline`, so missing packages can still be
downloaded. No `node_modules`, Buck outputs, or daemon state is cached between
builds. Concourse task caches are worker-local; a cold or different worker can
still need downloads. Other jobs retain their existing execution policy.

`run_npm_test.py` reports a failed child's exit status or termination signal and
elapsed time without adding command arguments or environment values to logs.
SIGKILL alone does not establish OOM; correlate it with worker/cgroup evidence.

## Validation and rollout

Local regression commands:

```sh
python3 -m unittest discover -s ci/core/tasks/tests -v
python3 -m unittest discover -s ci/tests -v
python3 -m unittest discover -s toolchains/workspace-pnpm -p 'test_*.py' -v
shellcheck ci/core/tasks/test-api.sh
ytt -f ci/core > /tmp/blink-core.yml
fly validate-pipeline -c /tmp/blink-core.yml
```

The pipeline test needs `ytt`; CI installs it. Buck action queries can verify
`--store-dir` propagation without installing the application dependencies.

After source review/publication, update the pipeline through `ci/core/repipe`
under the normal production authorization process. Verify that both
`pipeline-tasks` and `core-bundle-src` include this change before running the
job. The new runner depends on the source revision's cache-aware Buck rules and
Jest configuration. Compare cold/warm builds and confirm all six checks pass;
local fixtures do not establish live performance or worker resource health.

Rollback the pipeline to the prior reviewed template and generic task entry
point. The pnpm store can remain unused; no cache deletion or worker changes
are required. Roll back the source changes through the normal source workflow
if needed.
