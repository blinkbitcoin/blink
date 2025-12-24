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

## Repository Strategy Decision

### Constraint: Public/Private Repo Boundary

**Problem:** The blink repository is public, but the invitation dashboard requires e2e testing with blink-card (private repo). Exposing blink-card's Docker image to the public repo is not acceptable.

**Decision: Separate Private Repository**

Create a new private repository (`invitation-dashboard`) that:
- Replicates admin-panel authentication code
- Contains only invitation-specific functionality
- Has full access to blink-card for e2e testing

| Aspect | Original Plan | Updated Plan |
|--------|---------------|--------------|
| Repository | `blink/apps/admin-panel/` | New private `invitation-dashboard` repo |
| Scope | Extension to admin-panel | Standalone CEO-only tool |
| User base | All admins | CEO only |
| e2e testing | Limited (no blink-card access) | Full (private repo can access blink-card) |

### Rationale

1. **Single user (CEO)** - No UX fragmentation concern; CEO uses this tool, other admins use main panel
2. **Different purpose** - Not duplicating admin-panel, building a specialized invitation tool
3. **Minimal scope** - Auth + invitation CRUD + status polling only
4. **Private repo** - Full access to blink-card for comprehensive e2e testing

### Vendored Dependencies

Since the invitation-dashboard is a separate repo, certain dependencies must be vendored:

| Dependency | Source | Method |
|------------|--------|--------|
| GraphQL Admin Schema | `core/api/src/graphql/admin/schema.graphql` | Vendir or manual copy |
| Proto files | blink-card repo | Copy to `protos/` directory |
| ESLint config | `@galoy/eslint-config` | Use standard ESLint preset |

### Oathkeeper Integration

**Decision: Separate Route Pattern (Option 2)**

Add a new oathkeeper access rule for the invitation dashboard:

```yaml
# Existing rule for admin-panel
- id: admin-backend
  match:
    url: "<(http|https)>://<.*>/admin/<.*>"
  upstream:
    url: http://graphql-admin:4001
    strip_path: /admin
  authenticators:
    - handler: cookie_session
      config:
        check_session_url: "http://admin-panel:3000/api/auth/session"

# NEW rule for invitation-dashboard
- id: invitation-admin-backend
  match:
    url: "<(http|https)>://<.*>/invitation-admin/<.*>"
  upstream:
    url: http://graphql-admin:4001
    strip_path: /invitation-admin
  authenticators:
    - handler: cookie_session
      config:
        check_session_url: "http://invitation-dashboard:3000/api/auth/session"
```

**Key points:**
- Both routes forward to the **same backend** (`graphql-admin:4001`)
- URL pattern determines which session endpoint validates the request
- Invitation dashboard uses its own NextAuth session for cookie validation
- No shared `NEXTAUTH_SECRET` required between apps

### Secrets Management

All secrets stored in Concourse vault and accessible during CI/CD:

| Secret | Purpose | Shared With |
|--------|---------|-------------|
| `INVITATION_TOKEN_SECRET` | AES-256-GCM encryption key | blink-card |
| `CARD_PROGRAM_SOURCE_KEY` | Card program identifier | blink-card |
| `NEXTAUTH_SECRET` | JWT session encryption | Isolated to invitation-dashboard |
| `GOOGLE_CLIENT_ID` | OAuth authentication | New OAuth app for invitation-dashboard |
| `GOOGLE_CLIENT_SECRET` | OAuth authentication | New OAuth app for invitation-dashboard |

## Starter Template Evaluation

### Brownfield Project - Existing Stack

This is a brownfield-inspired project in a new private repository. We replicate proven patterns from admin-panel.

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
  account_id VARCHAR NOT NULL,  -- For blink-card queries (fetched via admin GraphQL)
  status VARCHAR NOT NULL DEFAULT 'INVITED',
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invited_by VARCHAR NOT NULL,

  -- KYC Status Cache (single-writer: background job)
  l2_verification_status VARCHAR,
  card_kyc_status VARCHAR,       -- Stores granular Rain status (e.g., ManualReview, Pending)
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
CREATE INDEX idx_invitations_account_id ON invitations(account_id);
CREATE INDEX idx_invitations_status ON invitations(status);
CREATE UNIQUE INDEX idx_invitations_user_active ON invitations(user_id)
  WHERE status NOT IN ('KYC_REJECTED');
```

**Prisma Schema:**

```prisma
model Invitation {
  id                    String    @id @default(uuid())
  userId                String    @map("user_id")
  accountId             String    @map("account_id")  // For blink-card queries
  status                String    @default("INVITED")
  invitedAt             DateTime  @default(now()) @map("invited_at")
  invitedBy             String    @map("invited_by")

  // KYC Status Cache
  l2VerificationStatus  String?   @map("l2_verification_status")
  cardKycStatus         String?   @map("card_kyc_status")  // Granular Rain status
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

**Granular Rain KYC Status Mapping:**

The `card_kyc_status` column stores the granular Rain status for detailed visibility:

| Rain Status | Maps to Invitation Status | UI Display |
|-------------|---------------------------|------------|
| `NotStarted` | `KYC_IN_PROGRESS` | Card KYC: Not Started |
| `Pending` | `KYC_IN_PROGRESS` | Card KYC: Pending |
| `NeedsInformation` | `KYC_IN_PROGRESS` | Card KYC: Needs Information |
| `NeedsVerification` | `KYC_IN_PROGRESS` | Card KYC: Needs Verification |
| `ManualReview` | `KYC_IN_PROGRESS` | Card KYC: Manual Review |
| `Approved` | `KYC_APPROVED` | Card KYC: Approved |
| `Denied` | `KYC_REJECTED` | Card KYC: Denied |
| `Locked` | `KYC_REJECTED` | Card KYC: Locked |
| `Canceled` | `KYC_REJECTED` | Card KYC: Canceled |

**UI Display Pattern:**
```
┌─────────────────────────────────────────────┐
│ Status: KYC_IN_PROGRESS                     │  ← Main status badge
│ Card KYC: ManualReview                      │  ← Sub-text (granular)
└─────────────────────────────────────────────┘
```

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
| User search by phone/email | Admin API | ✅ Exists |
| Get account_id for user | Admin API | ✅ Exists (used at invitation creation) |
| L2 verification status | Main API | ✅ Exists |
| Send notification | Main API (`MarketingNotificationTrigger`) | ✅ Exists |

**account_id Resolution:**
During invitation creation, `account_id` is fetched via Admin GraphQL and stored alongside `user_id`. The background job uses `account_id` to query blink-card.

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

### Project Structure (Private Repository)

```
invitation-dashboard/                    # NEW private repository
├── prisma/
│   ├── schema.prisma                    # Prisma schema with Invitation model
│   └── migrations/
│       └── 20241218_create_invitations/
│
├── app/
│   ├── page.tsx                         # Redirect to /invitations
│   ├── layout.tsx                       # Root layout with sidebar
│   ├── api/auth/[...nextauth]/          # NextAuth.js (copied from admin-panel)
│   │   ├── route.ts
│   │   └── options.ts
│   ├── invitations/
│   │   ├── page.tsx                     # List view (FR1, FR2)
│   │   ├── [id]/
│   │   │   └── page.tsx                 # Detail view (FR3)
│   │   ├── new/
│   │   │   └── page.tsx                 # Create invitation form (FR4, FR5)
│   │   ├── actions.ts                   # Server actions (CRUD operations)
│   │   └── types.ts                     # TypeScript types
│   │
│   ├── jobs/
│   │   ├── cron.ts                      # Cron scheduler initialization
│   │   └── invitation-status-poller.ts  # KYC polling job (FR21-24)
│   │
│   ├── env.ts                           # Environment validation (T3 env)
│   ├── graphql-rsc.tsx                  # Apollo client setup
│   └── middleware.ts                    # NextAuth middleware
│
├── components/
│   ├── invitations/
│   │   ├── invitation-list.tsx
│   │   ├── invitation-detail.tsx
│   │   ├── invitation-form.tsx
│   │   ├── status-badge.tsx
│   │   ├── template-uploader.tsx
│   │   └── index.ts
│   └── side-bar.tsx                     # Simplified navigation
│
├── lib/
│   ├── prisma.ts                        # Prisma client singleton
│   ├── invitation-service.ts            # Business logic
│   ├── template-parser.ts               # YAML template validation
│   ├── invitation-code.ts               # AES-256-GCM token generation
│   └── blink-card-client.ts             # gRPC client for blink-card
│
├── protos/
│   └── invitation_service.proto         # Vendored from blink-card
│
├── graphql.gql                          # Invitation-specific queries only
├── codegen.yml                          # GraphQL codegen config
├── generated.ts                         # Auto-generated GraphQL types
│
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── Dockerfile
└── .env.example                         # Environment template
```

**Key differences from admin-panel:**
- Standalone repo (not in blink monorepo)
- Only invitation-related pages (no accounts, transactions, merchants)
- Vendored proto files in `protos/` directory
- Simplified sidebar with invitation-only navigation
- Own OAuth credentials and deployment pipeline

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

### Dev Environment (Private Repository)

The invitation-dashboard has its own dev environment separate from the main blink stack:

**docker-compose.yml:**

```yaml
version: '3.8'
services:
  invitation-dashboard:
    build: .
    ports:
      - "3004:3000"
    environment:
      - DATABASE_URL=postgresql://admin:admin@db:5432/invitation_dashboard
      - ADMIN_CORE_API=http://host.docker.internal:4455/invitation-admin/graphql
      - BLINK_CARD_GRPC_URL=host.docker.internal:50051
    depends_on:
      - db

  db:
    image: postgres:15
    environment:
      POSTGRES_DB: invitation_dashboard
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: admin
    ports:
      - "5434:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

**Required Environment Variables (.env.example):**

```bash
# Database
DATABASE_URL="postgresql://admin:admin@localhost:5434/invitation_dashboard"

# Authentication (new OAuth app for invitation-dashboard)
GOOGLE_CLIENT_ID="<from-google-cloud-console>"
GOOGLE_CLIENT_SECRET="<from-google-cloud-console>"
NEXTAUTH_URL="http://localhost:3004"
NEXTAUTH_SECRET="<random-32-char-string>"
AUTHORIZED_EMAILS="ceo@blink.sv"

# External Services
ADMIN_CORE_API="http://localhost:4455/invitation-admin/graphql"
BLINK_CARD_GRPC_URL="localhost:50051"

# Invitation Token Security (shared with blink-card)
INVITATION_TOKEN_SECRET="<32-byte-hex-from-vault>"
CARD_PROGRAM_SOURCE_KEY="<string-from-vault>"

# Optional: Tracing
OTEL_EXPORTER_OTLP_ENDPOINT=""
TRACING_SERVICE_NAME="invitation-dashboard"
```

**Local Development with blink stack:**
- Run `buck2 run dev:up` in blink repo to start core services
- Run `docker-compose up` in invitation-dashboard repo
- Invitation-dashboard connects to blink services via `host.docker.internal`

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
  repeated string account_ids = 1;  // Batch of account IDs to query
}

message ApplicationStatus {
  string account_id = 1;
  string status = 2;             // Granular: NotStarted, Pending, Approved, NeedsInformation, NeedsVerification, ManualReview, Denied, Locked, Canceled
  string rejection_reason = 3;   // Populated if status is Denied/Locked/Canceled
  string updated_at = 4;         // ISO8601 timestamp
}

message GetApplicationStatusesResponse {
  repeated ApplicationStatus statuses = 1;  // Results keyed by account_id
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

// Granular Rain KYC statuses
export type RainKycStatus =
  | 'NotStarted' | 'Pending' | 'Approved'
  | 'NeedsInformation' | 'NeedsVerification' | 'ManualReview'
  | 'Denied' | 'Locked' | 'Canceled';

export type CardKycStatus = {
  accountId: string;
  status: RainKycStatus;
  rejectionReason?: string;
  updatedAt?: string;
};

// Batch query - single round trip for multiple accounts
export async function getCardKycStatuses(accountIds: string[]): Promise<Map<string, CardKycStatus>> {
  return new Promise((resolve, reject) => {
    client.GetApplicationStatuses({ account_ids: accountIds }, (err, response) => {
      if (err) {
        reject(err);
        return;
      }

      const statusMap = new Map<string, CardKycStatus>();
      for (const status of response.statuses) {
        statusMap.set(status.account_id, {
          accountId: status.account_id,
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
const accountIds = invitations.map(inv => inv.accountId);
const statuses = await getCardKycStatuses(accountIds);

for (const inv of invitations) {
  const kycStatus = statuses.get(inv.accountId);
  // Process each invitation with cached granular status
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

**Token Structure (AES-256-GCM Encryption):**

```
Encrypted Payload = AES-256-GCM({
  source_key: String,    // Card program identifier (from CARD_PROGRAM_SOURCE_KEY env var)
  account_id: String,    // Binds token to specific account (prevents transfer)
  timestamp: i64,        // Unix timestamp for expiration checking
  nonce: u64             // Random value for replay protection
})

Final Token = Base64(iv || ciphertext)
                     ↑
                     12-byte IV for AES-GCM (separate from payload nonce)
```

**Security Properties:**
- **Account binding**: `account_id` in payload prevents token transfer between users
- **Expiration**: `timestamp` allows server to reject expired tokens
- **Replay protection**: `nonce` ensures each token is unique
- **Confidentiality**: AES-256-GCM encrypts payload, preventing inspection

**Flow:**
1. Admin-panel generates encrypted invitation code when creating invitation
2. Code included in Flow 1 notification deep link: `blink://kyc?code=<token>`
3. Mobile app extracts code, passes to `cardConsumerApplicationCreate`
4. blink-card decrypts and validates: checks account_id matches, timestamp not expired

**Infrastructure:**
- Secrets stored in vault (HashiCorp Vault / K8s secrets)
- `INVITATION_TOKEN_SECRET` env var: 32-byte AES key (shared with blink-card)
- `CARD_PROGRAM_SOURCE_KEY` env var: string identifying the card program (shared with blink-card)

**New Files:**
- `lib/invitation-code.ts` - Token generation logic (AES-256-GCM encryption)

**Schema Addition:**
```prisma
model Invitation {
  // ... existing fields ...
  invitationCode    String?   @map("invitation_code")  // Generated encrypted token
}
```

### External Dependencies (Blockers)

| Dependency | Owner | Required For |
|------------|-------|--------------|
| New DeepLinkScreen values (`KYC_START`, `PROGRAM_SIGNUP`) | Mobile team | Flow 1 & 2 notifications |
| `GetApplicationStatuses` gRPC RPC (batch by account_id) | blink-card team | Background job polling |
| `INVITATION_TOKEN_SECRET` (32-byte AES key) | DevOps/blink-card | Token encryption/decryption |
| `CARD_PROGRAM_SOURCE_KEY` (String) | DevOps/blink-card | Token payload validation |

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

**Phase 0: Repository Setup**
1. Create new private GitHub repository (`invitation-dashboard`)
2. Copy authentication code from admin-panel (`api/auth/`, `middleware.ts`, `env.ts`)
3. Set up new Google OAuth credentials in Google Cloud Console
4. Configure Terraform module for invitation-dashboard deployment
5. Add oathkeeper access rule for `/invitation-admin/*` route

**Phase 1: Core Infrastructure**
1. Set up Next.js 14 project with TypeScript, Tailwind CSS
2. Add Prisma + PostgreSQL with docker-compose
3. Create database schema and run initial migration
4. Vendor GraphQL schema and run codegen
5. Vendor proto files from blink-card

**Phase 2: Feature Implementation**
1. Implement server actions for invitation CRUD
2. Build UI pages (list, detail, new invitation)
3. Add gRPC client for blink-card integration
4. Add background job with node-cron
5. Integrate notification service calls

**Phase 3: External Coordination**
1. Coordinate with mobile team for DeepLinkScreen values
2. Coordinate with blink-card team for `GetApplicationStatuses` RPC
3. Coordinate with DevOps for secrets provisioning

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
