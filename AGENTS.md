# Blink - AI Agent Guidelines

## Documentation

Based on the PR's changed files, read relevant docs thoroughly:

| Document | When to Read |
|----------|--------------|
| `docs/bmad/architecture.md` | Service architecture, data flows, auth stack, payment processing |
| `docs/bmad/api-contracts.md` | GraphQL schema changes, mutations, authentication flows |
| `docs/bmad/data-models.md` | MongoDB/PostgreSQL schema changes, new collections/tables |
| `docs/bmad/source-tree.md` | New files, directory structure, understanding code organization |
| `docs/bmad/devops.md` | Docker, CI/CD, build system, deployment changes |

**Then read `docs/bmad/index.md`** - master index linking to all brownfield documentation.

**Existing repo docs:**
| Document | When to Read |
|----------|--------------|
| `docs/DEVELOPMENT_ENVIRONMENT.md` | Dev setup, Nix, Tilt |
| `docs/BUCK2.md` | Build system changes |
| `core/api/src/services/ledger/README.md` | Ledger/accounting changes |

## Critical Rules (Always Apply)

### Generated Files - DO NOT MODIFY
- `core/api/src/graphql/*/schema.graphql` outputs are derived from code
- `**/generated.ts` files from GraphQL codegen
- `core/api-keys/.sqlx/` query cache
- `core/notifications/.sqlx/` query cache

### Ledger & Payments
- All money movements use double-entry ledger (Medici) - debits must equal credits
- Payment mutations must handle idempotency via `PaymentFlowState`
- Never retry failed Lightning payments automatically (user must re-initiate)
- USD wallet amounts are in cents, BTC in satoshis

### Security
- Secrets → environment variables, never in code
- API keys stored as SHA-256 hashes, never plaintext
- Phone numbers stored in separate `User` collection from `Account`
- All admin mutations require elevated JWT scopes

### Authentication
- Oathkeeper validates all requests before they hit API
- Account ID comes from JWT claims, never from user input
- Rate limits enforced via Redis per-account

### Database
- MongoDB migrations in `core/api/src/migrations/` - run in order
- PostgreSQL migrations via sqlx - separate for api-keys and notifications
- Always use transactions for multi-document MongoDB operations

### Code Organization (core/api)
- `domain/` = pure business logic, no I/O
- `app/` = use cases, orchestrates domain + services
- `services/` = external integrations (DB, LND, etc.)
- `graphql/` = presentation layer only

### Rust Services
- Use `tracing` for logging, not `println!`
- All errors must implement proper error types
- gRPC services use tonic

## Monorepo Structure

```
apps/           → Next.js web apps (dashboard, admin-panel, pay, map, voucher, consent)
core/           → Backend services (api, api-keys, notifications, etc.)
lib/            → Shared libraries
bats/           → Integration tests
dev/            → Development configs
```

## Quick Commands

```bash
# Dev environment
nix develop && tilt up

# Build
buck2 build //core/api:api

# Test
buck2 test //core/api:test-integration

# Migrations
buck2 run //core/api:mongodb-migrate
```
