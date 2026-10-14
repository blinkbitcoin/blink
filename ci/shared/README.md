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
Node/pnpm, Compose, and a private registry pull/run. Only a short-lived registry
token reaches the guest; the service-account JSON stays inside Concourse.
Each run has a temporary Docker config, removed on normal or failing exit.
Loss of SSH may prevent cleanup; inspect that host before reuse. Workloads
have a 45-minute remote limit and process-group cleanup.

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

Linux exercises the real process supervisor. macOS skips that fixture; a
Linux container or GitHub Actions runs it. Python transport tests cover every
external-command failure boundary and verify credential cleanup/redaction.
Live qualification remains required for private routing, SSH, registry and Nix integration.
