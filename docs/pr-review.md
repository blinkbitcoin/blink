# PR Review Guide

This guide codifies what is actually enforced in review on `blinkbitcoin/blink`, distilled
from the repository's full PR history since the fork (PRs #70-#680, May 2025 - July 2026,
excluding bot-authored dependency bumps). Every rule cites the PR where it was enforced so
you can read the precedent. Companion docs: [CONTRIBUTING.md](../CONTRIBUTING.md) (type and
architecture conventions this guide constantly references), [ARCHITECTURE.md](../ARCHITECTURE.md),
[CI.md](CI.md), [BUCK2.md](BUCK2.md), [DEVELOPMENT_ENVIRONMENT.md](DEVELOPMENT_ENVIRONMENT.md).

The single most useful summary of the culture: consistency with the existing codebase is the
constitution. The most common review comment is some form of "please keep the same patterns
that we already use" (#463) or "check other services as reference" (#272). When in doubt,
find the closest existing implementation and match it.

## Process conventions

### Titles and commits

- Merges are **squash-only** and the PR title becomes the permanent commit message
  (`squash_merge_commit_title: COMMIT_OR_PR_TITLE`). Title hygiene is commit-history hygiene.
- Titles follow [Conventional Commits](https://www.conventionalcommits.org/). This is a
  review gate, not a suggestion: the entire first review of #205 was
  "please use https://www.conventionalcommits.org/" (CHANGES_REQUESTED).
- Types in use: `feat`, `fix`, `chore`, `refactor`, `test`, `revert`, `docs`, `perf`, `ci`.
  Common scopes: `core`, `api`, `notifications`, `api-keys`, `pay`, `admin-panel`,
  `dashboard`, `voucher`, `consent`, `deps`, `ci`, `lnd`, `security`, `migration`.
  Scopeless titles are tolerated from occasional contributors but scoped is the house style.
- Branch naming is free-form (`kn/<topic>`, `chore--bitcoin-update-to-28.4`, `feat-lud-21`
  all coexist). Not enforced.

### Scope: one goal per PR

- "this PR has two goals, please split it (1 PR should have only the strategy)" (#652).
- Risky or destructive follow-up work is split out deliberately: the contacts-cleanup
  migration was moved out of #85 "just in case something happen during contacts migration"
  and became #124.
- Large features ship as explicitly stacked parts: api-keys spending limits went
  #462 (service, "Part 1 of 2") -> #505 (atomic check and lock) -> #463 (payment-flow
  integration) -> #519 (centralization, dashboard excluded and declared as such).

### Descriptions

House style is `## Summary` bullets plus a `## Test plan` / `## Testing` section, ideally
with the exact command (#602: `TEST="request-telegram-passport-nonce.spec" pnpm test:unit`).
Reviewers treat these as findings when missing:

- **Description must match the diff.** "PR description says this change only adds E2E
  tests, but this hunk also changes production defaults... either update the PR description
  or split the functional change" (#455); "Please align the implementation and PR
  description... so reviewers/operators know the actual limit being enforced" (#475).
- **Declare scope exclusions and tradeoffs up front.** #519's Notes section explicitly
  excludes the dashboard changes and names the follow-up. #430 documents the rejected
  alternative ("We tried overrideAttrs, but...").
- Link the motivating signal: production fixes link the Honeycomb alert (#350), algorithm
  PRs link the spec (#355, #128), related PRs are cross-referenced ("ref: #131").
- Empty bodies are tolerated only for small maintainer chores; feature PRs without a real
  description stall.

### Review mechanics

- **One approval merges**, and in practice it needs to be from a core maintainer
  (historically dolcalmi for anything touching `core/`; grimen arbitrates test coverage and
  product/API-shape questions). Big PRs collect two (#458). Maintainers self-merge chores,
  deps bumps, and reverts same-day; features wait for review.
- **Author response protocol: push fixes, reply per thread with the commit link.**
  Canonical form: "Resolved: <commit URL>... please confirm @dolcalmi" (#463). "Done!" plus
  the commit is the standard thread closure.
- **Answer questions, do not silently delete the code they point at.** "I didnt ask for
  removal, validate where it needs to be increase" (#85). A reviewer question is a request
  for investigation; the acceptable answers are evidence or a fix, and "Verified. No change
  is needed. The new type falls through to the default case..." (#643) is a model reply.
- **Reasoned pushback is accepted**, including against maintainers and bots, when it comes
  with evidence: the GraphQL `Int`-vs-`i64` cap defense in #462 was accepted; k9ert's
  nix dual-input defense in #430 stood (and he added a build-time assertion to back it);
  openoms' race-condition finding on dolcalmi's own #637 got a numbered response,
  an acknowledged tradeoff, and a partial fix.
- **Reviews may be explicitly scoped**: "first pass, (I have not checked tests and
  dashboard)" (#463). Say what you did not look at.
- Design smells stop code review: "This logic is a symptom that the query is not designed
  properly. please make a proposal before implement it" (#205). Product-intent ambiguity is
  a blocking finding ("if this is a button what is the action? the main action?", #458).
- Merge latency is bimodal: small fixes and maintainer chores merge within hours; reviewed
  features take days to weeks (#462: ~3 weeks, #85: 46 inline threads over 3 rounds).
  Roughly a fifth of human PRs close unmerged; scaffolding-only or architecture-questioned
  PRs die on the vine (#353, #356, #380).
- The team uses AI reviewers (Copilot auto-review, CodeRabbit, an in-house Claude bot) as
  input, not authority: bot findings are acted on when right (#519 has a "Copilot review
  follow-ups addressed" section) and dismissed with reasons when wrong ("this was
  intentional, the prelude cost is not significant for lookups", #602; "this is wrong, bria
  returns `PayoutQueues`", #348). Copilot noise on generated protobuf output is ignored.

### CI gates

All PR workflows run `nix develop -c buck2 ...`; the path-based `label` job narrows the
matrix to changed components.

| Check | What it runs | Notes |
| --- | --- | --- |
| build and test core / execute via buck2 | `//core/api:test` suite: audit, lint, tsc, yaml, circular-deps (madge), unit tests | Layering violations trip the circular-deps check. Jest 60s timeouts on LND/bitcoind bootstrap are a known flake. |
| Integration test | `dev/bin/tilt-ci.sh <component>` | Integration tests are being phased out (see Tests section). |
| execute via bats | `./bats/ci_run.sh` e2e against a Tilt stack | The flakiest gate: `ln-receive` NO_ROUTE cascades, held-invoice races, state leakage between runs (forensics in #656/#657, fixes in #639/#665/#666). Distinguish infra flakes from your failure with log evidence before re-running. |
| Check SDLs | `buck2 test //dev:check-sdls` (schema + supergraph drift) | Fails whenever GraphQL types changed without regenerating. Occasional non-hermetic download flakes (Rover plugin, protoc-gen-js). |
| Check Schema / GraphQL Inspector | Schema diff against main | Surfaces breaking changes for discussion. |
| Check mobile compatibility | `ci/tasks/check-mobile-schema-compatibility.sh` | Public schema changes must not break the mobile app. Skipped on forks without the secret. |
| Migrate Mongodb | Runs the mongo migrations | |
| CodeQL, check-secret, Spell Check with Typos | Security scan, secret hygiene, `typos.toml` | |

Culture note: authors investigate their own red CI. Unrelated flakes are called out with
evidence ("The failing tests are unrelated", #71), not silently re-run. Config-schema
snapshot churn: "please run unit tests twice after config schema change" (#92).

## Core review principles, ranked by enforcement frequency

Ranked by how often reviewers actually raised each across the analyzed history.

### 1. Layer discipline is law (~40 findings)

The hexagonal architecture in [CONTRIBUTING.md](../CONTRIBUTING.md#architecture) is the
most-enforced standard in the repo: `domain/` (types, validation, business rules, no
internal deps) <- `services/` (adapters that parse external data into domain types) <-
`app/` (orchestration, errors as return values) <- `graphql/servers` (transport).

- Repositories and translate methods do not run extra queries: "this is just a translate
  method, please dont do queries here, this query must be done at graphql level (calling an
  app layer method)" (#85).
- Services parse, domain decides: "this is not a valid service, please follow the rules of
  the other services, including data parsing, you cant return unparsed data directly from
  service" and "move this to domain (pass amount and limits to validate, service must not
  replace domain logic" (#272).
- The app layer never talks to external systems directly; that is a service's job (#328:
  lnd calls moved behind a service, "this is responsibility of the service").
- Only services throw; app and domain return errors ("we only throw at service layer", #519).
- Style is part of the architecture: "we dont use classes, please use the same code style
  as other services (including arrow function expressions).. the same apply to interfaces
  and types" (#158); single object parameter, "use 1 param rule in all the functions" (#205).
- Core stays vendor-neutral: "I wont introduce GCP IAM dependency into core... we need to
  find an alternative" (#158) forced a full redesign of admin RBAC.

As a reviewer, ask: could this line live one layer lower? Does this service return raw
external data? Does this app function cast instead of validating?

### 2. Tests exist, exercise the real behavior, and live in the right place (~33)

The strongest norm in the repo, strong enough to revert merged work: #417 was approved and
merged, then reverted in #424 with "this type of change requires e2e or integration test,
please dont approve/merge/deploy without them."

- "are you missing tests?" is routinely the first review comment on a feature PR (#462).
- Coverage means the behavior, not the plumbing: "It does not look to me like this test
  covers the fundamental side-effect of this PR" (#417); "From what I gather test coverage
  for the diff is 5-10%... tests should cover edge cases, and concurrent calls since the
  nature of this implementation has potential race condition" (#462).
- Placement: domain logic gets unit specs (`test/unit`, `*.spec.ts`, Rust inline
  `mod tests`); anything exercising a running server is e2e and belongs in `bats/`
  ("this is an e2e test, move to bats", #157; "move the added tests to e2e tests (bats)",
  #92; "please add e2e query test for this change. ref: .../bats/core/notifications", #423).
- **Integration tests are being phased out**: "We are trying to get rid of integration
  tests so adding new integration tests should be reserved for when it is absolutely
  necessary" (#643). Prefer unit + bats.
- E2e must replicate the real client: "use the same query used in mobile application and
  find out if it throws an error with a ln address" (#85). Bats tests must be
  order-independent (#455).
- Minimum matrix for authz-style changes: "at least we need to have 1 success and 1 fail
  by group" (#158).
- Backward-compat deserialization gets its own test when payload shapes evolve
  (#458: `deserialize_backward_compat_without_label` for old notification payloads).

### 3. Delete the noise (~34)

"remove" is the most-typed word in the repo's review history.

- "remove unnecessary comments, applies to all the PR" (#463); "remove all unnecessary
  comments/debug cmds" (#294); "probably just for test but for final PR remove all
  console.log" (#205).
- Dead parameters are hunted: "why optional?", "where do you use this with false?" (#85);
  "why do we need this? is not enough with admin helpers?" (#157).
- Redundant constructs collapse: "it is me or do you have 3 error types for the same
  error?... why not just `InvalidLimitAmount`" (#462); eight near-duplicate mutations were
  collapsed into set/remove with a window enum ("lets use an ENUM and only one mutation per
  action", #462).

### 4. Branded domain types, no casts, no bare primitives (~28)

- "dont use cast at app layer level, please create something like toSats but for Username"
  (#85): validation happens through `checkedToX` constructors in `domain/`, not `as` casts.
- "number is not a proper type"; "use the proper type, specially for this bigint -> int
  should not happen" (#463).
- "non null assertion must not be used, if it is necessary return the error properly (this
  can cause an exception in prod)" (#92).
- The app layer re-validates its inputs even when GraphQL already did: "app layer needs to
  have the type validations too" (#85).
- See [CONTRIBUTING.md "Working with Types"](../CONTRIBUTING.md#working-with-types) for the
  symbol-branded type and `.d.ts` conventions reviewers expect.

### 5. Error taxonomy, registration, and alert severity (~26)

- New domains own their errors: put them in the bounded context's `errors.ts`, extending
  the domain hierarchy: "move them to contacts domain, then add the new domain to
  core/api/src/app/errors.ts so you can use them at app or servers layers (including
  graphql)" (#85); "create ApiKeysServiceError extending from DomainError and make all of
  them inherit from it" (#463).
- Errors surfaced over GraphQL must be registered in `core/api/src/graphql/error-map.ts`.
- Errors must be specific and meaningful: "this does not mean nothing.. can you create more
  specific errors?" (#205); unknown external errors get parsed, not passed through ("this
  does not make sense, this is an unknown error unless you do a proper parsing (check other
  services)", #272).
- **Severity is a reviewed decision**: "critical creates an alert in honeycomb/pagerduty,
  are you sure this is correct? please check the purpose of all the errors in this file"
  (#463). Choosing `ErrorLevel` is choosing who gets paged.

### 6. Naming and file conventions (~19)

- "file name must match content object/function name" (#85).
- Verb placement encodes the layer: `contactCreate` at GraphQL, `createContact` in app;
  "verb at the end is only used at graphql layer" (#85). Repository methods use
  `findByX`/`listByX`.
- Names must be consistent within a feature: "naming must be consistent
  `limit_24h_sats / spent_24h_sats` or `daily_limit_sats / daily_spent_sats`" (#462).
- Avoid overloaded or internal jargon: "queues is used internally, this should be something
  like 'Returns the list of available speeds for on-chain payments'" (#92, on a public
  GraphQL description); prefer `handle`/`displayName` over conflicting `id`/`alias` (#85).
- Test helper names describe the behavior, not the library: "please use a different prefix
  for the test fns... something like `parse_`, `serialize_`... but not library name" (#458).
- Test files follow `foo.spec.*` (#417).

### 7. Generated and CI-managed files are hands-off (~18)

See the table below. Reviewers catch these constantly: "this is autogenerated, dont do
changes here" (Tiltfile-derived config, #158); "quickstart is updated automatically please
dont include changes unless template structure is changed" (#424); "you forgot to update
schemas. run `./dev/bin/update-schemas.sh`" (#664); "if you didnt update package.json files
this [pnpm-lock] should not be updated" (#158); "please dont modify old migrations" (#85).

### 8. Observability first; auxiliary work never fails the money path (~17)

- Non-critical side effects in payment flows are fire-and-forget: "we should not make it
  fail for the whole payment flow, lets just record it with recordExceptionInCurrentSpan"
  (#643); "this should not be returned, please only record it in the span" and
  "fire and forget" (#463).
- New services get tracing from day one: "please add tracing manually" (#158); "at least
  initially lets register them with tracing (check other services), if it generates a spike
  in honeycomb usage we can exclude it in config" (#463).
- No PII in spans (phone number removed from trace attributes, #157). Use the logger,
  never `console.log` (#205).
- Alert noise is a maintained budget: several maintainer PRs exist purely to silence false
  Honeycomb alerts (#350, #429, #440).
- Do not mask symptoms to make CI green: "this should not be removed, if the problem is in
  other PR this will hide the real issue" (#657).

### 9. Database and migration discipline (~15)

- Migrations are append-only: "please dont modify old migrations" (#85). Destructive
  cleanup (`$unset` etc.) is deferred to a separate PR after the migration is verified in
  production (#85 -> #124).
- SQL correctness is reviewed line by line: "Add `ON CONFLICT` and check table constraint
  is correctly setup (transaction_id must be unique right?) although probably atomic upsert
  is better here" (#462); "please dont use `ON DELETE CASCADE`" (#462); "add a size and
  constraint" on bare VARCHARs (#462).
- Derived state comes from views over the source of truth, not cron jobs: "this must be a
  view, api_key_transactions should be the source of truth... a job is not necessary if you
  implement the view correctly" (#272).
- Rust service schema changes require `sqlx prepare` and the docker-compose env plumbing
  in the same PR (#462, #463).
- Unique-index fields are `required`; mutable documents carry `updatedAt` (#85).

### 10. Config, API design restraint, and fail-closed defaults (~14)

- Queries are pure: "this is just a query and should not update the status of a quote, we
  should not enable this at graphql level" (#205).
- Defaults live in one declared place: the GraphQL input ("default must be in the input",
  #131) or `config/schema.ts` ("we already have default value in
  core/api/src/config/schema.ts so `|| false` is not required", #643), never inline
  fallbacks or env defaults in code ("this must be set by node, having a default here is
  not a good practice", #158).
- Misconfiguration fails at startup, not at request time: fee strategies resolved by name
  "throw so it will not allow to start the servers if there is a miss configuration"
  (#336); env parsing made to fail at boot (#158).
- Behavior changes ship behind default-off flags: `skipFeeReimbursement` "No behavior
  change until the flag is flipped" (#643), `allowUsernameSetup` (#634),
  `test_accounts_captcha` (#454).
- Config changes need their deployments counterpart: "please add it to deployments" (#461).

### 11. Anticipate production, not just the happy path (~12)

- Lifecycle completeness: "what happen if it is a hold invoice and reach timeout? I dont
  see changes in trigger and/or related methods so this is missing" and "are you sure you
  are not missing other ln payments mutations?" (#272).
- Environment skew: "probably this will cause problems in staging/prod, please return the
  payouts that match queues in bria (like an inner join :) )" (#92).
- Consumer impact: "does this block something? did you check the behavior with the
  consumer?" (#462); the mobile-schema-compatibility gate exists for the same reason.
- Money paths demand atomicity and idempotency (atomic check-and-record upserts in #462,
  saturating arithmetic and idempotent retries in #505).

## Area checklists

### GraphQL schema changes

- [ ] Edited the TS type objects (code-first), not the `.graphql` SDLs; ran
      `./dev/bin/update-schemas.sh` (or `buck2 run //core/api:update-public-schema` /
      `:update-admin-schema`, `//dev:update-supergraph`) (#664, #328, #157)
- [ ] `Check SDLs` and `GraphQL Inspector` green; breaking changes discussed, mobile
      compatibility check passes (#85)
- [ ] Mutations named object-first with the verb at the end; queries side-effect free
      (#85, #205)
- [ ] Argument defaults declared on the input (`defaultValue`), not in resolver logic (#131)
- [ ] Public descriptions readable by API consumers, no internal jargon (#92)
- [ ] New errors registered in `error-map.ts`; prefer one mutation + enum over N
      near-duplicates (#462)
- [ ] E2e bats coverage using the same operation the real client sends (#85, #423)

### MongoDB / SQL migrations

- [ ] No edits to old migrations; destructive cleanup split into a follow-up PR (#85, #124)
- [ ] Columns sized and constrained; unique constraints match code assumptions; upserts via
      `ON CONFLICT`; no `ON DELETE CASCADE` (#462)
- [ ] Views over the source of truth instead of denormalizing jobs (#272)
- [ ] Rust services: `.sqlx` regenerated (`sqlx prepare`), docker-compose/env plumbing
      updated (#462, #463)

### Payments / ledger

- [ ] Limit checks reuse the existing checkers (`app/accounts/account-limit.ts`), not
      re-implemented (#463)
- [ ] Auxiliary calls are fire-and-forget with span-recorded exceptions; nothing new can
      abort a payment (#643, #463)
- [ ] Hold-invoice, timeout, and trigger paths handled for every affected mutation (#272)
- [ ] Ledger changes go through entry builders with typed `LedgerTransactionType` metadata,
      and the tx-history translation is verified (#643)

### Errors and observability

- [ ] New bounded context: `errors.ts` in the domain, wired into `app/errors.ts` and
      `graphql/error-map.ts` (#85, #463)
- [ ] Specific error per failure mode; external errors parsed, never passed through (#205, #272)
- [ ] `ErrorLevel`/severity justified (critical pages someone) (#463)
- [ ] Tracing on new services; no PII in spans; logger instead of console.log (#158, #157, #205)

### Config and feature flags

- [ ] Defaults in `config/schema.ts` or the GraphQL input, nowhere else (#643, #131)
- [ ] Invalid config fails server startup (#336, #158)
- [ ] Behavior change behind a default-off flag (#643, #634)
- [ ] Deployment repo updated when config shape changes (#461)

### Tests

- [ ] Unit specs for domain logic; bats for anything hitting a running server; no new
      integration tests without strong justification (#643, #157, #92)
- [ ] Coverage exercises the fundamental side effect, edge cases, and concurrency where
      relevant (#417, #462)
- [ ] Success and failure cases per permission group / role (#158)
- [ ] Bats tests order-independent; `*.spec.ts` naming (#455, #417)

### Frontends (apps/)

- [ ] `services/graphql/generated.ts` regenerated via codegen, never hand-edited
- [ ] Schema changes land in core first; app integration can be a stacked follow-up (#519)

## Generated or CI-managed files: never hand-edit

| File(s) | Regenerate with |
| --- | --- |
| `core/api/src/graphql/public/schema.graphql`, `core/api/src/graphql/admin/schema.graphql` | `./dev/bin/update-schemas.sh` or `buck2 run //core/api:update-public-schema` / `:update-admin-schema` |
| `core/api-keys/subgraph/schema.graphql`, `core/notifications/subgraph/schema.graphql` | `buck2 run //core/<svc>:update-schema` |
| `dev/config/apollo-federation/supergraph.graphql` | `buck2 run //dev:update-supergraph` |
| `apps/*/services/graphql/generated.ts` (and `apps/admin-panel/generated.ts`) | graphql-codegen per app (`codegen.yml`) |
| `core/api/src/services/{notifications,api-keys}/proto` clients | `pnpm codegen:notifications` / `codegen:api-keys` (buf) |
| `core/{api-keys,notifications}/.sqlx/*.json` | `cargo sqlx prepare` |
| `quickstart/` | Updated automatically by CI from `dev/` (#424, #531) |
| `pnpm-lock.yaml` | Only via `package.json` changes (#158) |
| `prelude/`, `third-party/macros` | vendir (`vendir.yml`); update at the source |
| Old migration files | Never; write a new migration (#85) |

## Known debt and waivers on record

- Contacts-cleanup `$unset` migration consciously deferred from #85 to #124 pending prod
  verification of the main migration.
- Audit reason field on admin mutations: "probably we will need to implement this for all
  admin methods but not in this PR" (#117).
- Integration test suite is being wound down in favor of unit + bats (#643); do not grow it.
- The Buck `eslint()` target is temporarily disabled (ESLint 9 compatibility); lint runs
  via the `eslint-check` pnpm task.
- `Generate GraphQL Docs` on main has been chronically red and tolerated; do not treat it
  as a signal on your PR.

## Reviewer quick checklist

```
Title: conventional commit, scoped; it becomes the squash commit.
Scope: one goal; risky follow-ups split out; big features stacked in parts.
Description: matches the diff, declares exclusions/tradeoffs, has a test plan.
Layers: domain decides, services parse/throw, app orchestrates/returns errors,
        graphql translates. No casts, no classes, no vendor deps in core.
Types: branded domain types with checkedToX constructors; no number/any/!/as.
Errors: specific, in the domain's errors.ts, wired to app/errors.ts + error-map.ts;
        severity justified (critical pages someone).
Tests: unit for domain, bats for server behavior, no new integration tests;
       covers the actual side effect, failure cases, and concurrency.
DB: append-only migrations, constraints/upserts reviewed, no ON DELETE CASCADE,
    views over jobs, sqlx prepare run.
Money paths: auxiliary work fire-and-forget with span exceptions; hold-invoice
             and timeout paths handled; atomic and idempotent.
Config: defaults in schema/input only; fail at startup; default-off flags;
        deployments repo updated.
Generated files untouched; schemas regenerated; noise (comments, console.log,
        dead params, duplicate errors/mutations) deleted.
```

Author response protocol in one line: push the fix, reply on every thread with the commit
link or the evidence for why no change is needed, and never delete code to dodge a question.
