# Blink Architecture Documentation

> **Project:** Blink (formerly Galoy) - Bitcoin Banking Platform
> **Type:** Monorepo (pnpm + Cargo workspaces)
> **Generated:** 2025-12-22

## Executive Summary

Blink is an open-source Bitcoin banking platform providing:
- **Multi-currency wallets** (BTC and synthetic USD)
- **Lightning Network payments** (send/receive)
- **On-chain Bitcoin transactions**
- **User authentication** via phone, email, or social
- **Merchant directory** with geolocation
- **Multiple client applications** (dashboard, mobile PoS, admin)

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Client Layer                                │
├─────────────────────────────────────────────────────────────────────┤
│  Mobile App    Dashboard    Pay App    Admin Panel    Map    Voucher │
│  (External)    (Next.js)    (Next.js)  (Next.js)    (Next.js) (Next.js)
└────────┬──────────┬──────────┬──────────┬──────────────┬────────────┘
         │          │          │          │              │
         └──────────┴──────────┴──────────┴──────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Oathkeeper Proxy  │ ← JWT validation, routing
                    │    (port 4455)      │
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
┌────────▼────────┐  ┌─────────▼─────────┐  ┌───────▼───────┐
│ Apollo Router   │  │   Core API        │  │  Admin API    │
│ (Federation)    │  │ (GraphQL:4002)    │  │ (GraphQL:4001)│
└────────┬────────┘  └─────────┬─────────┘  └───────┬───────┘
         │                     │                     │
         ├─────────────────────┼─────────────────────┤
         │                     │                     │
┌────────▼────────┐  ┌─────────▼─────────┐  ┌───────▼───────┐
│   API Keys      │  │  Notifications    │  │  ID Tokens    │
│   (Rust)        │  │  (Rust)           │  │  (TypeScript) │
└─────────────────┘  └───────────────────┘  └───────────────┘
```

---

## Service Components

### Core API (`core/api`)

**Technology:** TypeScript, Node.js 20, Express, Apollo Server
**Database:** MongoDB, Redis
**Purpose:** Main business logic and GraphQL API

**Key Responsibilities:**
- Account & wallet management
- Lightning payments (via LND)
- On-chain transactions (via Bria)
- User authentication flow
- Double-entry ledger (Medici)
- Rate limiting & velocity checks

**Architecture Pattern:** Domain-Driven Design with Clean Architecture

```
src/
├── domain/       ← Pure business logic (no I/O)
├── app/          ← Use cases / application services
├── services/     ← External integrations (DB, LND, etc.)
└── graphql/      ← API presentation layer
```

### API Keys Service (`core/api-keys`)

**Technology:** Rust, Axum, async-graphql
**Database:** PostgreSQL
**Purpose:** Manages API key creation and validation

**Key Features:**
- Scoped API keys (READ, WRITE, RECEIVE)
- Hash-based key storage
- GraphQL subgraph for federation

### Notifications Service (`core/notifications`)

**Technology:** Rust, Axum
**Database:** PostgreSQL
**Purpose:** Push notifications and email delivery

**Key Features:**
- Firebase Cloud Messaging (push)
- Email via SMTP (lettre)
- i18n support (locales)
- In-app notification history
- Rate limiting / cool-off periods

### Web Applications (`apps/*`)

| App | Purpose | Key Features |
|-----|---------|--------------|
| **dashboard** | User web portal | Wallet view, transactions, API keys, security settings |
| **admin-panel** | Admin operations | Account lookup, level/status changes, merchant approval |
| **pay** | Payment links / PoS | Generate invoices, receive payments, LNURL support |
| **consent** | OAuth consent | Hydra consent UI for third-party apps |
| **map** | Merchant directory | Map of accepting businesses |
| **voucher** | Voucher system | Create and redeem BTC vouchers |

---

## Data Architecture

### Primary Datastores

| Store | Technology | Purpose | Services |
|-------|------------|---------|----------|
| **MongoDB** | MongoDB 7.0 | Accounts, wallets, transactions, ledger | core/api |
| **PostgreSQL** | PostgreSQL 14/15 | Structured relational data | api-keys, notifications, hydra, kratos |
| **Redis** | Redis 7.0 | Caching, locks, pub/sub, rate limiting | core/api |

### Key Data Flows

```
User Request
    │
    ▼
┌─────────────────┐
│  Oathkeeper     │ ── Validates JWT ── Kratos
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Core API      │
├─────────────────┤
│ • Validate input│
│ • Check limits  │ ◄── Redis (rate limits)
│ • Execute logic │
│ • Update ledger │ ◄── MongoDB (double-entry)
│ • Send payment  │ ◄── LND (lightning) / Bria (onchain)
│ • Notify user   │ ◄── Notifications service
└─────────────────┘
```

---

## Authentication & Authorization

### Identity Stack (Ory)

```
┌─────────────────────────────────────────────────────────┐
│                   Oathkeeper (Proxy)                     │
│  • Route protection                                      │
│  • JWT validation                                        │
│  • Header enrichment (account ID, scopes)               │
└─────────────────────┬───────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
┌───────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
│   Kratos    │ │   Hydra   │ │  API Keys │
│  (Identity) │ │  (OAuth)  │ │  (M2M)    │
├─────────────┤ ├───────────┤ ├───────────┤
│ Phone auth  │ │ OAuth2    │ │ Scoped    │
│ Email auth  │ │ OIDC      │ │ tokens    │
│ TOTP 2FA    │ │ Consent   │ │ Per-acct  │
└─────────────┘ └───────────┘ └───────────┘
```

### Account Levels & Limits

| Level | Verification | Daily Limit | Features |
|-------|--------------|-------------|----------|
| 0 | None | Minimal | Receive only |
| 1 | Phone | Standard | Send/receive |
| 2 | Identity | Elevated | Higher limits |
| 3 | Business | Custom | Enterprise |

---

## Payment Processing

### Lightning Network

```
┌─────────────────────────────────────────────────────────┐
│                    Core API                              │
│                                                          │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │ Payment Flow │    │  Ledger      │                   │
│  │    State     │    │  (Medici)    │                   │
│  └──────┬───────┘    └──────┬───────┘                   │
└─────────┼──────────────────┼────────────────────────────┘
          │                  │
          │    ┌─────────────┘
          │    │
          ▼    ▼
    ┌──────────────┐
    │     LND      │ ◄── ln-service client
    │  (v0.19.3)   │
    ├──────────────┤
    │ • Invoices   │
    │ • Payments   │
    │ • Routing    │
    └──────────────┘
```

### On-Chain (Bria)

```
┌─────────────────────────────────────────────────────────┐
│                    Core API                              │
│                                                          │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │ Onchain Send │    │  Address     │                   │
│  │   Request    │    │  Generation  │                   │
│  └──────┬───────┘    └──────┬───────┘                   │
└─────────┼──────────────────┼────────────────────────────┘
          │                  │
          └────────┬─────────┘
                   │
                   ▼
          ┌──────────────┐
          │    Bria      │ ◄── gRPC client
          │  (Onchain)   │
          ├──────────────┤
          │ • UTXOs      │
          │ • Signing    │
          │ • Fee est.   │
          └──────┬───────┘
                 │
                 ▼
          ┌──────────────┐
          │  bitcoind    │
          └──────────────┘
```

### Synthetic USD (Stablesats)

Users can hold USD-denominated balances hedged against BTC volatility:

```
BTC Deposit → USD Wallet → Stablesats Dealer → Hedge Position
                              │
                              ▼
                    OKX (or other exchange)
```

---

## Integration Points

### External Services

| Service | Protocol | Purpose |
|---------|----------|---------|
| **LND** | gRPC | Lightning Network operations |
| **Bria** | gRPC | On-chain wallet management |
| **Price Service** | gRPC | Real-time BTC/USD prices |
| **Stablesats** | gRPC | USD hedging (dealer) |
| **Firebase FCM** | REST | Push notifications |
| **Twilio** | REST | SMS/WhatsApp OTP |
| **OpenAI** | REST | Support chat |
| **Svix** | REST | Webhook delivery |

### Internal gRPC Services

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│  Core API   │──────▶│   Price     │       │  Dealer     │
│             │       │  Service    │◀──────│  Price      │
│             │──────▶│             │       │             │
└─────────────┘       └─────────────┘       └─────────────┘
       │
       │              ┌─────────────┐       ┌─────────────┐
       └─────────────▶│Notifications│       │    Bria     │
                      │  Service    │       │  (onchain)  │
                      └─────────────┘       └─────────────┘
```

---

## Security Architecture

### Defense in Depth

1. **Edge:** Oathkeeper validates all requests
2. **Authentication:** JWT tokens with short expiry
3. **Authorization:** Account-level scopes
4. **Rate Limiting:** Redis-based per-account limits
5. **Velocity Checks:** Transaction limits by level
6. **Audit Logging:** All mutations logged

### Sensitive Data Handling

| Data Type | Protection |
|-----------|------------|
| API Keys | SHA-256 hashed storage |
| Phone Numbers | Stored separately from accounts |
| Payment Secrets | Never logged, short-lived |
| LND Macaroons | Encrypted at rest |

---

## Scalability Considerations

### Horizontal Scaling

| Component | Strategy |
|-----------|----------|
| API | Stateless, scale horizontally |
| MongoDB | Replica set with read replicas |
| Redis | Cluster mode for high availability |
| LND | Single node (scaling via Bria batching) |

### Performance Bottlenecks

1. **LND** - Single node, can't scale horizontally
2. **MongoDB writes** - Ledger transactions are write-heavy
3. **Price updates** - High-frequency subscription broadcasts

---

## Cross-Cutting Concerns

### Observability

```
All Services
     │
     ▼
┌─────────────────┐     ┌─────────────────┐
│ OpenTelemetry   │────▶│   Honeycomb     │
│ Collector       │     │   (or Jaeger)   │
└─────────────────┘     └─────────────────┘
```

- **Tracing:** Distributed traces across all services
- **Metrics:** Prometheus format (exported by api-exporter)
- **Logging:** Structured JSON logs (Pino for TS, tracing for Rust)

### Error Handling

- GraphQL errors include `code` field for client translation
- All mutations return `errors: [Error!]!` array
- Background jobs use retry with exponential backoff

---

## Deployment Architecture

### Production (Kubernetes)

```
┌─────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Ingress  │  │  API     │  │  Apps    │              │
│  │ (nginx)  │─▶│ Pods     │  │  Pods    │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ MongoDB  │  │ Postgres │  │  Redis   │              │
│  │ (Atlas)  │  │ (RDS)    │  │ (Elasti) │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Key Helm Values

- Managed databases recommended (Atlas, RDS, ElastiCache)
- LND runs as StatefulSet with persistent volume
- Horizontal Pod Autoscaler on API and apps

---

## Related Documentation

- [API Contracts](./api-contracts.md) - GraphQL schema details
- [Data Models](./data-models.md) - Database schemas
- [Source Tree](./source-tree.md) - Code organization
- [DevOps](./devops.md) - Development and deployment

---

## Appendix: Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Monorepo** | Yes (pnpm + Cargo) | Shared code, atomic changes, unified CI |
| **GraphQL** | Apollo + async-graphql | Type-safe, self-documenting, subscriptions |
| **MongoDB** | Primary store | Flexible schema, good for ledger |
| **Ory Stack** | Identity/OAuth | Production-ready, standards-compliant |
| **Buck2** | Build system | Fast, hermetic builds |
| **Rust** | Performance services | Type safety, performance for key services |
