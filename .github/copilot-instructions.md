# Blink — Workspace Instructions

Bitcoin banking platform. Node.js/TypeScript + Rust monorepo.

## Architecture

- **GraphQL API** (`core/api/`): Main server, double-entry ledger (Medici/MongoDB), payment orchestration
- **Rust microservices** (`core/api-keys/`, `core/notifications/`): gRPC services with Tonic
- **Frontend apps** (`apps/`): Next.js 14 — dashboard, admin-panel, consent, pay, map, voucher
- **Shared libs** (`lib/`): ESLint config, components, Rust crates (es-entity-rs, job-executor-rs, tracing-rs)
- **Data stores**: MongoDB (ledger/state), Redis (distributed locks, rate limiting), PostgreSQL (Rust services)
- **Auth**: Ory stack — Oathkeeper, Kratos, Hydra
- **Bitcoin**: LND (hot wallet/Lightning), Bitcoin Core (cold storage/multisig via Specter), Bria (UTXO management)

See [ARCHITECTURE.md](../ARCHITECTURE.md) for full system design. Dev environment setup: [docs/DEVELOPMENT_ENVIRONMENT.md](../docs/DEVELOPMENT_ENVIRONMENT.md).

## Build & Test

```bash
pnpm install                       # Only pnpm — npm blocked by preinstall hook
# Core API
cd core/api
pnpm run build                     # TypeScript compilation
pnpm run tsc-check                 # Type-check only
pnpm run eslint-check              # Lint
pnpm run test:unit                 # Jest unit tests
pnpm run test:integration          # Requires full stack, runs --runInBand

# Rust services
cargo build                        # From repo root
cargo test                         # Unit tests
cargo clippy                       # Lint

# Frontend (e.g. dashboard)
cd apps/dashboard
pnpm run dev                       # Dev server :3001
pnpm run build && pnpm start
```

CI uses **Buck2** with label-based test selection. Nix flake provides reproducible dev environment.

## Conventions

- **Symbol-branded types** for primitives: `EncodedPaymentRequest = string & { readonly brand: unique symbol }` — prevents mixing string types
- **Type declaration files** (`.d.ts`) for global types — avoid explicit imports
- **Error types** extend `DomainError` base class
- **ESLint**: `@galoy/eslint-config` (workspace lib)
- **GraphQL codegen**: `@graphql-codegen/cli` for TypeScript types from schema
- **Proto codegen**: `buf` for gRPC types
- **Indentation**: TS/Nix/sh = 2 spaces, Rust = 4 spaces. Max line: Nix/sh=80, Rust=100
- **Migrations**: MongoDB via migrate-mongo in `core/api/src/migrations/`
- **Monorepo deps**: `workspace:^` specifier for cross-package references

## Pitfalls

- **macOS file descriptors**: Buck2 needs high ulimit (`ulimit -n <count>`)
- **Integration tests**: Must run `--runInBand` (sequential) — tests share services
- **Vendored code**: `third-party/`, `vendir/` — never edit directly
- **Docker**: Must match native arch (aarch64 for Apple Silicon)
