# Blink Development & Operations

## Development Environment

### Prerequisites

| Tool | Purpose |
|------|---------|
| **Nix** | Package manager (via [Determinate Nix Installer](https://github.com/DeterminateSystems/nix-installer)) |
| **Docker** | Container runtime |
| **direnv** | Optional: Auto-loads nix environment |

### Quick Start

```bash
# Enter nix development shell
nix develop

# OR with direnv (auto-loads)
direnv allow

# Start all services with Tilt
tilt up
```

### Build System: Buck2

Primary build system using Meta's [Buck2](https://buck2.build/).

```bash
# Build a service
buck2 build //core/api:api

# Run a service
buck2 run //core/api:dev

# Run tests
buck2 test //core/api:test-integration

# Build all
buck2 build //...
```

---

## Local Development with Tilt

[Tilt](https://tilt.dev/) orchestrates all services for local development.

### Starting Services

```bash
# Start all services
tilt up

# Start specific services
tilt up dashboard api

# Run in CI mode (for testing)
tilt ci -- --test=core
```

### Service Groups

| Group | Services |
|-------|----------|
| **apps** | dashboard, admin-panel, pay, map, voucher, consent |
| **core** | api, api-trigger, api-exporter, api-ws-server, notifications |
| **auth** | kratos, hydra, oathkeeper, api-keys |
| **bitcoin** | bitcoind, lnd1, lnd2, bria, fulcrum |
| **price** | price, price-history |

### Local Service Ports

| Service | Port | URL |
|---------|------|-----|
| Dashboard | 3001 | http://localhost:3001 |
| Pay | 3002 | http://localhost:3002 |
| Consent | 3000 | http://localhost:3000 |
| Admin Panel | 3004 | http://localhost:3004 |
| Map | 3005 | http://localhost:3005 |
| Voucher | 3006 | http://localhost:3006 |
| API (GraphQL) | 4455 | http://localhost:4455/graphql |
| API (Admin) | 4455 | http://localhost:4455/admin/graphql |
| Apollo Router | 4004 | http://localhost:4004 |
| API Keys | 5397 | - |
| Notifications | 6685 | - |

---

## Docker Compose Dependencies

Located in `./dev/docker-compose.deps.yml`:

### Databases

| Service | Port | Purpose |
|---------|------|---------|
| mongodb | 27017 | Main API datastore |
| redis | 6379 | Caching, locks, pub/sub |
| kratos-pg | 5432 | Ory Kratos identity |
| hydra-pg | - | Ory Hydra OAuth |
| api-keys-pg | 5431 | API keys service |
| notifications-pg | 5433 | Notifications service |
| voucher-pg | 5430 | Voucher service |
| price-history-pg | - | Price history |
| bria-pg | - | Bria onchain wallet |

### Authentication (Ory Stack)

| Service | Ports | Purpose |
|---------|-------|---------|
| kratos | 4433, 4434 | Identity management |
| hydra | 4444, 4445 | OAuth2/OIDC provider |
| oathkeeper | 4455, 4456 | API gateway/auth proxy |

### Bitcoin Stack

| Service | Port | Purpose |
|---------|------|---------|
| bitcoind | 18443 | Bitcoin Core (regtest) |
| bitcoind-signer | - | Signing node |
| lnd1 | 10009 | Primary LND node |
| lnd2 | 10010 | Secondary LND node |
| lnd-outside-1 | 10012 | External test node |
| lnd-outside-2 | 10013 | External test node |
| bria | 2742, 2743 | Onchain wallet orchestration |
| fulcrum | 50001 | Electrum server |

### Supporting Services

| Service | Port | Purpose |
|---------|------|---------|
| price | 50051 | BTC/USD price feed |
| price-history | 50052 | Historical prices |
| stablesats | 3325 | USD stability (dealer) |
| apollo-router | 4004 | GraphQL federation |
| svix | 8071 | Webhook delivery |
| otel-agent | 4317, 4318 | OpenTelemetry collector |

---

## Testing

### Unit Tests

```bash
# TypeScript (Jest)
buck2 test //core/api:test-unit

# Rust
cargo nextest run -p api-keys
cargo nextest run -p notifications
```

### Integration Tests

```bash
# Via Tilt
tilt ci -- --test=core

# Direct
buck2 test //core/api:test-integration
buck2 test //apps/dashboard:test-integration
```

### BATS Integration Tests

```bash
# Located in bats/
bats bats/gql/*.bats
bats bats/admin-gql/*.bats
```

### E2E Tests (Cypress)

```bash
# Dashboard
cd apps/dashboard && pnpm cypress run

# Pay
cd apps/pay && pnpm cypress run
```

---

## CI/CD Pipeline

### Concourse CI

Configuration in `ci/` directory using [Concourse](https://concourse-ci.org/).

```
ci/
├── apps/          # App-specific pipelines
├── core/          # Core service pipelines
├── tasks/         # Reusable task definitions
└── config/        # Pipeline configuration
```

### Container Images

All services have Dockerfiles for production deployment:

| Service | Dockerfile |
|---------|------------|
| API | `core/api/Dockerfile` |
| API (migrate) | `core/api/Dockerfile-migrate` |
| API Keys | `core/api-keys/Dockerfile` |
| Notifications | `core/notifications/Dockerfile` |
| Dashboard | `apps/dashboard/Dockerfile` |
| Admin Panel | `apps/admin-panel/Dockerfile` |
| Pay | `apps/pay/Dockerfile` |
| Map | `apps/map/Dockerfile` |
| Voucher | `apps/voucher/Dockerfile` |
| Consent | `apps/consent/Dockerfile` |

---

## Production Deployment

### Kubernetes

Production runs on Kubernetes with Helm charts from [GaloyMoney/charts](https://github.com/GaloyMoney/charts).

### Infrastructure Requirements

| Component | Recommendation |
|-----------|----------------|
| MongoDB | Replica set (3+ nodes) |
| PostgreSQL | Managed (RDS, Cloud SQL) |
| Redis | Managed (ElastiCache, Memorystore) |
| LND | Dedicated node with SSD |
| Kubernetes | 3+ node cluster |

### Environment Variables

Key configuration via environment:

```bash
# Database
MONGODB_ADDRESS=mongodb://...
REDIS_MASTER_NAME=...
PG_CON=postgres://...

# LND
LND_TLS=...
LND_MACAROON=...

# Auth
KRATOS_PUBLIC_API=...
OATHKEEPER_DECISION_API=...

# Services
PRICE_HOST=price:50051
BRIA_HOST=bria:2743
NOTIFICATIONS_HOST=notifications:6685

# Tracing
OTEL_EXPORTER_OTLP_ENDPOINT=...
```

---

## Monitoring & Observability

### OpenTelemetry

All services instrumented with OpenTelemetry:

```yaml
# otel-agent-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

exporters:
  otlp:
    endpoint: ${HONEYCOMB_ENDPOINT}
    headers:
      x-honeycomb-team: ${HONEYCOMB_API_KEY}
```

### Metrics (Prometheus)

```bash
# API exporter exposes metrics
curl http://localhost:3003/metrics
```

### Logging

- **TypeScript**: Pino JSON logger
- **Rust**: tracing with JSON formatter

---

## Database Migrations

### MongoDB (core/api)

```bash
# Run migrations
buck2 run //core/api:mongodb-migrate

# Migration files
core/api/src/migrations/*.ts
```

### PostgreSQL (api-keys)

```bash
# Via sqlx
sqlx migrate run --database-url $PG_CON

# Migration files
core/api-keys/migrations/*.sql
```

### PostgreSQL (notifications)

```bash
# Via sqlx
sqlx migrate run --database-url $PG_CON

# Migration files
core/notifications/migrations/*.sql
```

---

## Troubleshooting

### Common Issues

**Port conflicts:**
```bash
# Check for running services
lsof -i :4455
docker ps
```

**File descriptor limit (macOS):**
```bash
ulimit -n 65536
```

**Nix cache issues:**
```bash
nix-collect-garbage -d
```

**Docker resources:**
```bash
docker system prune -a
```

### Health Checks

```bash
# API health
curl http://localhost:4012/healthz

# LND connectivity
lncli --network=regtest getinfo

# MongoDB
mongosh --eval "db.adminCommand('ping')"
```
