# Blink Architecture Documentation

**Generated**: 2025-12-09 | **Scan Level**: Deep | **Type**: Brownfield Analysis

## Architecture Overview

Blink follows a **microservices architecture** with a monorepo structure. Services communicate via GraphQL, gRPC, and message queues, deployed to Kubernetes.

```
                                    ┌─────────────────────────────────────────────┐
                                    │              Client Applications            │
                                    │  (Mobile, Dashboard, Pay, Consent, etc.)   │
                                    └─────────────────────┬───────────────────────┘
                                                          │ GraphQL/WebSocket
                                    ┌─────────────────────▼───────────────────────┐
                                    │           Ory Oathkeeper (Auth Proxy)       │
                                    └─────────────────────┬───────────────────────┘
                                                          │
              ┌────────────────────┬──────────────────────┼──────────────────────┬────────────────────┐
              │                    │                      │                      │                    │
              ▼                    ▼                      ▼                      ▼                    ▼
   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │   core-api       │  │  core-api-ws     │  │  core-api-keys   │  │ core-notifications│  │  core-api-cron   │
   │  (GraphQL API)   │  │   (WebSocket)    │  │     (Rust)       │  │     (Rust)       │  │  (Scheduled)     │
   └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
            │                     │                     │                     │                     │
            ├─────────────────────┼─────────────────────┼─────────────────────┼─────────────────────┤
            │                     │                     │                     │                     │
            ▼                     ▼                     ▼                     ▼                     ▼
   ┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
   │                                    Infrastructure Services                                          │
   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
   │  │ MongoDB  │  │PostgreSQL│  │  Redis   │  │   LND    │  │   Bria   │  │  Kratos  │  │  Hydra   │ │
   │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
   └────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Layered Architecture (core-api)

The main API follows a **clean architecture** pattern with four distinct layers:

### Layer 1: GraphQL Layer (`/graphql`)
**Responsibility**: API contract, request/response mapping, authorization

```
graphql/
├── public/           # Client-facing API
│   ├── schema.graphql   # GraphQL schema definition
│   ├── root/         # Query/Mutation resolvers
│   └── types/        # Type resolvers
├── admin/            # Admin API
│   ├── schema.graphql
│   └── resolvers/
└── shared/           # Shared types and utilities
```

**Key Patterns**:
- Schema-first design
- Authorization via `graphql-shield`
- Error mapping to GraphQL errors
- Connection-based pagination (Relay spec)

### Layer 2: Application Layer (`/app`)
**Responsibility**: Use case orchestration, transaction boundaries

```
app/
├── accounts/         # Account operations
├── authentication/   # Auth flows
├── lightning/        # LN operations
├── payments/         # Payment processing
├── wallets/          # Wallet operations
└── index.ts          # Module exports with tracing
```

**Key Patterns**:
- Each function is a use case
- Returns `Result | ApplicationError`
- Coordinates domain objects and services
- Wrapped with OpenTelemetry tracing

### Layer 3: Domain Layer (`/domain`)
**Responsibility**: Business rules, value objects, domain events

```
domain/
├── accounts/         # Account aggregate
├── bitcoin/          # Bitcoin primitives
├── ledger/           # Ledger domain
├── payments/         # Payment flow
├── shared/           # Shared value objects
│   ├── primitives.ts # Base types (WalletId, Amount, etc.)
│   ├── errors.ts     # Domain error hierarchy
│   └── safe.ts       # Safe computation utilities
└── wallets/          # Wallet aggregate
```

**Key Patterns**:
- Rich domain models with validation
- Immutable value objects
- Type-safe error handling
- No external dependencies

### Layer 4: Services Layer (`/services`)
**Responsibility**: Infrastructure, external integrations

```
services/
├── bria/             # On-chain Bitcoin (gRPC)
├── kratos/           # Identity management (REST)
├── ledger/           # Double-entry accounting (medici)
├── lnd/              # Lightning Network (gRPC)
├── mongoose/         # MongoDB repositories
├── notifications/    # Notification dispatch (gRPC)
├── price/            # Price service (gRPC)
└── redis/            # Caching and locking
```

**Key Patterns**:
- Repository pattern for data access
- Adapter pattern for external services
- Circuit breaker for resilience
- Connection pooling

## Data Architecture

### MongoDB (Primary Store)
**Purpose**: Accounts, users, wallets, transactions, invoices

**Collections**:
| Collection | Purpose | Key Indexes |
|------------|---------|-------------|
| `accounts` | Account data | `kratosUserId`, `username` |
| `users` | User profiles | `phone`, `email` |
| `wallets` | BTC/USD wallets | `accountId`, `currency` |
| `walletinvoices` | LN invoices | `paymentHash`, `walletId` |
| `medici_transactions` | Ledger entries | `accounts`, `book`, `datetime` |
| `medici_journals` | Journal entries | `_id`, `datetime` |

### PostgreSQL (Rust Services)
**Purpose**: API keys, notifications, job queues

**Schemas**:
- `api_keys`: Key storage, permissions, expiry
- `notifications`: Push tokens, email preferences
- `sqlxmq`: Background job queue

### Redis
**Purpose**: Caching, distributed locks, pub/sub

**Key Patterns**:
| Pattern | Example | TTL |
|---------|---------|-----|
| Price cache | `price:BTC:USD` | 30s |
| Rate limit | `ratelimit:phone:+1234` | 60s |
| Wallet lock | `lock:wallet:{id}` | 30s |
| Session | `session:{token}` | 24h |

## API Design

### Public GraphQL API

**Endpoint**: `/graphql`

**Authentication**: JWT Bearer token (Kratos session or API key)

**Key Types**:
```graphql
type Wallet {
  id: ID!
  walletCurrency: WalletCurrency!
  balance: SignedAmount!
  transactions: TransactionConnection!
}

type LnInvoice {
  paymentHash: PaymentHash!
  paymentRequest: LnPaymentRequest!
  satoshis: SatAmount!
  expiresAt: Timestamp!
}

type OnChainAddress {
  address: OnChainAddress!
}
```

**Key Mutations**:
- `lnInvoiceCreate` / `lnInvoiceCreateOnBehalfOfRecipient`
- `lnInvoiceFeeProbe` / `lnNoAmountInvoiceFeeProbe`
- `lnInvoicePaymentSend` / `lnNoAmountInvoicePaymentSend`
- `onChainAddressCreate` / `onChainPaymentSend`
- `intraLedgerPaymentSend` / `intraLedgerUsdPaymentSend`

### Admin GraphQL API

**Endpoint**: `/admin/graphql`

**Authentication**: Internal service auth or admin JWT

**Key Operations**:
- Account management (status, level, limits)
- Merchant approval
- Transaction monitoring
- System operations (cold storage rebalance)

### gRPC APIs

| Service | Proto File | Purpose |
|---------|------------|---------|
| Notifications | `notifications.proto` | Send push/email |
| Price | `price.proto` | Get exchange rates |
| Bria | `bria.proto` | On-chain operations |

## Security Architecture

### Authentication Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │────▶│ Kratos   │────▶│ Session  │────▶│   API    │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                                                   │
     │         ┌──────────┐     ┌──────────┐            │
     └────────▶│Oathkeeper│────▶│ JWT Auth │────────────┘
               └──────────┘     └──────────┘
```

**Methods**:
1. **Phone/SMS**: OTP via Twilio
2. **Email**: Magic link or OTP
3. **TOTP**: Authenticator app
4. **Telegram Passport**: Identity verification
5. **API Keys**: Scoped keys for programmatic access

### Authorization

**Account Levels**:
| Level | Verification | Limits |
|-------|--------------|--------|
| `ZERO` | None | $0 daily |
| `ONE` | Phone | $1000/day |
| `TWO` | KYC | $10000/day |

**Rate Limiting**:
- Per-endpoint limits
- Velocity checks per account
- GeeTest CAPTCHA for high-risk operations

### Security Controls

- **Input Validation**: Zod schemas, domain validators
- **SQL Injection**: Parameterized queries (Mongoose, SQLx)
- **XSS**: React auto-escaping, CSP headers
- **CSRF**: Token-based protection in consent flows
- **Secrets**: Environment variables, no hardcoded credentials

## Observability

### Tracing (OpenTelemetry)

**Implementation**: `@opentelemetry/*` packages + `tracing-rs`

**Spans**:
- HTTP requests
- GraphQL operations
- Database queries
- gRPC calls
- Background jobs

### Metrics (Prometheus)

**Endpoint**: `/metrics` (via core-api-exporter)

**Key Metrics**:
- `galoy_payments_total` - Payment counters
- `galoy_wallet_balance` - Wallet balances
- `galoy_lnd_balance` - LND node balances
- `galoy_request_duration` - API latency

### Logging (Pino)

**Format**: Structured JSON

**Fields**:
- `level`, `time`, `msg`
- `traceId`, `spanId`
- `accountId`, `walletId`
- `error` (with stack trace)

## Deployment Architecture

### Kubernetes Resources

| Resource | Count | Purpose |
|----------|-------|---------|
| `core-api` | 3+ pods | Main API (HPA) |
| `core-api-ws` | 2+ pods | WebSocket |
| `core-api-trigger` | 1 pod | Event processing |
| `core-api-cron` | 1 pod | Scheduled tasks |
| `core-api-exporter` | 1 pod | Metrics |
| `core-api-keys` | 2+ pods | API keys |
| `core-notifications` | 2+ pods | Notifications |

### External Dependencies

| Service | Provider | Purpose |
|---------|----------|---------|
| MongoDB | Atlas/Self-hosted | Primary DB |
| PostgreSQL | RDS/Self-hosted | Rust services |
| Redis | ElastiCache/Self-hosted | Cache |
| LND | Self-hosted | Lightning |
| Bitcoin Core | Self-hosted | On-chain |

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **GraphQL over REST** | Type safety, flexible queries, subscriptions |
| **TypeScript + Rust** | TS for rapid dev, Rust for performance-critical |
| **MongoDB + PostgreSQL** | Mongo for flexibility, Postgres for Rust/ACID |
| **Event Sourcing (Rust)** | Audit trail, temporal queries |
| **Medici for Ledger** | Double-entry accounting, built for Node.js |
| **Ory Stack for Auth** | Production-ready, standards-compliant |
| **Buck2 Build** | Fast, hermetic builds |
| **Monorepo** | Shared code, atomic changes |

## Constraints and Considerations

1. **Bitcoin Finality**: On-chain transactions require confirmations
2. **Lightning Routing**: Payments may fail due to routing
3. **Price Volatility**: BTC/USD rate changes constantly
4. **Regulatory**: KYC/AML compliance requirements
5. **Cold Storage**: Manual intervention for large withdrawals

---

*This architecture document is optimized for AI-assisted development and brownfield PRD creation.*
