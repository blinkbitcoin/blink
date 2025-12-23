# Blink Project Documentation

> Bitcoin Banking Platform | Brownfield Analysis
> Generated: 2025-12-22 | Scan Level: Exhaustive

## Quick Links

| Document | Description |
|----------|-------------|
| [Architecture](./architecture.md) | System architecture overview, service components, data flows |
| [API Contracts](./api-contracts.md) | GraphQL schemas, endpoints, authentication flows |
| [Data Models](./data-models.md) | MongoDB collections, PostgreSQL tables, relationships |
| [Source Tree](./source-tree.md) | Codebase organization, directory structure |
| [DevOps](./devops.md) | Development setup, CI/CD, deployment |

---

## Project Overview

**Blink** (formerly Galoy) is an open-source Bitcoin banking platform enabling:

- Multi-currency wallets (BTC + synthetic USD)
- Lightning Network payments
- On-chain Bitcoin transactions
- OAuth-based authentication
- Merchant directory with map

### Repository Stats

| Metric | Value |
|--------|-------|
| **Type** | Monorepo |
| **Package Managers** | pnpm 8.7.6 + Cargo |
| **Build System** | Buck2 |
| **Languages** | TypeScript, Rust |
| **Parts** | 11 (6 web apps, 3 backend services, 2+ libraries) |

---

## Service Map

```
┌─────────────────────────────────────────────────────────┐
│                    Web Applications                      │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│dashboard │admin-panel│   pay   │   map    │  voucher    │
│ :3001    │  :3004    │  :3002  │  :3005   │   :3006     │
└──────────┴──────────┴──────────┴──────────┴─────────────┘
                         │
              ┌──────────▼──────────┐
              │   Oathkeeper :4455  │
              └──────────┬──────────┘
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
┌───▼───┐           ┌────▼────┐          ┌────▼────┐
│API    │           │API Keys │          │Notific. │
│:4002  │           │(Rust)   │          │(Rust)   │
└───────┘           └─────────┘          └─────────┘
```

---

## Technology Stack Summary

### Backend
- **Runtime:** Node.js 20, Tokio (Rust)
- **API:** GraphQL (Apollo Server, async-graphql)
- **Databases:** MongoDB 7.0, PostgreSQL 14/15, Redis 7.0
- **Auth:** Ory Kratos/Hydra/Oathkeeper
- **Bitcoin:** LND v0.19.3-beta, Bria

### Frontend
- **Framework:** Next.js 14
- **UI:** React 18, MUI/Joy, TailwindCSS
- **State:** Apollo Client

### Infrastructure
- **Build:** Buck2, Nix
- **Dev:** Tilt, Docker Compose
- **Deploy:** Kubernetes, Helm
- **Observability:** OpenTelemetry, Prometheus

---

## Getting Started

```bash
# 1. Enter Nix shell
nix develop

# 2. Start all services
tilt up

# 3. Access apps
open http://localhost:3001  # Dashboard
open http://localhost:4455/graphql  # GraphQL Playground
```

See [DevOps](./devops.md) for detailed setup instructions.

---

## Key Integrations

| Integration | Purpose | Protocol |
|-------------|---------|----------|
| LND | Lightning payments | gRPC |
| Bria | On-chain wallet | gRPC |
| Price Service | BTC/USD rates | gRPC |
| Stablesats | USD hedging | gRPC |
| Firebase | Push notifications | REST |
| Twilio | SMS/WhatsApp | REST |
| Svix | Webhooks | REST |

---

## Existing Documentation

The repository contains these existing docs:

| Path | Description |
|------|-------------|
| `README.md` | Project overview |
| `ARCHITECTURE.md` | Original architecture notes |
| `CONTRIBUTING.md` | Contribution guidelines |
| `docs/DEVELOPMENT_ENVIRONMENT.md` | Dev environment setup |
| `docs/BUCK2.md` | Buck2 build system |
| `docs/CI.md` | CI/CD documentation |
| `core/api/src/services/ledger/README.md` | Ledger system docs |

---

## Document History

| Date | Version | Changes |
|------|---------|---------|
| 2025-12-22 | 1.0.0 | Initial exhaustive scan |

---

## Scan Report

**Scan Level:** Exhaustive (read all source files)
**State File:** `project-scan-report.json`

### Files Generated

1. `index.md` - This file
2. `architecture.md` - System architecture
3. `api-contracts.md` - API documentation
4. `data-models.md` - Database schemas
5. `source-tree.md` - Code organization
6. `devops.md` - Development & operations
