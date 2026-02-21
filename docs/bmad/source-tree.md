# Blink Source Tree

## Repository Structure

```
blink/
├── apps/                    # Frontend web applications (Next.js)
│   ├── admin-panel/         # Internal admin dashboard
│   ├── consent/             # OAuth consent flow
│   ├── dashboard/           # User dashboard
│   ├── map/                 # Merchant map
│   ├── pay/                 # Payment link / PoS
│   └── voucher/             # Voucher redemption
│
├── core/                    # Backend services
│   ├── api/                 # Main GraphQL API (TypeScript)
│   ├── api-cron/            # Scheduled jobs runner
│   ├── api-exporter/        # Prometheus metrics exporter
│   ├── api-keys/            # API key management (Rust)
│   ├── api-trigger/         # Event-driven actions
│   ├── api-ws-server/       # WebSocket server
│   ├── id-tokens/           # ID token management
│   └── notifications/       # Push/email notifications (Rust)
│
├── lib/                     # Shared libraries
│   ├── eslint-config/       # Shared ESLint config
│   ├── galoy-components/    # Shared React components
│   ├── gt3-server-node-express-sdk/  # GeeTest CAPTCHA SDK
│   ├── tracing-rs/          # Rust tracing utilities
│   ├── es-entity-rs/        # Rust event sourcing
│   └── job-executor-rs/     # Rust job executor
│
├── bats/                    # Integration tests (BATS framework)
│   ├── admin-gql/           # Admin API tests
│   ├── core/                # Core service tests
│   ├── gql/                 # Public API tests
│   └── helpers/             # Test utilities
│
├── ci/                      # CI/CD configuration
│   ├── apps/                # App-specific CI
│   ├── core/                # Core service CI
│   ├── tasks/               # Concourse tasks
│   └── vendor/              # Third-party CI configs
│
├── dev/                     # Development utilities
│   └── config/              # Dev environment configs
│
├── docs/                    # Documentation
│
├── quickstart/              # Quick start scripts
│
├── vendir/                  # Vendored dependencies
│
└── _bmad/                   # BMAD workflow files
```

---

## Core API Structure (`core/api/`)

```
core/api/
├── src/
│   ├── app/                 # Application services (use cases)
│   │   ├── accounts/        # Account operations
│   │   ├── admin/           # Admin operations
│   │   ├── authentication/  # Auth flows
│   │   ├── callback/        # Webhook delivery
│   │   ├── cold-storage/    # Cold wallet ops
│   │   ├── lightning/       # LN operations
│   │   ├── merchants/       # Merchant ops
│   │   ├── payments/        # Payment processing
│   │   ├── prices/          # Price fetching
│   │   ├── support/         # Support chat
│   │   ├── users/           # User ops
│   │   └── wallets/         # Wallet ops
│   │
│   ├── domain/              # Domain models & business logic
│   │   ├── accounts/        # Account domain
│   │   ├── accounts-ips/    # IP tracking domain
│   │   ├── authentication/  # Auth domain
│   │   ├── bitcoin/         # Bitcoin primitives
│   │   ├── cache/           # Cache abstractions
│   │   ├── callback/        # Webhook domain
│   │   ├── contacts/        # Contacts domain
│   │   ├── dealer-price/    # Dealer quotes
│   │   ├── fees/            # Fee calculations
│   │   ├── fiat/            # Fiat currency
│   │   ├── ledger/          # Double-entry ledger
│   │   ├── lock/            # Distributed locking
│   │   ├── merchants/       # Merchant domain
│   │   ├── notifications/   # Notification domain
│   │   ├── payments/        # Payment domain
│   │   ├── price/           # Price domain
│   │   ├── pubsub/          # Event pub/sub
│   │   ├── quiz/            # Gamification
│   │   ├── rate-limit/      # Rate limiting
│   │   ├── shared/          # Shared primitives
│   │   ├── users/           # User domain
│   │   ├── wallet-invoices/ # Invoice domain
│   │   └── wallets/         # Wallet domain
│   │
│   ├── graphql/             # GraphQL layer
│   │   ├── admin/           # Admin schema & resolvers
│   │   └── public/          # Public schema & resolvers
│   │
│   ├── services/            # External service integrations
│   │   ├── bria/            # Onchain wallet (gRPC)
│   │   ├── dealer-price/    # Price dealer (gRPC)
│   │   ├── kratos/          # Ory Kratos identity
│   │   ├── ledger/          # Medici ledger
│   │   ├── lnd/             # Lightning Network Daemon
│   │   ├── mongoose/        # MongoDB schemas
│   │   ├── notifications/   # Notification service (gRPC)
│   │   ├── openai/          # OpenAI integration
│   │   ├── phone-provider/  # SMS/WhatsApp (Twilio)
│   │   ├── price/           # Price service (gRPC)
│   │   ├── redis/           # Redis cache
│   │   └── svix/            # Webhook delivery
│   │
│   ├── servers/             # HTTP/WS server setup
│   │
│   ├── migrations/          # MongoDB migrations
│   │
│   └── config/              # Configuration
│
├── test/                    # Tests
│   ├── integration/         # Integration tests
│   └── unit/                # Unit tests
│
└── spectaql/                # API documentation generator
```

---

## Frontend App Structure (`apps/dashboard/`)

```
apps/dashboard/
├── app/                     # Next.js App Router
│   ├── api/                 # API routes
│   │   └── auth/            # NextAuth handlers
│   ├── api-keys/            # API keys page
│   ├── batch-payments/      # Batch payment page
│   ├── callback/            # Webhook settings
│   ├── security/            # 2FA settings
│   └── transactions/        # Transaction history
│
├── components/              # React components
│   ├── side-bar/            # Navigation sidebar
│   └── transaction-details/ # Transaction detail modal
│
├── cypress/                 # E2E tests
│   ├── e2e/                 # Test specs
│   └── support/             # Test utilities
│
├── lib/                     # Utilities
│   └── graphql/             # GraphQL client & queries
│
└── public/                  # Static assets
```

---

## Rust Services Structure

### api-keys (`core/api-keys/`)

```
core/api-keys/
├── src/
│   ├── app/                 # Application layer
│   ├── graphql/             # GraphQL schema
│   ├── identity/            # Identity verification
│   └── primitives/          # Type definitions
│
├── subgraph/                # Apollo Federation subgraph
├── migrations/              # PostgreSQL migrations
└── .sqlx/                   # sqlx query cache
```

### notifications (`core/notifications/`)

```
core/notifications/
├── src/
│   ├── app/                 # Application layer
│   ├── email_executor/      # Email sending
│   ├── grpc/                # gRPC server
│   ├── job/                 # Background jobs
│   ├── messages/            # Message formatting
│   ├── notification_event/  # Event handling
│   ├── push_executor/       # Push notification sending
│   └── user_notification_settings/  # User preferences
│
├── locales/                 # i18n translations
├── templates/               # Email templates (Handlebars)
├── proto/                   # gRPC protobuf
└── migrations/              # PostgreSQL migrations
```

---

## Key Entry Points

| Service | Entry Point | Port |
|---------|-------------|------|
| API (GraphQL) | `core/api/src/servers/graphql-main-server.ts` | 4002 |
| API (Admin) | `core/api/src/servers/graphql-admin-server.ts` | 4001 |
| API (WS) | `core/api-ws-server/src/servers/ws-server.ts` | 4000 |
| API Keys | `core/api-keys/src/bin/main.rs` | 5397 |
| Notifications | `core/notifications/src/bin/main.rs` | 6685 |
| Dashboard | `apps/dashboard/` | 3001 |
| Admin Panel | `apps/admin-panel/` | 3004 |
| Pay | `apps/pay/` | 3002 |

---

## Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Root pnpm workspace |
| `pnpm-workspace.yaml` | Workspace packages |
| `Cargo.toml` | Rust workspace |
| `flake.nix` | Nix development environment |
| `Tiltfile` | Local dev orchestration |
| `docker-compose.yml` | Container development |
| `.env` | Environment variables |
| `BUCK` files | Buck2 build rules |

---

## Domain-Driven Design Layers

```
┌─────────────────────────────────────┐
│          GraphQL / REST             │  ← Presentation
├─────────────────────────────────────┤
│         Application (app/)          │  ← Use Cases
├─────────────────────────────────────┤
│          Domain (domain/)           │  ← Business Logic
├─────────────────────────────────────┤
│        Services (services/)         │  ← Infrastructure
└─────────────────────────────────────┘
```

**Dependency Rule:** Inner layers don't depend on outer layers. Domain is pure business logic.
