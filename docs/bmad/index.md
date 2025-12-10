# Blink Documentation Index

**Generated**: 2025-12-09 | **BMAD Workflow**: document-project v1.2.0

## Overview

This documentation was generated using the BMAD document-project workflow to provide comprehensive reference documentation for the Blink (formerly Galoy) Bitcoin banking platform. It is designed to support AI-assisted development and brownfield PRD creation.

---

## Quick Navigation

### Generated Documentation (BMAD)

| Document | Description |
|----------|-------------|
| [Project Overview](./project-overview.md) | Executive summary, tech stack, quick reference |
| [Architecture](./architecture.md) | System design, layers, data architecture |
| [Source Tree Analysis](./source-tree-analysis.md) | Directory structure, entry points, file patterns |
| [Integration Architecture](./integration-architecture.md) | Service communication, APIs, data flows |
| [Code Patterns](./code-patterns.md) | Coding conventions, error handling, patterns |

### Existing Documentation (docs/)

#### Development & Setup
| Document | Description |
|----------|-------------|
| [Development Environment](../DEVELOPMENT_ENVIRONMENT.md) | Local setup guide |
| [Buck2](../BUCK2.md) | Buck2 build system usage |
| [CI](../CI.md) | Continuous integration |
| [Toolchain](../TOOLCHAIN.md) | Development toolchain |
| [Kubernetes](../KUBERNETES.md) | K8s deployment notes |
| [Legacy Dev](../LEGACY_DEV.md) | Legacy development info |

#### Architecture & Design
| Document | Description |
|----------|-------------|
| [Detailed Architecture](../detailed_architecture.md) | Comprehensive architecture |
| [API Keys Service Architecture](../api_keys_service_architecture.md) | Rust API keys service |
| [Notification Service](../notification_service.md) | Notification system |
| [Testing Architecture](../testing_architecture.md) | Testing approach |
| [User Account Architecture](../user_account_architecture.md) | Account system design |

#### API & Integration
| Document | Description |
|----------|-------------|
| [GraphQL API](../graphql_api.md) | GraphQL API documentation |
| [Webhooks](../webhooks.md) | Webhook system |
| [Authentication Flow](../authentication_flow.md) | Auth implementation |
| [Request Flow and Authentication](../request-flow-and-authentication.md) | Request handling |
| [Hydra](../hydra.md) | Ory Hydra OAuth integration |

#### Domain Features
| Document | Description |
|----------|-------------|
| [Accounting](../accounting.md) | Double-entry ledger |
| [Stablesats](../stablesats.md) | USD-pegged wallets |
| [User Transactions](../user_transactions.md) | Transaction handling |
| [HODL Invoices](../hodl-invoices.md) | HODL invoice support |

#### Integrations & Features
| Document | Description |
|----------|-------------|
| [Visa Card](../visa_card.md) | Visa card integration |
| [Cala](../cala.md) | Cala integration |
| [Rain Documentation](../rain-documentation.md) | Rain integration |
| [Card Program Invitation](../card-program-invitation-system.md) | Card invitation system |

#### Operations
| Document | Description |
|----------|-------------|
| [Error Handling](../error-handling.md) | Error handling patterns |
| [OpenTelemetry](../otel.md) | Observability setup |

---

## Project Structure Summary

```
blink/
├── apps/          # 6 Next.js frontend applications
├── core/          # 7 backend services (TypeScript + Rust)
├── lib/           # 6 shared libraries
├── dev/           # Development environment (Tilt)
├── bats/          # Integration tests
├── ci/            # CI/CD configuration
└── docs/          # Documentation (you are here)
```

## Key Entry Points

| What | Location |
|------|----------|
| Main API Server | `core/api/src/servers/graphql-main-server.ts` |
| Public GraphQL Schema | `core/api/src/graphql/public/schema.graphql` |
| Admin GraphQL Schema | `core/api/src/graphql/admin/schema.graphql` |
| Application Layer | `core/api/src/app/` |
| Domain Layer | `core/api/src/domain/` |
| API Keys Service | `core/api-keys/src/main.rs` |
| Notifications Service | `core/notifications/src/main.rs` |

## Technology Stack Quick Reference

| Layer | Technology |
|-------|------------|
| API | GraphQL (Apollo Server), gRPC |
| Frontend | Next.js 14, React 18, Tailwind CSS |
| Backend | TypeScript/Node.js 20, Rust |
| Database | MongoDB, PostgreSQL, Redis |
| Bitcoin | LND (Lightning), Bria (On-chain) |
| Auth | Ory Kratos, Hydra, Oathkeeper |
| Build | Buck2, pnpm, Cargo |
| Deploy | Kubernetes |

## Development Commands

```bash
# Health check
buck2 run dev:healthcheck

# Start development stack
buck2 run dev:up

# Stop development stack
buck2 run dev:down

# Tilt UI: http://localhost:10350/
```

## Related Repositories

| Repository | Purpose | Location |
|------------|---------|----------|
| blink-deployements | K8s deployment | `../blink-deployements` |
| blink-mobile | React Native app | `../blink-mobile` |
| blink-card | Card backend | `../blink-card` |

---

## For AI-Assisted Development

When working with this codebase, AI agents should:

1. **Read the patterns first**: See [Code Patterns](./code-patterns.md) for error handling, types, and conventions
2. **Understand the layers**: See [Architecture](./architecture.md) for the layer responsibilities
3. **Navigate efficiently**: See [Source Tree Analysis](./source-tree-analysis.md) for file locations
4. **Check integrations**: See [Integration Architecture](./integration-architecture.md) for service communication
5. **Follow existing docs**: Check the existing documentation links above for domain-specific details

## Scan Report

The scan report is stored at `./project-scan-report.json` and contains:
- Workflow metadata
- Completed steps
- Project classification
- Detected parts

---

*Generated by BMAD document-project workflow. For updates, re-run the workflow.*
