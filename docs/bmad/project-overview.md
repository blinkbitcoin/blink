# Blink Project Overview

**Generated**: 2025-12-09 | **Scan Level**: Deep | **Type**: Brownfield Documentation

## Executive Summary

Blink (formerly Galoy) is an opinionated **Bitcoin banking platform** that provides a GraphQL API to manage Bitcoin/Lightning transactions. It's designed as a production-ready, horizontally scalable system for handling both on-chain and Lightning Network Bitcoin transactions.

## Repository Classification

| Attribute | Value |
|-----------|-------|
| **Repository Type** | Monorepo |
| **Architecture** | Microservices (Kubernetes-deployed) |
| **Primary Languages** | TypeScript (Node.js 20), Rust |
| **Build System** | Buck2 + pnpm workspaces + Cargo workspaces |
| **Package Manager** | pnpm 8.7.6 |
| **Deployment** | External repo (`../blink-deployements`) |

## Technology Stack Summary

### Backend Services (core/)

| Service | Language | Framework | Purpose |
|---------|----------|-----------|---------|
| **core-api** | TypeScript | Express + Apollo GraphQL | Main API server |
| **core-api-keys** | Rust | Axum + async-graphql | API key management |
| **core-notifications** | Rust | Axum + tonic (gRPC) | Push/email notifications |
| **core-api-cron** | TypeScript | - | Scheduled tasks |
| **core-api-trigger** | TypeScript | - | Event triggers |
| **core-api-ws-server** | TypeScript | graphql-ws | WebSocket subscriptions |
| **core-api-exporter** | TypeScript | prom-client | Prometheus metrics |

### Frontend Applications (apps/)

| App | Framework | Port | Purpose |
|-----|-----------|------|---------|
| **consent** | Next.js 14 | 3000 | OAuth consent screens |
| **dashboard** | Next.js 14 | 3001 | Admin dashboard |
| **pay** | Next.js 14 | 3002 | Point of Sale (POS) |
| **admin-panel** | Next.js 14 | 3004 | Support team interface |
| **map** | Next.js 14 | 3005 | Merchant directory |
| **voucher** | Next.js 14 | 3006 | Bitcoin voucher system |

### Shared Libraries (lib/)

| Library | Language | Purpose |
|---------|----------|---------|
| **galoy-components** | TypeScript | Shared React components |
| **eslint-config** | TypeScript | Shared ESLint configuration |
| **gt3-server-node-express-sdk** | TypeScript | GeeTest CAPTCHA SDK |
| **tracing-rs** | Rust | OpenTelemetry tracing |
| **es-entity-rs** | Rust | Event sourcing entities |
| **job-executor-rs** | Rust | Background job execution |

## Core Technology Decisions

### Data Storage

| Technology | Purpose |
|------------|---------|
| **MongoDB** | Primary database for accounts, transactions (source of truth) |
| **PostgreSQL** | Rust services (api-keys, notifications), job queues |
| **Redis** | Distributed locking, caching, pub/sub |
| **LND (bbolt)** | Lightning Network transactions |
| **Bitcoin Core** | On-chain cold storage |

### External Services Integration

| Service | Purpose |
|---------|---------|
| **Ory Kratos** | Identity management |
| **Ory Hydra** | OAuth 2.0 / OpenID Connect |
| **Ory Oathkeeper** | API gateway/auth proxy |
| **Bria** | On-chain Bitcoin operations |
| **Twilio** | SMS/WhatsApp authentication |
| **Firebase FCM** | Push notifications |
| **OpenAI** | AI-powered support |
| **Svix** | Webhook delivery |

### Observability Stack

| Component | Technology |
|-----------|------------|
| **Tracing** | OpenTelemetry (OTLP) |
| **Metrics** | Prometheus (prom-client) |
| **Logging** | Pino (structured JSON) |
| **Dashboards** | Grafana |

## Architecture Pattern

The codebase follows a **layered architecture** with clear separation:

```
┌──────────────────────────────────────────────────────────────┐
│                    GraphQL API Layer                          │
│  (core/api/src/graphql/public & admin)                       │
├──────────────────────────────────────────────────────────────┤
│                    Application Layer                          │
│  (core/api/src/app/*)                                         │
│  accounts, payments, lightning, wallets, merchants, etc.     │
├──────────────────────────────────────────────────────────────┤
│                    Domain Layer                               │
│  (core/api/src/domain/*)                                      │
│  accounts, ledger, payments, wallets, bitcoin, etc.          │
├──────────────────────────────────────────────────────────────┤
│                    Services Layer                             │
│  (core/api/src/services/*)                                    │
│  bria, kratos, lnd, mongoose, notifications, price, etc.     │
└──────────────────────────────────────────────────────────────┘
```

## Key Features

- **Multi-wallet support**: BTC and USD (stablesats) wallets per account
- **Lightning Network**: Full LN support with HODL invoices, route probing
- **On-chain Bitcoin**: Advanced operations via Bria (batching, CPFP, PSBT signing)
- **Internal ledger**: Double-entry accounting using medici
- **Hot/Cold storage**: Threshold-based rebalancing between hot wallets and cold storage
- **Rate limiting**: Velocity checks based on user verification level
- **Multi-factor auth**: Phone, email, TOTP, Telegram Passport
- **Real-time updates**: GraphQL subscriptions via WebSocket

## Project Structure

```
blink/
├── apps/                    # Frontend applications (Next.js)
├── core/                    # Backend services
│   ├── api/                 # Main GraphQL API (TypeScript)
│   ├── api-keys/           # API key service (Rust)
│   ├── notifications/      # Notification service (Rust)
│   └── api-*/              # Supporting services
├── lib/                     # Shared libraries
├── dev/                     # Development environment (Tilt)
├── bats/                    # Integration tests
├── ci/                      # CI/CD configuration
├── docs/                    # Documentation
├── prelude/                 # Buck2 prelude
├── third-party/            # Third-party dependencies
└── toolchains/             # Buck2 toolchains
```

## Related Repositories

- **blink-deployements**: Kubernetes deployment configuration
- **blink-mobile**: React Native mobile app (located at `../blink-mobile`)
- **blink-card**: Card backend service (located at `../blink-card`)
- **awesome-galoy**: Curated list of Galoy resources

## Quick Reference

| Command | Description |
|---------|-------------|
| `buck2 run dev:healthcheck` | Check dev environment health |
| `buck2 run dev:up` | Start development stack |
| `buck2 run dev:down` | Stop development stack |
| `buck2 targets //core/api` | List API build targets |
| `buck2 build //apps/consent` | Build consent app |

## Next Steps for AI-Assisted Development

1. Review the [Architecture Documentation](./architecture.md) for system design details
2. Check [Source Tree Analysis](./source-tree-analysis.md) for code organization
3. See [Integration Architecture](./integration-architecture.md) for service communication
4. Refer to [Development Guide](./development-guide.md) for local setup

---

*This document was generated as part of the BMAD document-project workflow for brownfield project documentation.*
