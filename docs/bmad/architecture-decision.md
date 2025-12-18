---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
status: complete
completedAt: '2025-12-18'
inputDocuments:
  - 'docs/bmad/prd.md'
  - 'docs/bmad/index.md'
  - 'docs/bmad/architecture.md'
  - 'docs/bmad/project-overview.md'
  - 'docs/bmad/code-patterns.md'
  - 'docs/bmad/integration-architecture.md'
  - 'docs/bmad/analysis/brainstorming-session-2025-12-17.md'
referenceBranches:
  - name: 'feat--notification-message-templates'
    purpose: 'Template/message tables in notifications service (Rust/Postgres)'
    caution: 'Over-engineered for our needs - stores templates in DB instead of YAML'
  - name: 'feat--visa-card-invitations'
    purpose: 'Admin panel UI for invitations (React/Next.js)'
    caution: 'Simpler status model, no background job, no KYC integration'
workflowType: 'architecture'
lastStep: 1
project_name: 'Blink'
user_name: 'hn'
date: '2025-12-18'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

28 functional requirements spanning 6 capability areas:

| Area | Count | Key Requirements |
|------|-------|------------------|
| Invitation Management | 6 | Single/batch invite, list view, detail view, admin tracking |
| User Discovery | 4 | Phone/email search, exclude existing invitees, batch selection |
| Status Monitoring | 5 | Real-time status, Sumsub + Rain KYC queries, rejection reasons, timestamps |
| Notification Delivery | 5 | Flow 1 (KYC start), Flow 2 (program signup), resend, failure tracking, deep links |
| Automated Workflows | 4 | KYC status detection, auto Flow 2 trigger (15 min), status updates, enrollment tracking |
| Template Management | 4 | YAML upload, preview, placeholders, deep link configuration |

**Non-Functional Requirements:**

| Category | Requirements | Architectural Impact |
|----------|--------------|---------------------|
| Performance | NFR1-4 | 3s list load, 30s batch invite, 2s search, 5s status refresh |
| Reliability | NFR5-8 | 99% job consistency, data durability, failure visibility, graceful degradation |
| Integration | NFR9-12 | Timeout handling, error logging, rate limiting |
| Security | NFR13-14 | Inherited admin auth, audit logging |

**Scale & Complexity:**

- **Primary domain**: Admin panel extension with background automation
- **Complexity level**: Medium (bounded feature, multi-service coordination)
- **Estimated architectural components**: 5-6 (invitation table, UI pages, background job, GraphQL queries, notification integration, template storage)

### Technical Constraints & Dependencies

**Existing Infrastructure:**
- Admin panel: Next.js 14 app (no current background job capability)
- Notification service: Existing `MarketingNotificationTrigger` mutation
- Main API: Sumsub L2 verification status query exists
- blink-card: Rain KYC status via **gRPC** (adding `GetApplicationStatus` RPC)

**New Infrastructure Needed:**
- Background job scheduler in admin-panel (recommendation: `node-cron` for MVP)
- New database table: `invitations` in admin-panel
- New DeepLinkScreen values: `KYC_START`, `PROGRAM_SIGNUP` (mobile coordination)

**Known Limitations:**
- Single replica assumption for `node-cron` (duplicate execution if scaled)
- No invitation revocation in MVP
- No automatic notification retry

### Cross-Cutting Concerns Identified

1. **State Management**: Invitation status must be consistent across UI and background jobs
2. **External Service Resilience**: Graceful handling when Sumsub/Rain/notification services unavailable
3. **Audit Trail**: All invitation actions logged with admin identity
4. **Notification Reliability**: Failure visibility + manual retry fallback
5. **KYC Status Aggregation**: Combining Sumsub (L2) and Rain status into single view

### Architectural Risks & Mitigations (Party Mode Review)

| Risk | Probability | Impact | Mitigation Strategy |
|------|-------------|--------|---------------------|
| Background job misses KYC approval window | Medium | High (VIP stuck) | Pod restart during 15-min cycle delays detection. Accept for MVP; monitor and alert. |
| External service timeout cascades | Medium | Medium | Cache KYC status locally; background job is single writer. UI reads from cache. |
| Duplicate Flow 2 notifications | Low | High (bad UX) | Verify `MarketingNotificationTrigger` idempotency. Add `flow2_sent_at` column as guard. |
| State inconsistency between polling cycles | Medium | Medium | Single-writer pattern: background job updates `last_known_kyc_status` column. |
| Mobile team coordination delays | Medium | High (blocker) | DeepLinkScreen values are external dependency. Track as explicit blocker. |

### Graceful Degradation States

When external services are unavailable, UI must show explicit fallback states:

| Service Unavailable | UI Display | User Action |
|---------------------|------------|-------------|
| Sumsub API timeout | "L2 verification status pending" | Wait for next poll cycle |
| Rain API timeout | "Card KYC status pending" | Wait for next poll cycle |
| Both unavailable | Invitation visible, status shows "Checking..." | Manual refresh available |
| Notification service down | "Notification pending" | Manual resend when restored |

### KYC Status Strategy Decision

**Recommendation: Cache-on-poll (not fetch-on-demand)**

- Background job polls Sumsub + Rain every 15 minutes
- Updates `last_known_kyc_status` and `last_status_check_at` in invitations table
- UI reads from local cache (fast, consistent)
- Eliminates timeout cascade risk on page load
- Trade-off: Status may be up to 15 minutes stale (acceptable for this use case)

### Testability Considerations

**NFR5 (99% job consistency) verification approach:**
- Add observability: `job_last_run_at`, `job_run_count` metrics
- Integration test with mocked clock to verify polling logic
- Alerting if job hasn't run in >20 minutes
- Manual QA sign-off for MVP; automated monitoring post-launch

### Reference Branch Analysis

| Branch | What to Reuse | What to Avoid |
|--------|---------------|---------------|
| `feat--notification-message-templates` | gRPC notification service patterns | DB-stored templates (over-engineered for YAML upload) |
| `feat--visa-card-invitations` | UI component patterns (badges, pagination, filters) | Status model (too simple), no background job pattern |

**Note:** Neither branch has the KYC status integration or background job infrastructure we need. This is net-new development.

## Starter Template Evaluation

### Brownfield Project - Existing Stack

This is a brownfield extension project. No starter template selection required.

**Existing Technology Constraints:**

| Component | Technology | Source |
|-----------|------------|--------|
| Admin Panel Framework | Next.js 14 | `apps/admin-panel/` |
| UI Library | React 18 + Tailwind CSS | Existing admin-panel patterns |
| GraphQL Client | Apollo Client | `apps/admin-panel/graphql.gql` |
| Server Actions | Next.js Server Actions | Reference branch patterns |
| State Management | React hooks + URL state | Existing admin-panel patterns |
| Notification Integration | gRPC via `MarketingNotificationTrigger` | Existing mutation |

**New Infrastructure Decisions (for this feature):**

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Background Job Scheduler | `node-cron` vs K8s CronJob | `node-cron` (embedded, MVP simplicity) |
| Database for Invitations | Admin-panel PostgreSQL | New `invitations` table |
| Template Storage | DB vs File upload | YAML file upload (lean approach) |

**Reference Implementations (Context Only - Not Following These Approaches):**

The following branches provide useful context but contain over-engineered patterns we explicitly avoid:

| Branch | Useful For | What We Avoid |
|--------|------------|---------------|
| `feat--visa-card-invitations` | UI patterns: page structure, components (`StatusBadge`, `Pagination`), GraphQL query patterns | Simpler status model doesn't match our needs; no background job; no KYC integration |
| `feat--notification-message-templates` | Understanding gRPC notification service interface | Full CRUD template management in Postgres - over-engineered for our YAML upload approach |

**Our lean approach differs by:**
- YAML file upload instead of database-stored templates
- Cache-on-poll instead of fetch-on-demand for KYC status
- Single-writer background job pattern for state consistency
- Explicit graceful degradation states instead of silent failures

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Invitations table schema and indexes
- Status state machine definition
- Database infrastructure for admin-panel (Prisma + PostgreSQL)

**Important Decisions (Shape Architecture):**
- KYC status caching strategy (cache-on-poll)
- Notification idempotency pattern
- Background job implementation (node-cron)

**Deferred Decisions (Post-MVP):**
- Multi-replica background job coordination
- Invitation revocation
- Automatic notification retry with delivery confirmation

### Data Architecture

**New Infrastructure: Prisma + PostgreSQL for Admin Panel**

Admin-panel currently has no database. Adding:
- Prisma ORM for type-safe database access
- PostgreSQL database (new container in dev environment)
- Migrations managed within admin-panel

**Invitations Table Schema:**

```sql
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'INVITED',
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invited_by VARCHAR NOT NULL,

  -- KYC Status Cache (single-writer: background job)
  l2_verification_status VARCHAR,
  card_kyc_status VARCHAR,
  last_status_check_at TIMESTAMPTZ,

  -- Flow tracking with idempotency guards
  flow1_triggered_at TIMESTAMPTZ,
  flow2_triggered_at TIMESTAMPTZ,
  enrolled_at TIMESTAMPTZ,

  -- Service-level failure tracking
  last_trigger_error TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_invitations_user_id ON invitations(user_id);
CREATE INDEX idx_invitations_status ON invitations(status);
CREATE UNIQUE INDEX idx_invitations_user_active ON invitations(user_id)
  WHERE status NOT IN ('KYC_REJECTED');
```

**Prisma Schema:**

```prisma
model Invitation {
  id                    String    @id @default(uuid())
  userId                String    @map("user_id")
  status                String    @default("INVITED")
  invitedAt             DateTime  @default(now()) @map("invited_at")
  invitedBy             String    @map("invited_by")

  // KYC Status Cache
  l2VerificationStatus  String?   @map("l2_verification_status")
  cardKycStatus         String?   @map("card_kyc_status")
  lastStatusCheckAt     DateTime? @map("last_status_check_at")

  // Flow tracking
  flow1TriggeredAt      DateTime? @map("flow1_triggered_at")
  flow2TriggeredAt      DateTime? @map("flow2_triggered_at")
  enrolledAt            DateTime? @map("enrolled_at")

  // Error tracking
  lastTriggerError      String?   @map("last_trigger_error")

  // Metadata
  metadata              Json      @default("{}")

  @@index([userId])
  @@index([status])
  @@unique([userId], name: "idx_invitations_user_active")
  @@map("invitations")
}
```

**Design Rationale:**
- Vendor-agnostic naming (`l2VerificationStatus`, `cardKycStatus`)
- `flow2TriggeredAt` serves as idempotency guard
- Single active invitation per user enforced by unique index
- `lastTriggerError` tracks gRPC-level failures only (fire-and-forget pattern)

### Status State Machine

**States:**

| Status | Meaning |
|--------|---------|
| `INVITED` | Invitation sent, user hasn't completed L2 verification |
| `KYC_IN_PROGRESS` | User has L2 verification, waiting on card KYC |
| `KYC_APPROVED` | Both L2 and card KYC approved |
| `KYC_REJECTED` | Card KYC rejected (final for card program) |
| `PROGRAM_SIGNUP_TRIGGERED` | Flow 2 notification triggered |
| `ENROLLED` | User completed program enrollment |

**Transitions:**

```
INVITED → KYC_IN_PROGRESS       (L2 verification detected)
KYC_IN_PROGRESS → KYC_APPROVED  (Card KYC approved)
KYC_IN_PROGRESS → KYC_REJECTED  (Card KYC rejected - final)
KYC_APPROVED → PROGRAM_SIGNUP_TRIGGERED (Auto Flow 2)
PROGRAM_SIGNUP_TRIGGERED → ENROLLED (User completes enrollment)
```

**Key Insight:** We cannot observe "user started KYC" - we only detect L2 approval. `KYC_IN_PROGRESS` means L2 done, waiting on card KYC.

### API & Communication Patterns

**Admin Panel Internal (Server Actions + Prisma):**

```typescript
// Server actions - no GraphQL needed for internal data
async function createInvitations(userIds: string[], templateYaml: string)
async function getInvitations(status?: string, limit?: number, offset?: number)
async function getInvitation(id: string)
async function resendNotification(invitationId: string, flow: 'FLOW1' | 'FLOW2')
```

**External GraphQL Calls:**

| Operation | Service | Status |
|-----------|---------|--------|
| User search by phone/email | Main API | ✅ Exists |
| L2 verification status | Main API | ✅ Exists |
| Send notification | Main API (`MarketingNotificationTrigger`) | ✅ Exists |

**External gRPC Calls:**

| Operation | Service | Status |
|-----------|---------|--------|
| Card KYC statuses (`GetApplicationStatuses`) | blink-card | ⚠️ Needs to be added |

*Note: Batch API for efficiency—single round trip for all invitations in a polling cycle.*

**Why gRPC for blink-card:**
- blink-card is a separate repository with existing gRPC services
- Adding a GraphQL query would require federation infrastructure (supergraph config, Apollo Router, deployment pipeline changes)
- gRPC is the direct, boring solution for service-to-service communication
- Background job polling fits gRPC pattern better than extending user-facing GraphQL

**Notification Integration:**
- Fire-and-forget pattern via existing `MarketingNotificationTrigger`
- Cannot confirm FCM delivery - only gRPC success/failure
- "Resend" = re-trigger notification (no delivery confirmation)

### Background Job Architecture

**Implementation:** `node-cron` embedded in Next.js process

```typescript
// Pseudo-code for background job
cron.schedule('*/15 * * * *', async () => {
  const invitations = await prisma.invitation.findMany({
    where: { status: { in: ['INVITED', 'KYC_IN_PROGRESS', 'KYC_APPROVED'] } }
  });

  for (const inv of invitations) {
    // Check L2 status
    if (inv.status === 'INVITED') {
      const hasL2 = await checkL2Verification(inv.userId);
      if (hasL2) {
        await prisma.invitation.update({
          where: { id: inv.id },
          data: {
            status: 'KYC_IN_PROGRESS',
            l2VerificationStatus: 'approved',
            lastStatusCheckAt: new Date()
          }
        });
      }
    }

    // Check card KYC status
    if (inv.status === 'KYC_IN_PROGRESS') {
      const cardStatus = await checkCardKycStatus(inv.userId);
      if (cardStatus.status === 'approved') {
        await prisma.invitation.update({
          where: { id: inv.id },
          data: {
            status: 'KYC_APPROVED',
            cardKycStatus: 'approved',
            lastStatusCheckAt: new Date()
          }
        });
      } else if (cardStatus.status === 'rejected') {
        await prisma.invitation.update({
          where: { id: inv.id },
          data: {
            status: 'KYC_REJECTED',
            cardKycStatus: 'rejected',
            metadata: { rejectionReason: cardStatus.reason },
            lastStatusCheckAt: new Date()
          }
        });
      }
    }

    // Auto-trigger Flow 2 (with idempotency guard)
    if (inv.status === 'KYC_APPROVED' && !inv.flow2TriggeredAt) {
      try {
        await triggerFlow2Notification(inv);
        await prisma.invitation.update({
          where: { id: inv.id },
          data: {
            status: 'PROGRAM_SIGNUP_TRIGGERED',
            flow2TriggeredAt: new Date()
          }
        });
      } catch (error) {
        await prisma.invitation.update({
          where: { id: inv.id },
          data: { lastTriggerError: error.message }
        });
      }
    }
  }
});
```

**Single-Writer Pattern:** Background job is the only writer for KYC status columns. UI reads from cache.

### Infrastructure Changes Required

**Dev Environment (Tilt/docker-compose):**
- Add PostgreSQL container for admin-panel
- Configure connection string

**Admin Panel:**
- Add Prisma dependency
- Create schema and migrations
- Add database client initialization

### Decision Impact Analysis

**Implementation Sequence:**
1. Add Prisma + PostgreSQL infrastructure to admin-panel
2. Create database schema and run initial migration
3. Implement server actions for invitation CRUD
4. Build UI pages (list, detail, new invitation)
5. Add background job with node-cron
6. Integrate notification service calls
7. Coordinate with mobile team for DeepLinkScreen values

**External Dependencies:**
- `GetApplicationStatus` gRPC RPC in blink-card (needs to be added)
- New DeepLinkScreen enum values in mobile app

### Template Architecture

**YAML Template Structure (Multi-Language Support):**

```yaml
# invitation-template.yaml
flow1:
  localizedContents:
    - language: en
      title: "You're invited to join our program"
      body: "Tap to begin your verification"
    - language: es
      title: "Has sido invitado a unirse a nuestro programa"
      body: "Toca para comenzar tu verificación"
  icon: BELL
  deepLinkScreen: KYC_START
  shouldSendPush: true
  shouldAddToHistory: true
  shouldAddToBulletin: false

flow2:
  localizedContents:
    - language: en
      title: "Verification approved!"
      body: "Complete your enrollment"
    - language: es
      title: "¡Verificación aprobada!"
      body: "Completa tu inscripción"
  icon: CHECK
  deepLinkScreen: PROGRAM_SIGNUP
  shouldSendPush: true
  shouldAddToHistory: true
  shouldAddToBulletin: false
```

**Why Multi-Language:**
- Blink operates internationally (El Salvador, global users)
- Users set preferred language in mobile app
- Notification service automatically selects content based on user's locale
- Falls back to "en" (English) if user's locale not in template

**Validation Rules:**
- At least one `localizedContents` entry required (language: "en" recommended as default)
- `deepLinkScreen` must be valid enum value
- `icon` must be valid NotificationIcon enum

**Template Flow:**
1. Admin uploads YAML via UI
2. Admin panel parses and validates YAML
3. On invitation create: store template content in invitation metadata
4. On notification trigger: pass `localizedContents` array to `MarketingNotificationTrigger`

**Note:** Unlike reference branch (DB-stored templates), we pass template content at runtime. Template is stored in invitation record for audit trail and resend capability.

## Implementation Patterns & Consistency Rules

### Established Patterns (Follow Existing Admin-Panel)

| Category | Pattern |
|----------|---------|
| File naming | kebab-case for files, PascalCase for components |
| TypeScript | Strict mode, types co-located or in `.types.ts` |
| React | Functional components with hooks |
| Styling | Tailwind CSS utility classes |
| GraphQL | Apollo Client with generated types |

### New Patterns (Defined for This Feature)

#### Database Naming (Prisma/PostgreSQL)

| Element | Convention | Example |
|---------|------------|---------|
| Tables | snake_case plural | `invitations` |
| Columns | snake_case | `user_id`, `last_status_check_at` |
| Indexes | `idx_{table}_{column}` | `idx_invitations_user_id` |
| Prisma models | PascalCase singular | `Invitation` |
| Prisma fields | camelCase | `userId`, `lastStatusCheckAt` |

#### Status Values

SCREAMING_SNAKE_CASE for all status enum values:
`INVITED`, `KYC_IN_PROGRESS`, `KYC_APPROVED`, `KYC_REJECTED`, `PROGRAM_SIGNUP_TRIGGERED`, `ENROLLED`

#### Server Actions

- Location: `app/invitations/actions.ts`
- Naming: `verb` + `noun` (e.g., `createInvitations`, `getInvitationById`)
- Return type: `ActionResult<T>` pattern, never throw

```typescript
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }
```

#### Background Jobs

- Location: `app/jobs/` directory
- Naming: `{feature}-{action}.ts` (e.g., `invitation-status-poller.ts`)
- Single exported async function per job

#### Component Organization

```
components/invitations/
  invitation-list.tsx
  invitation-detail.tsx
  invitation-form.tsx
  status-badge.tsx
  index.ts
```

### Anti-Patterns (Explicitly Avoid)

| Anti-Pattern | Correct Pattern |
|--------------|-----------------|
| Vendor names in schema (`sumsub_status`) | Generic names (`l2_verification_status`) |
| Throwing errors from server actions | Return `{ success: false, error }` |
| Database-stored templates | YAML string passed at runtime |
| Fetching KYC on every page load | Read from cached status columns |
| UI writing to KYC status columns | Background job is single writer |
| Single-language notifications | Multi-language `localizedContents` array |

## Project Structure & Boundaries

### New Files & Directories for Invitation Feature

```
apps/admin-panel/
├── prisma/                              # NEW - Database infrastructure
│   ├── schema.prisma                    # Prisma schema with Invitation model
│   └── migrations/                      # Migration files
│       └── 20241218_create_invitations/
│
├── app/
│   ├── invitations/                     # NEW - Invitation feature routes
│   │   ├── page.tsx                     # List view (FR1, FR2)
│   │   ├── [id]/
│   │   │   └── page.tsx                 # Detail view (FR3)
│   │   ├── new/
│   │   │   └── page.tsx                 # Create invitation form (FR4, FR5)
│   │   ├── actions.ts                   # Server actions (CRUD operations)
│   │   └── types.ts                     # TypeScript types
│   │
│   └── jobs/                            # NEW - Background job infrastructure
│       ├── cron.ts                      # Cron scheduler initialization
│       └── invitation-status-poller.ts  # KYC polling job (FR21-24)
│
├── components/
│   └── invitations/                     # NEW - Invitation UI components
│       ├── invitation-list.tsx          # List table with filters
│       ├── invitation-detail.tsx        # Detail card
│       ├── invitation-form.tsx          # Create form with user search
│       ├── status-badge.tsx             # Status indicator
│       ├── template-uploader.tsx        # YAML template upload (FR25-28)
│       └── index.ts                     # Re-exports
│
├── lib/
│   ├── prisma.ts                        # NEW - Prisma client singleton
│   ├── invitation-service.ts            # NEW - Business logic
│   ├── template-parser.ts               # NEW - YAML template validation
│   ├── invitation-code.ts               # NEW - HMAC token generation
│   └── blink-card-client.ts             # NEW - gRPC client for blink-card
│
└── graphql.gql                          # EXISTING - No changes needed
```

### Requirements to Structure Mapping

| PRD Requirement | File/Component |
|-----------------|----------------|
| FR1-3: Invitation list/detail | `app/invitations/page.tsx`, `[id]/page.tsx` |
| FR4-6: Create invitation | `app/invitations/new/page.tsx`, `actions.ts` |
| FR7-10: User discovery | `invitation-form.tsx` (uses existing user search query) |
| FR11-15: Status monitoring | `invitation-detail.tsx`, `status-badge.tsx` |
| FR16-20: Notification delivery | `actions.ts` → `MarketingNotificationTrigger` |
| FR21-24: Automated workflows | `jobs/invitation-status-poller.ts` |
| FR25-28: Template management | `template-uploader.tsx`, `template-parser.ts` |

### Architectural Boundaries

**Data Boundary:**

- Admin panel owns `invitations` table (Prisma/PostgreSQL)
- External services accessed via GraphQL (read-only for status)
- Single-writer pattern: only background job writes KYC status columns

**Component Boundaries:**

| Layer | Responsibility | Can Call |
|-------|---------------|----------|
| `app/invitations/page.tsx` | Route handling, data fetching | Server actions, components |
| `app/invitations/actions.ts` | Server actions, mutations | Prisma, external GraphQL |
| `components/invitations/*` | UI rendering | None (props only) |
| `lib/invitation-service.ts` | Business logic | Prisma, GraphQL client |
| `jobs/invitation-status-poller.ts` | Background polling | Prisma, GraphQL, notifications |

### Integration Points

**External GraphQL Calls:**

| Query/Mutation | Service | Purpose |
|----------------|---------|---------|
| `accountDetailsByUserPhone` | Main API | User search by phone |
| `accountDetailsByUserEmail` | Main API | User search by email |
| `accountDetailsByAccountId` | Main API | Get L2 verification status |
| `marketingNotificationTrigger` | Main API | Send notifications |

**gRPC Integration Points:**

| RPC | Service | Purpose |
|-----|---------|---------|
| `GetApplicationStatuses` | blink-card | Batch query card KYC status for multiple invited users |

### Dev Environment Changes

**New Container (admin-panel-db):**

```yaml
admin-panel-db:
  image: postgres:15
  environment:
    POSTGRES_DB: admin_panel
    POSTGRES_USER: admin
    POSTGRES_PASSWORD: admin
  ports:
    - "5433:5432"
```

**New Environment Variables:**

```
DATABASE_URL="postgresql://admin:admin@localhost:5433/admin_panel"
INVITATION_TOKEN_SECRET="<shared-secret-from-vault>"  # Same secret in blink-card
BLINK_CARD_GRPC_URL="localhost:50051"  # blink-card gRPC endpoint
```

### gRPC Infrastructure

**New Dependencies for admin-panel:**

```json
{
  "dependencies": {
    "@grpc/grpc-js": "^1.9.0",
    "@grpc/proto-loader": "^0.7.0"
  }
}
```

**Proto Contract (blink-card side):**

```protobuf
// invitation_service.proto
syntax = "proto3";

package blink.card.invitation;

service InvitationService {
  // Batch query - efficient for background job polling multiple invitations
  rpc GetApplicationStatuses(GetApplicationStatusesRequest) returns (GetApplicationStatusesResponse);
}

message GetApplicationStatusesRequest {
  repeated string user_ids = 1;  // Batch of user IDs to query
}

message ApplicationStatus {
  string user_id = 1;
  string status = 2;             // "pending", "approved", "rejected", "not_found"
  string rejection_reason = 3;   // Populated if status == "rejected"
  string updated_at = 4;         // ISO8601 timestamp
}

message GetApplicationStatusesResponse {
  repeated ApplicationStatus statuses = 1;  // Results keyed by user_id
}
```

**Client Implementation (`lib/blink-card-client.ts`):**

```typescript
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const PROTO_PATH = './protos/invitation_service.proto';

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition).blink.card.invitation;

const client = new proto.InvitationService(
  process.env.BLINK_CARD_GRPC_URL,
  grpc.credentials.createInsecure() // Use TLS in production
);

export type CardKycStatus = {
  userId: string;
  status: 'pending' | 'approved' | 'rejected' | 'not_found';
  rejectionReason?: string;
  updatedAt?: string;
};

// Batch query - single round trip for multiple users
export async function getCardKycStatuses(userIds: string[]): Promise<Map<string, CardKycStatus>> {
  return new Promise((resolve, reject) => {
    client.GetApplicationStatuses({ user_ids: userIds }, (err, response) => {
      if (err) {
        reject(err);
        return;
      }

      const statusMap = new Map<string, CardKycStatus>();
      for (const status of response.statuses) {
        statusMap.set(status.user_id, {
          userId: status.user_id,
          status: status.status,
          rejectionReason: status.rejection_reason || undefined,
          updatedAt: status.updated_at || undefined,
        });
      }
      resolve(statusMap);
    });
  });
}
```

**Usage in background job:**

```typescript
// Efficient: single gRPC call for all invitations
const userIds = invitations.map(inv => inv.userId);
const statuses = await getCardKycStatuses(userIds);

for (const inv of invitations) {
  const kycStatus = statuses.get(inv.userId);
  // Process each invitation with cached status
}
```

**Why gRPC over GraphQL Federation:**
- blink-card already has gRPC services exposed (trivial to add new RPC)
- Admin GraphQL is monolithic - would need to set up federation infrastructure:
  - Supergraph config (doesn't exist for admin)
  - Apollo Router
  - Deployment pipeline changes for schema composition
- gRPC is direct service-to-service call (1 hop vs 2 hops)
- Background job polling fits gRPC pattern better than user-facing GraphQL

## Architecture Validation Results

### Coherence Validation ✅

All architectural decisions are compatible and consistent:
- Prisma + PostgreSQL + Next.js 14 work together seamlessly
- Implementation patterns align with technology choices
- No contradictory decisions identified

### Requirements Coverage ✅

**Functional Requirements:** All 28 FRs have architectural support
**Non-Functional Requirements:** All NFRs addressed (NFR5 partial due to single-replica)

### Invitation Code Security

**Purpose:** Restrict access to Rain KYC flow (`cardConsumerApplicationCreate` mutation in blink-card). Since the GraphQL API is public, invitation codes prevent unauthorized access.

**Token Structure:**
```
HMAC-SHA256(source_key + expiration_day + nonce, INVITATION_TOKEN_SECRET)
```

**Flow:**
1. Admin-panel generates signed invitation code when creating invitation
2. Code included in Flow 1 notification deep link: `blink://kyc?code=<token>`
3. Mobile app extracts code, passes to `cardConsumerApplicationCreate`
4. blink-card validates code using shared secret

**Infrastructure:**
- Secret stored in vault (HashiCorp Vault / K8s secrets)
- Passed to admin-panel via `INVITATION_TOKEN_SECRET` env var
- Same secret configured in blink-card for validation

**New Files:**
- `lib/invitation-code.ts` - Token generation logic

**Schema Addition:**
```prisma
model Invitation {
  // ... existing fields ...
  invitationCode    String?   @map("invitation_code")  // Generated signed token
}
```

### External Dependencies (Blockers)

| Dependency | Owner | Required For |
|------------|-------|--------------|
| New DeepLinkScreen values (`KYC_START`, `PROGRAM_SIGNUP`) | Mobile team | Flow 1 & 2 notifications |
| New `GetApplicationStatuses` gRPC RPC (batch) | blink-card team | Background job polling |
| Shared `INVITATION_TOKEN_SECRET` | DevOps/blink-card | Token validation |

### Implementation Readiness ✅

**Decision Completeness:** All critical decisions documented with specifics
**Structure Completeness:** All files, directories, and boundaries defined
**Pattern Completeness:** Naming, anti-patterns, and single-writer enforced

### Architecture Completeness Checklist

- [x] Project context analyzed with Party Mode insights
- [x] Existing codebase patterns identified (brownfield)
- [x] Reference branches analyzed (patterns to adopt/avoid)
- [x] Prisma schema with vendor-agnostic naming
- [x] Status state machine fully specified
- [x] Multi-language YAML template format
- [x] Background job single-writer pattern
- [x] Graceful degradation states defined
- [x] Project structure mapped to requirements
- [x] External dependencies documented as blockers

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** HIGH

**Key Strengths:**
- Lean approach avoids over-engineering of reference branches
- Cache-on-poll eliminates timeout cascade risks
- Multi-language support matches existing notification system
- Clear boundaries prevent implementation conflicts

**First Implementation Priority:**
1. Add Prisma + PostgreSQL infrastructure to admin-panel
2. Coordinate with mobile team on DeepLinkScreen values
3. Request cardKycStatus query from blink-card team

## Architecture Completion Summary

### Workflow Completion

**Architecture Decision Workflow:** COMPLETED ✅
**Total Steps Completed:** 8
**Date Completed:** 2025-12-18
**Document Location:** `docs/bmad/architecture-decision.md`

### Final Architecture Deliverables

**Complete Architecture Document:**
- All architectural decisions documented with specific versions
- Implementation patterns ensuring AI agent consistency
- Complete project structure with all files and directories
- Requirements to architecture mapping
- Validation confirming coherence and completeness

**Implementation Ready Foundation:**
- 12+ architectural decisions made (database, status machine, templates, jobs, patterns)
- 6 implementation patterns defined (naming, actions, jobs, components, errors, anti-patterns)
- 15+ new files/directories specified
- 28 functional requirements fully supported

**AI Agent Implementation Guide:**
- Technology stack: Next.js 14, Prisma, PostgreSQL, node-cron
- Consistency rules preventing implementation conflicts
- Project structure with clear boundaries
- Integration patterns for external services

### Implementation Handoff

**For AI Agents:**
This architecture document is your complete guide for implementing the Program Invitation System. Follow all decisions, patterns, and structures exactly as documented.

**Development Sequence:**
1. Add Prisma + PostgreSQL infrastructure to admin-panel
2. Create database schema and run initial migration
3. Implement server actions for invitation CRUD
4. Build UI pages (list, detail, new invitation)
5. Add background job with node-cron
6. Integrate notification service calls
7. Coordinate with mobile team for DeepLinkScreen values

### Quality Assurance Checklist

**✅ Architecture Coherence**
- [x] All decisions work together without conflicts
- [x] Technology choices are compatible
- [x] Patterns support the architectural decisions
- [x] Structure aligns with all choices

**✅ Requirements Coverage**
- [x] All 28 functional requirements are supported
- [x] All 14 non-functional requirements are addressed
- [x] Cross-cutting concerns are handled
- [x] Integration points are defined

**✅ Implementation Readiness**
- [x] Decisions are specific and actionable
- [x] Patterns prevent agent conflicts
- [x] Structure is complete and unambiguous
- [x] Examples provided for clarity

---

**Architecture Status:** READY FOR IMPLEMENTATION ✅

**Next Phase:** Begin implementation using the architectural decisions and patterns documented herein.

**Document Maintenance:** Update this architecture when major technical decisions are made during implementation.
