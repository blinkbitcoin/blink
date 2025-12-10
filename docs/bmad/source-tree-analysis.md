# Blink Source Tree Analysis

**Generated**: 2025-12-09 | **Scan Level**: Deep

## Repository Structure Overview

```
blink/
├── .bmad/                      # BMAD workflow configuration
├── .claude/                    # Claude Code configuration
├── .github/                    # GitHub Actions and templates
├── apps/                       # 🌐 Frontend applications (Next.js)
│   ├── admin-panel/           # Support team interface (port 3004)
│   ├── consent/               # OAuth consent screens (port 3000)
│   ├── dashboard/             # Admin dashboard (port 3001)
│   ├── map/                   # Merchant directory (port 3005)
│   ├── pay/                   # Point of Sale (port 3002)
│   └── voucher/               # Bitcoin voucher system (port 3006)
├── bats/                       # 🧪 Integration tests (BATS framework)
│   ├── admin-gql/             # Admin API tests
│   ├── core/                  # Core functionality tests
│   ├── gql/                   # Public API tests
│   └── helpers/               # Test helpers and utilities
├── ci/                         # 🔧 CI/CD configuration
│   ├── apps/                  # App-specific CI configs
│   ├── config/                # Shared CI configuration
│   ├── core/                  # Core service CI configs
│   ├── tasks/                 # CI task definitions
│   └── vendor/                # Vendored CI tools
├── core/                       # 🔥 Backend services
│   ├── api/                   # Main GraphQL API (TypeScript) ⭐
│   ├── api-cron/              # Scheduled tasks service
│   ├── api-exporter/          # Prometheus metrics exporter
│   ├── api-keys/              # API key management (Rust) ⭐
│   ├── api-trigger/           # Event trigger service
│   ├── api-ws-server/         # WebSocket subscription server
│   └── notifications/         # Push/email notifications (Rust) ⭐
├── dev/                        # 🛠 Development environment
│   ├── .envs/                 # Environment variable templates
│   ├── bin/                   # Development scripts
│   ├── config/                # Development configuration
│   ├── core-bundle/           # Bundled core services
│   └── helpers/               # Development helpers
├── docs/                       # 📚 Documentation
├── lib/                        # 📦 Shared libraries
│   ├── es-entity-rs/          # Event sourcing entities (Rust)
│   ├── eslint-config/         # Shared ESLint config (TS)
│   ├── galoy-components/      # Shared React components (TS)
│   ├── gt3-server-node-express-sdk/ # GeeTest SDK (TS)
│   ├── job-executor-rs/       # Background jobs (Rust)
│   └── tracing-rs/            # OpenTelemetry tracing (Rust)
├── prelude/                    # Buck2 build system prelude
├── quickstart/                 # Quick start for integrations
├── third-party/                # Third-party dependencies
│   ├── macros/                # Buck2 macros
│   ├── node/                  # Node.js dependencies
│   ├── patches/               # Dependency patches
│   └── rust/                  # Rust dependencies
├── toolchains/                 # Buck2 toolchain definitions
└── vendir/                     # Vendored external tools
```

## Critical Directories Explained

### `/core/api/` - Main GraphQL API Server

The heart of the Blink backend. This is a TypeScript/Node.js application providing the primary GraphQL API.

```
core/api/
├── src/
│   ├── app/                   # 🎯 Application layer (use cases)
│   │   ├── accounts/          # Account management operations
│   │   ├── admin/             # Admin operations
│   │   ├── authentication/    # Auth flows (phone, email, TOTP)
│   │   ├── lightning/         # Lightning Network operations
│   │   ├── merchants/         # Merchant directory operations
│   │   ├── on-chain/          # On-chain Bitcoin operations
│   │   ├── payments/          # Payment processing ⭐
│   │   ├── prices/            # Price fetching and conversion
│   │   ├── quiz/              # Onboarding quiz
│   │   ├── transactions/      # Transaction queries
│   │   ├── users/             # User management
│   │   ├── wallets/           # Wallet operations ⭐
│   │   └── support/           # Support chat
│   ├── config/                # Configuration management
│   ├── debug/                 # Debug utilities
│   ├── domain/                # 🏛 Domain layer (business logic)
│   │   ├── accounts/          # Account domain
│   │   ├── bitcoin/           # Bitcoin primitives
│   │   ├── contacts/          # Contact management
│   │   ├── fiat/              # Fiat currency handling
│   │   ├── ledger/            # Internal ledger logic ⭐
│   │   ├── notifications/     # Notification domain
│   │   ├── payments/          # Payment flow logic ⭐
│   │   ├── shared/            # Shared domain utilities
│   │   ├── users/             # User domain
│   │   └── wallets/           # Wallet domain ⭐
│   ├── graphql/               # 🔌 GraphQL layer
│   │   ├── admin/             # Admin API schema & resolvers
│   │   ├── public/            # Public API schema & resolvers ⭐
│   │   └── shared/            # Shared GraphQL utilities
│   ├── migrations/            # MongoDB migrations
│   ├── servers/               # 🚀 Server entry points
│   │   ├── graphql-main-server.ts  # Main API server ⭐
│   │   ├── trigger.ts         # Event trigger server
│   │   ├── ws-server.ts       # WebSocket server
│   │   ├── cron.ts            # Cron job server
│   │   └── exporter.ts        # Metrics exporter
│   ├── services/              # 🔗 Infrastructure services
│   │   ├── bria/              # On-chain operations (gRPC)
│   │   ├── kratos/            # Identity management
│   │   ├── ledger/            # Ledger service (medici)
│   │   ├── lnd/               # Lightning Network (LND)
│   │   ├── mongoose/          # MongoDB repositories
│   │   ├── notifications/     # Notification dispatch
│   │   ├── price/             # Price service (gRPC)
│   │   └── redis/             # Redis client
│   └── utils/                 # Utility functions
└── test/                      # Unit and integration tests
    ├── integration/           # Integration tests
    └── unit/                  # Unit tests
```

### `/core/api-keys/` - API Key Management (Rust)

Rust-based service for managing API keys with event sourcing.

```
core/api-keys/
├── src/
│   ├── app/                   # Application logic
│   ├── graphql/               # GraphQL schema (async-graphql)
│   ├── primitives/            # Core primitives
│   ├── server/                # Axum HTTP server
│   └── lib.rs                 # Library entry point
├── migrations/                # PostgreSQL migrations
└── Cargo.toml                 # Rust dependencies
```

### `/core/notifications/` - Notification Service (Rust)

Rust service for push notifications (FCM) and email (SMTP).

```
core/notifications/
├── src/
│   ├── app/                   # Application layer
│   ├── email_executor/        # Email sending logic
│   ├── graphql/               # GraphQL API
│   ├── grpc_server/           # gRPC server (for internal calls)
│   ├── job/                   # Background job definitions
│   ├── messages/              # Message templates
│   ├── primitives/            # Core primitives
│   └── push_executor/         # Push notification logic (FCM)
├── locales/                   # i18n translations
├── proto/                     # gRPC proto definitions
└── Cargo.toml                 # Rust dependencies
```

### `/apps/` - Frontend Applications

All Next.js 14 applications with App Router:

```
apps/{app}/
├── app/                       # Next.js App Router
│   ├── api/                   # API routes
│   ├── layout.tsx             # Root layout
│   └── page.tsx               # Home page
├── components/                # React components
├── lib/                       # Utilities
├── graphql/                   # GraphQL queries/mutations
├── public/                    # Static assets
├── cypress/                   # E2E tests
└── package.json               # Dependencies
```

## Entry Points

| Service | Entry Point | Description |
|---------|-------------|-------------|
| **Main API** | `core/api/src/servers/graphql-main-server.ts` | GraphQL API server |
| **WebSocket** | `core/api/src/servers/ws-server.ts` | GraphQL subscriptions |
| **Cron** | `core/api/src/servers/cron.ts` | Scheduled tasks |
| **Trigger** | `core/api/src/servers/trigger.ts` | Event processing |
| **Exporter** | `core/api/src/servers/exporter.ts` | Prometheus metrics |
| **API Keys** | `core/api-keys/src/main.rs` | API key service |
| **Notifications** | `core/notifications/src/main.rs` | Notification service |
| **Consent App** | `apps/consent/app/layout.tsx` | OAuth consent |
| **Dashboard** | `apps/dashboard/app/layout.tsx` | Admin dashboard |
| **Pay App** | `apps/pay/app/layout.tsx` | Point of sale |

## Key Code Patterns

### Error Handling Pattern
All domain operations return `Result | Error` using a Result type pattern:

```typescript
// domain/errors.ts
export class DomainError extends Error { level: ErrorLevel }
export class ValidationError extends DomainError {}
export class RepositoryError extends DomainError {}
export class CouldNotFindError extends RepositoryError {}
// ... many specific error types

// Usage in app layer
const result = await someOperation()
if (result instanceof Error) return result
```

### Repository Pattern
Data access through repository interfaces with Mongoose implementations:

```typescript
// services/mongoose/index.ts
export const AccountsRepository = () => ({ ... })
export const WalletsRepository = () => ({ ... })
export const UsersRepository = () => ({ ... })
```

### Application Layer Pattern
Use cases in `/app/*` that orchestrate domain logic:

```typescript
// app/payments/send-lightning.ts
export const payInvoiceByWalletId = async ({
  uncheckedPaymentRequest,
  memo,
  senderWalletId,
  senderAccount,
}: PayInvoiceByWalletIdArgs) => {
  // Validation
  const validated = await validateInvoicePaymentInputs(...)
  if (validated instanceof Error) return validated

  // Business logic
  const paymentFlow = await getPaymentFlow(validated)
  if (paymentFlow instanceof Error) return paymentFlow

  // Execution
  return executePaymentViaLn({ ... })
}
```

### Tracing Pattern
All app functions are wrapped with OpenTelemetry spans:

```typescript
// app/index.ts
allFunctions[subModule][fn] = wrapAsyncToRunInSpan({
  namespace: `app.${subModule.toLowerCase()}`,
  fn: allFunctions[subModule][fn],
})
```

### Lock Pattern
Distributed locking for concurrent operations:

```typescript
await LockService().lockWalletId(senderWalletId, async (signal) =>
  lockedPaymentViaIntraledgerSteps({ signal, ... })
)
```

## Data Flow

### Payment Flow (Lightning)

```
GraphQL Mutation → App Layer → Domain Validation → Payment Flow Builder
    ↓                                                      ↓
GraphQL Response ← Transaction ← Ledger Record ← LND Payment
```

### Authentication Flow

```
Phone/Email → Kratos Identity → Session Token → GraphQL Context
```

### Notification Flow

```
Transaction Event → NotificationsService → gRPC → Rust Service → FCM/Email
```

## Integration Points

| Source | Target | Protocol | Purpose |
|--------|--------|----------|---------|
| **core-api** | MongoDB | MongoDB Protocol | Primary data storage |
| **core-api** | Redis | Redis Protocol | Cache, locks, pub/sub |
| **core-api** | LND | gRPC | Lightning operations |
| **core-api** | Bria | gRPC | On-chain operations |
| **core-api** | Kratos | REST | Identity management |
| **core-api** | Notifications | gRPC | Notification dispatch |
| **core-api** | Price Service | gRPC | Price data |
| **core-api-keys** | PostgreSQL | PostgreSQL | API key storage |
| **core-notifications** | PostgreSQL | PostgreSQL | Notification storage |
| **core-notifications** | FCM | REST | Push notifications |
| **core-notifications** | SMTP | SMTP | Email delivery |
| **apps/*** | core-api | GraphQL | API access |
| **apps/*** | Hydra | REST | OAuth flows |

## File Naming Conventions

| Pattern | Example | Purpose |
|---------|---------|---------|
| `*.ts` | `send-lightning.ts` | TypeScript source |
| `*.types.d.ts` | `index.types.d.ts` | Type declarations |
| `*.graphql` | `schema.graphql` | GraphQL schema |
| `*.proto` | `notifications.proto` | gRPC definitions |
| `*.test.ts` | `payment.test.ts` | Unit tests |
| `Cargo.toml` | - | Rust package manifest |
| `package.json` | - | Node package manifest |

---

*This document provides navigation for AI-assisted development and brownfield PRD creation.*
