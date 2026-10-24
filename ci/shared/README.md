# Dedicated SSH Docker host pool

`blink-core` and `blink-apps` use the separate `zrh1-docker-hosts` pool.
The shared `docker-hosts` pool remains for GCP-only consumers. The metadata
selects direct SSH; absent transport retains the existing GCP implementation.

The four VMs are provisioned in `zrh1-infra`, following
`docs/operations/docker-host-vms.md`, including its post-bootstrap Nix setup.
Workers must reach the private service addresses on port 22. Only the dedicated
worker namespace is allowed by the host network policy. Host tasks therefore
run on untagged Linux workers; confirm those workers belong to the VM cluster before rollout.

## Qualification and admission

Use a clean, reviewed, published source commit. Verify `fly -t zrh1-org userinfo`
and the `dev` team first. Build a protected ytt data-values file containing
exactly four `hosts` entries, each with `transport: ssh`, `docker_host_name`
(the verified VM hostname), `ssh_host` (its private Service ClusterIP), and
`ssh_host_key` (Ed25519 public key). Read each address from the authenticated
cluster API. Service addresses remain stable for the retained Service resource;
requalify metadata if a Service is replaced. Direct addresses avoid ambiguity
when worker and guest clusters use overlapping DNS service ranges.
Obtain host keys through the authenticated KubeVirt API channel; never trust
an unauthenticated network keyscan. The CI private key remains in Concourse's
`staging-ssh.ssh_private_key` secret.

From the repository root:

```sh
FLY_TARGET=zrh1-org HOSTS_VALUES=/protected/qualification.values.yml \
  PIPELINE_TASKS_BRANCH=<reviewed-branch> ci/shared/repipe-qualification
fly -t zrh1-org trigger-job --team=dev \
  -j zrh1-docker-host-qualification/qualify-and-register
```

The manual job initializes only the new pool's empty directories, tests all
four hosts in parallel, and admits hosts only after all four tests succeed.
Checks cover pinned SSH authentication, Docker, Nix dev-shell evaluation,
Node/pnpm, Compose, and a private registry pull/run. The worker exchanges the
service-account key for a short-lived token scoped only to
`https://www.googleapis.com/auth/devstorage.read_only`. `gcloud auth
print-access-token` is not used: those stable commands have no `--scopes`
flag and would mint a cloud-platform token. That pull token is the only Google
credential sent to the guest, on docker login's stdin. The service-account JSON
stays inside Concourse. Each run has a temporary Docker config, removed on
normal or failing exit. Old `.ci-run` directories are then pruned to the four
newest, matching the core GCP host transport. The active run directory is kept
until that cleanup finishes. Loss of SSH may prevent cleanup; inspect that host
before reuse. Workloads have a 45-minute remote limit and process-group cleanup.
Fallback cleanup waits after TERM, escalates to KILL, and verifies that no
non-zombie group members remain. An unverifiable process identity or failed
termination makes cleanup fail while still attempting credential removal.

Consumer tasks run once per claim, with no automatic retry. A separate ensure
step releases an SSH host only after a successful cleanup receipt matching the
claimed metadata. Workload failure with confirmed cleanup can release the host;
failed cleanup, cancellation without a receipt, and missing task output retain
the claim as quarantine. Failures before remote setup also retain the claim
conservatively. GCP consumers retain their release behavior, but also run once.
Do not retry a quarantined host or manually release its claim until an operator
has verified the exact host/build, terminated remaining workloads, removed the
run's Docker credentials, and confirmed cleanup. Preserve the failed build and
run directory evidence, then recover the exact claim through the pool resource.
Deploy pipeline definitions and task scripts together so the receipt output and
release gate are both present.

If qualification fails, leave core/apps on GCP. An empty pool can be retried.
If admission partially succeeds, stop and reconcile actual claimed/unclaimed
members before recovery: bootstrap deliberately refuses a nonempty pool.
Before either consumer has been migrated, list only the exact idle admitted
names in the protected inventory's optional `recover_hosts` array, repipe, and
trigger `recover-partial-admission`. That manual job claims each named lock
through the pool resource before removing it. Verify an empty pool, remove
`recover_hosts` from the inventory, repipe again, and rerun qualification.
Never use recovery after consumer cutover or remove a lock in use. Preserve
failed build evidence. If recovery fails, inspect the claimed entry before
retrying; do not force-release it.

## Consumer deployment and rollback

Save both live pipeline definitions and compare the render with them. Verify
that all four hosts were admitted, and account for in-flight GCP builds before
changing either pipeline. Deploy from the same reviewed source:

```sh
FLY_TARGET=zrh1-org PIPELINE_TASKS_BRANCH=<reviewed-branch> ci/core/repipe
FLY_TARGET=zrh1-org PIPELINE_TASKS_BRANCH=<reviewed-branch> ci/apps/repipe
```

The branch override selects task scripts only; application source remains on
its configured branch. Once merged, repipe without the override. Verify a
representative host job from each pipeline and successful lock release. Pause
the qualification pipeline after admission; it is not a periodic maintenance
job.

Rollback uses the saved pipeline definitions with `fly set-pipeline --team=dev`
for each affected pipeline, after checking current running builds and locks.
Keep the dedicated VMs and pool entries intact; do not reclaim active locks, delete
disks, or move entries into the GCP pool. A host requiring recovery should be
quarantined through the pool's normal lock mechanism before infrastructure work.

## Validation

```sh
python3 -m unittest discover -s ci/shared/tests -v
shellcheck ci/shared/tasks/*.sh ci/shared/repipe-qualification
```

The runtime tasks use Bash, jq, OpenSSL, curl and GNU coreutils (including
`timeout`); no Python interpreter is required by the transport or its remote
helpers. The task image includes OpenSSL and curl. If either is missing, the
transport refuses before host access. Rebuild `galoy-dev` with the core
`build-galoy-dev-image` job before running consumers. The image-definition
resource follows the task-source branch override so dependency changes can
be deployed together with the scripts. Python is used only by the test harness. Linux
exercises the real process supervisor. macOS skips that fixture; a Linux
container or GitHub Actions runs it. Subprocess
fixtures exercise the Bash transport, cover every external-command failure
boundary, and verify credential cleanup/redaction.
Live qualification remains required for private routing, SSH, registry and Nix integration.
