# Blink Integration Architecture

**Generated**: 2025-12-09 | **Scan Level**: Deep | **Type**: Service Communication Map

## Service Communication Overview

This document maps how Blink's microservices communicate with each other and external systems.

## Internal Service Integration

### Core Service Mesh

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 Blink Services                                   │
│                                                                                  │
│  ┌─────────────┐     GraphQL      ┌─────────────┐      gRPC       ┌───────────┐│
│  │   Apps      │ ◀───────────────▶│  core-api   │ ◀──────────────▶│ core-     ││
│  │ (Next.js)  │                   │  (main)     │                 │ notif.    ││
│  └─────────────┘                   └──────┬──────┘                 └───────────┘│
│                                           │                                      │
│                                           │ Internal calls                       │
│                                           ▼                                      │
│  ┌─────────────┐     GraphQL      ┌─────────────┐     GraphQL     ┌───────────┐│
│  │  core-ws    │ ◀───────────────▶│  Shared     │ ◀──────────────▶│ core-     ││
│  │  (subs)     │                   │  MongoDB    │                 │ api-keys  ││
│  └─────────────┘                   └─────────────┘                 └───────────┘│
│                                                                                  │
│  ┌─────────────┐                   ┌─────────────┐                              │
│  │ core-cron   │ ──────────────────│ core-trigger│                              │
│  │ (scheduled) │    Events         │  (events)   │                              │
│  └─────────────┘                   └─────────────┘                              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Integration Points Detail

#### 1. core-api → core-notifications (gRPC)

**Protocol**: gRPC
**Proto**: `core/notifications/proto/notifications.proto`

**Operations**:
| Method | Purpose |
|--------|---------|
| `SendPushNotification` | Send push to device |
| `SendEmail` | Send transactional email |
| `RegisterDevice` | Register FCM token |
| `UpdateSettings` | Update notification preferences |

**Flow**:
```
Transaction Complete → core-api → NotificationsService.sendTransaction()
    → gRPC call → core-notifications → FCM/SMTP
```

#### 2. core-api → core-api-keys (Internal/GraphQL)

**Protocol**: GraphQL (federated or direct)

**Operations**:
| Operation | Purpose |
|-----------|---------|
| `createApiKey` | Generate new API key |
| `revokeApiKey` | Revoke existing key |
| `validateApiKey` | Verify key and scopes |
| `listApiKeys` | List account's keys |

**Flow**:
```
API Request with Key → Oathkeeper → core-api-keys.validateApiKey()
    → Return scopes → Oathkeeper → Inject into request → core-api
```

#### 3. Frontend Apps → core-api (GraphQL)

**Protocol**: GraphQL over HTTP/WebSocket

**Endpoints**:
| App | Endpoint | Auth |
|-----|----------|------|
| Dashboard | `/graphql` | Session JWT |
| Pay | `/graphql` | Public + Session |
| Consent | `/graphql` | Session (OAuth flow) |
| Admin Panel | `/admin/graphql` | Admin JWT |

**Subscription Topics**:
- `price` - Real-time price updates
- `myUpdates` - User-specific events
- `lnInvoicePaymentStatus` - Invoice status

## External Service Integration

### Authentication Stack (Ory)

```
┌──────────────────────────────────────────────────────────────────┐
│                        Ory Authentication Stack                   │
│                                                                   │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐        │
│  │   Kratos    │     │   Hydra     │     │ Oathkeeper  │        │
│  │  (Identity) │     │   (OAuth)   │     │ (Gateway)   │        │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘        │
│         │                   │                   │                │
│         └─────────────┬─────┴───────────────────┘                │
│                       │                                          │
└───────────────────────┼──────────────────────────────────────────┘
                        │
                        ▼
                  ┌───────────┐
                  │ core-api  │
                  └───────────┘
```

**Integration Details**:

| Service | Protocol | Purpose |
|---------|----------|---------|
| **Kratos** | REST | Identity CRUD, sessions |
| **Hydra** | REST | OAuth 2.0 / OIDC |
| **Oathkeeper** | Proxy | Auth decision, JWT injection |

**Kratos Integration** (`services/kratos/`):
```typescript
// services/kratos/auth-with-phone-no-password-schema.ts
const createIdentity = async (phone: PhoneNumber) => {
  return kratosAdmin.createIdentity({
    schema_id: "phone_no_password_v0",
    traits: { phone },
  })
}
```

### Lightning Network (LND)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Lightning Network Integration                 │
│                                                                  │
│  ┌─────────────┐     gRPC      ┌─────────────┐                  │
│  │  core-api   │ ◀────────────▶│    LND 1    │ ←→ LN Network   │
│  │             │               └─────────────┘                  │
│  │  (multiple  │     gRPC      ┌─────────────┐                  │
│  │   LND       │ ◀────────────▶│    LND 2    │ ←→ LN Network   │
│  │   support)  │               └─────────────┘                  │
│  └─────────────┘                                                │
└─────────────────────────────────────────────────────────────────┘
```

**Integration** (`services/lnd/`):
| Operation | LND RPC | Purpose |
|-----------|---------|---------|
| `addInvoice` | `AddInvoice` | Create LN invoice |
| `payViaRoutes` | `SendToRouteV2` | Pay with specific route |
| `payViaPaymentDetails` | `SendPaymentV2` | Pay with probing |
| `cancelInvoice` | `CancelInvoice` | Cancel HODL invoice |
| `lookupInvoice` | `LookupInvoice` | Check invoice status |

**Configuration**:
```yaml
lnd:
  - name: "lnd1"
    type: "offchain"
    priority: 1
    pubkey: "02..."
  - name: "lnd2"
    type: "offchain"
    priority: 2
    pubkey: "03..."
```

### On-Chain Bitcoin (Bria)

```
┌─────────────────────────────────────────────────────────────────┐
│                      On-Chain Integration                        │
│                                                                  │
│  ┌─────────────┐     gRPC      ┌─────────────┐     RPC         │
│  │  core-api   │ ◀────────────▶│    Bria     │ ◀───────────────▶│
│  └─────────────┘               └─────────────┘   Bitcoin Core   │
│                                       │                          │
│                                       ▼                          │
│                              ┌─────────────┐                     │
│                              │  Cold Signer│                     │
│                              │   (PSBT)    │                     │
│                              └─────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

**Integration** (`services/bria/`):
| Operation | Purpose |
|-----------|---------|
| `getAddress` | Generate deposit address |
| `submitPayout` | Queue withdrawal |
| `getPayoutQueue` | List pending payouts |
| `signPsbt` | Sign with cold key |

### Price Service

```
┌─────────────┐     gRPC      ┌─────────────┐     HTTP      ┌───────────┐
│  core-api   │ ◀────────────▶│   Price     │ ◀────────────▶│ Exchanges │
└─────────────┘               │   Service   │               └───────────┘
                              └─────────────┘
```

**Proto**: `services/price/protos/price.proto`

**Operations**:
- `GetCentsFromSatsForImmediateBuy` - BTC → USD rate
- `GetCentsFromSatsForImmediateSell` - USD → BTC rate
- `GetPriceHistory` - Historical prices

### External Notifications

```
┌─────────────────┐                    ┌─────────────────┐
│core-notifications│ ──── HTTP ────▶  │   Firebase FCM  │
│                 │                    └─────────────────┘
│                 │ ──── SMTP ────▶   ┌─────────────────┐
│                 │                    │   SMTP Server   │
└─────────────────┘                    └─────────────────┘
```

**FCM Integration** (`core/notifications/src/push_executor/`):
```rust
// Uses google-fcm1 crate
pub async fn send_push(token: &str, message: Message) -> Result<()> {
    fcm_client.send(message).await
}
```

**Email Integration** (`core/notifications/src/email_executor/`):
```rust
// Uses lettre crate
pub async fn send_email(to: &str, subject: &str, body: &str) -> Result<()> {
    smtp_transport.send(email).await
}
```

## Data Flow Patterns

### Payment Flow (Intraledger)

```
1. Client → GraphQL Mutation (intraLedgerPaymentSend)
2. core-api validates sender wallet
3. core-api validates recipient wallet
4. core-api acquires distributed lock (Redis)
5. core-api checks limits (rate-limiter-flexible)
6. core-api records ledger entry (medici → MongoDB)
7. core-api releases lock
8. core-api → core-notifications (gRPC)
9. core-notifications → FCM (both parties)
10. core-api returns transaction
```

### Payment Flow (Lightning External)

```
1. Client → GraphQL Mutation (lnInvoicePaymentSend)
2. core-api validates invoice
3. core-api constructs payment flow
4. core-api acquires distributed lock
5. core-api checks withdrawal limits
6. core-api records pending ledger entry
7. core-api → LND (payViaPaymentDetails)
8. LND → Lightning Network → Recipient
9. On success: core-api settles ledger entry
10. On failure: core-api reverts ledger entry
11. core-api → core-notifications
12. core-api returns result
```

### Webhook Delivery (via Svix)

```
1. Transaction completes
2. core-api → Svix API (POST /webhook)
3. Svix → Customer endpoint (with retries)
4. Customer → Svix (acknowledgment)
5. Svix → core-api (delivery status callback)
```

## Protocol Specifications

### GraphQL Schema Locations

| API | Schema | Notes |
|-----|--------|-------|
| Public | `core/api/src/graphql/public/schema.graphql` | Client apps |
| Admin | `core/api/src/graphql/admin/schema.graphql` | Admin ops |
| API Keys | `core/api-keys/src/graphql/` | API key mgmt |
| Notifications | `core/notifications/src/graphql/` | Notif settings |

### gRPC Proto Locations

| Service | Proto |
|---------|-------|
| Notifications | `core/notifications/proto/notifications.proto` |
| Price | `core/api/src/services/price/protos/price.proto` |
| Dealer Price | `core/api/src/services/dealer-price/proto/` |
| Bria | `core/api/src/services/bria/proto/bria.proto` |

## Environment Configuration

### Service Discovery

Services discover each other via environment variables:

```bash
# Core API
MONGODB_CON=mongodb://...
REDIS_MASTER_NAME=mymaster
LND_GRPC_HOST=lnd1.svc.cluster.local:10009
BRIA_HOST=bria.svc.cluster.local:50051
NOTIFICATIONS_HOST=notifications.svc.cluster.local:50051
KRATOS_ADMIN_URL=http://kratos-admin.svc.cluster.local
KRATOS_PUBLIC_URL=http://kratos-public.svc.cluster.local

# Notifications Service
DATABASE_URL=postgresql://...
FCM_PROJECT_ID=...
SMTP_HOST=smtp.sendgrid.net
```

### Health Checks

| Service | Health Endpoint |
|---------|-----------------|
| core-api | `/healthz` |
| core-api-keys | `/health` |
| core-notifications | gRPC health check |

## Error Handling Across Services

### Error Propagation

```
Service Error → Domain Error → GraphQL Error → Client
     │              │              │
     │              │              └─ { code, message, path }
     │              └─ ErrorLevel (Info/Warn/Critical)
     └─ Logging + Tracing
```

### Retry Policies

| Integration | Retries | Backoff |
|-------------|---------|---------|
| LND payments | 0 (immediate fail) | N/A |
| Notifications | 3 | Exponential |
| Webhooks (Svix) | 5 | Exponential |
| Price fetching | 2 | Linear |

---

*This document maps service integrations for AI-assisted development and debugging.*
