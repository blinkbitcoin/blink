---
title: 'Technical Specification: Program Invitation System'
author: hn
date: '2025-12-18'
status: draft
reviewers: []
---

# Technical Specification: Program Invitation System

**Version:** 1.2
**Status:** Draft - Ready for Peer Review
**Last Updated:** 2025-12-24

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [System Architecture](#system-architecture)
4. [Data Model](#data-model)
5. [Flow Diagrams](#flow-diagrams)
6. [API Design](#api-design)
7. [Background Job Design](#background-job-design)
8. [Security Considerations](#security-considerations)
9. [External Dependencies](#external-dependencies)
10. [Implementation Patterns](#implementation-patterns)
11. [Risk Analysis](#risk-analysis)

---

## Executive Summary

The Program Invitation System enables Blink's CEO to personally invite select VIP users to an exclusive two-phase onboarding program (initially the card program). The system provides:

- **One-click batch invitations** (up to 50 users)
- **Real-time status visibility** across the entire invitation lifecycle
- **Automatic Flow 2 triggering** when KYC completes
- **Manual retry capabilities** for failed notifications

### Repository Strategy

This is implemented as a **standalone private repository** (`invitation-dashboard`), not an extension to the existing admin-panel. This decision was made because:

- **Public/Private boundary**: blink repo is public; blink-card is private
- **e2e testing**: Private repo can access blink-card Docker image for comprehensive testing
- **CEO-only scope**: Single-user tool with minimal features; no need to share codebase with general admin-panel

The invitation-dashboard replicates admin-panel's authentication patterns while containing only invitation-specific functionality.

---

## Problem Statement

### Current State

- CEO personally knows VIP users to invite to exclusive programs
- No systematic way to track invitation status
- No visibility into where invitees are in the KYC/enrollment funnel
- Manual follow-up required for every user

### Pain Points

1. **Lost context** - No centralized view of who was invited and their progress
2. **Manual coordination** - CEO must remember to follow up with each user
3. **No automation** - When KYC completes, someone must manually trigger the next step
4. **Failure blindness** - If a notification fails, nobody knows

### Success Criteria

| Metric | Target |
|--------|--------|
| Batch invite speed | <2 min for 10 users |
| Status accuracy | Real-time on panel load |
| Auto-trigger latency | <15 min after KYC approval |
| Enrollment conversion | >80% |

---

## System Architecture

### High-Level Overview

```mermaid
flowchart TB
    subgraph InvDashboard["Invitation Dashboard (Next.js 14 - Private Repo)"]
        Pages["/invitations Pages"]
        Actions["Server Actions"]
        Prisma["Prisma ORM"]
        Cron["node-cron Scheduler"]
        Poller["invitation-status-poller.ts"]
        GrpcClient["blink-card-client.ts"]
    end

    subgraph Database["Invitation Dashboard Database"]
        InvTable[("invitations table")]
    end

    subgraph MainAPI["Main API (Admin GraphQL)"]
        UserSearch["accountDetailsByUserPhone"]
        L2Status["accountDetailsByAccountId"]
        NotifMutation["MarketingNotificationTrigger"]
    end

    subgraph BlinkCard["blink-card (gRPC)"]
        CardKYC["GetApplicationStatuses (NEW)"]
    end

    subgraph Mobile["Mobile App"]
        DeepLink["Deep Link Handler"]
        KYCFlow["KYC Flow"]
        EnrollFlow["Enrollment Flow"]
    end

    Pages --> Actions
    Actions --> Prisma
    Prisma --> InvTable

    Cron --> Poller
    Poller --> Prisma
    Poller -->|"GraphQL Query"| L2Status
    Poller --> GrpcClient
    GrpcClient -->|"gRPC (batch)"| CardKYC
    Poller -->|"GraphQL Mutation"| NotifMutation

    Actions -->|"GraphQL Query"| UserSearch
    Actions -->|"GraphQL Mutation"| NotifMutation

    NotifMutation -.->|"Push Notification"| Mobile
    DeepLink --> KYCFlow
    DeepLink --> EnrollFlow
```

**Key points:**
- Invitation dashboard queries L2 status and sends notifications via **Main API (GraphQL)** through `/invitation-admin/*` route
- Invitation dashboard queries card KYC status via **blink-card (gRPC)** - not GraphQL
- gRPC chosen over GraphQL federation because blink-card already has gRPC services; adding GraphQL would require supergraph infrastructure
- Oathkeeper validates invitation-dashboard sessions separately from admin-panel sessions

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Repository | Separate private repo | Public blink repo can't access private blink-card for e2e testing |
| Database | Prisma + PostgreSQL (new) | Standalone database for invitation-dashboard |
| Background Job | `node-cron` embedded | Simple, no external dependencies, MVP-appropriate |
| KYC Status | Cache-on-poll | Eliminates timeout cascade risk on page load |
| Card KYC API | gRPC | blink-card has existing gRPC interface; extending admin GraphQL would require federation infrastructure |
| Template Storage | YAML upload (not DB) | Lean approach; avoids over-engineering |
| Notification | Fire-and-forget | Cannot confirm FCM delivery; track "triggered" not "sent" |
| Oathkeeper Route | `/invitation-admin/*` | Separate route pattern with own session validation |

### Cache-on-Poll Pattern

Rather than fetching KYC status on every page load (which causes timeout cascades), we:

1. **Poll internal APIs** (Main API, blink-card) every 15 minutes via background job
2. **Cache status locally** in the invitations table
3. **UI reads from cache** for instant page loads
4. **Background job is single writer** for KYC status columns

### New Infrastructure Required

**Invitation Dashboard docker-compose.yml:**

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
```

**Required Environment Variables (.env.example):**

```bash
# Database
DATABASE_URL="postgresql://admin:admin@localhost:5434/invitation_dashboard"

# Authentication (separate OAuth app from admin-panel)
GOOGLE_CLIENT_ID="<from-google-cloud-console>"
GOOGLE_CLIENT_SECRET="<from-google-cloud-console>"
NEXTAUTH_URL="http://localhost:3004"
NEXTAUTH_SECRET="<random-32-char-string>"
AUTHORIZED_EMAILS="ceo@blink.sv"

# External Services (via oathkeeper /invitation-admin/* route)
ADMIN_CORE_API="http://localhost:4455/invitation-admin/graphql"
BLINK_CARD_GRPC_URL="localhost:50051"

# Invitation Token Security (shared with blink-card, from Concourse vault)
INVITATION_TOKEN_SECRET="<32-byte-hex-from-vault>"
CARD_PROGRAM_SOURCE_KEY="<string-from-vault>"
```

---

## Data Model

### Invitations Table Schema

```mermaid
erDiagram
    INVITATION {
        uuid id PK
        string user_id
        string account_id
        string status
        timestamp invited_at
        string invited_by
        string l2_verification_status
        string card_kyc_status
        timestamp last_status_check_at
        timestamp flow1_triggered_at
        timestamp flow2_triggered_at
        timestamp enrolled_at
        string last_trigger_error
        string invitation_code
        jsonb metadata
    }
```

### Prisma Schema

```prisma
model Invitation {
  id                    String    @id @default(uuid())
  userId                String    @map("user_id")
  accountId             String    @map("account_id")  // For blink-card queries
  status                String    @default("INVITED")
  invitedAt             DateTime  @default(now()) @map("invited_at")
  invitedBy             String    @map("invited_by")

  // KYC Status Cache (single-writer: background job only)
  l2VerificationStatus  String?   @map("l2_verification_status")
  cardKycStatus         String?   @map("card_kyc_status")  // Granular Rain status
  lastStatusCheckAt     DateTime? @map("last_status_check_at")

  // Flow tracking with idempotency guards
  flow1TriggeredAt      DateTime? @map("flow1_triggered_at")
  flow2TriggeredAt      DateTime? @map("flow2_triggered_at")
  enrolledAt            DateTime? @map("enrolled_at")

  // Security
  invitationCode        String?   @map("invitation_code")

  // Error tracking
  lastTriggerError      String?   @map("last_trigger_error")

  // Metadata (template content, rejection reasons)
  metadata              Json      @default("{}")

  @@index([userId])
  @@index([accountId])
  @@index([status])
  @@unique([userId], name: "idx_invitations_user_active")
  @@map("invitations")
}
```

### Status State Machine

```mermaid
stateDiagram-v2
    [*] --> INVITED: Create invitation
    INVITED --> KYC_IN_PROGRESS: L2 verification detected
    KYC_IN_PROGRESS --> KYC_APPROVED: Card KYC approved
    KYC_IN_PROGRESS --> KYC_REJECTED: Card KYC rejected
    KYC_APPROVED --> PROGRAM_SIGNUP_TRIGGERED: Auto Flow 2
    PROGRAM_SIGNUP_TRIGGERED --> ENROLLED: User completes enrollment
    KYC_REJECTED --> [*]: Final state
    ENROLLED --> [*]: Final state
```

**Status Definitions:**

| Status | Meaning |
|--------|---------|
| `INVITED` | Invitation sent, user hasn't completed L2 verification |
| `KYC_IN_PROGRESS` | User has L2 verification, waiting on card KYC |
| `KYC_APPROVED` | Both L2 and card KYC approved |
| `KYC_REJECTED` | Card KYC rejected (final for card program) |
| `PROGRAM_SIGNUP_TRIGGERED` | Flow 2 notification triggered |
| `ENROLLED` | User completed program enrollment |

**Key Insight:** We cannot observe "user started KYC" - we only detect L2 approval. `KYC_IN_PROGRESS` means L2 done, waiting on card KYC.

---

## Flow Diagrams

### Flow 1: Invitation Creation

```mermaid
sequenceDiagram
    actor CEO
    participant UI as Admin Panel UI
    participant Actions as Server Actions
    participant DB as PostgreSQL
    participant Notif as Notification Service
    participant Mobile as Mobile App

    CEO->>UI: Select users + upload YAML template
    UI->>Actions: createInvitations(userIds, template)
    Actions->>Actions: Validate template YAML
    Actions->>Actions: Generate invitation codes (AES-256-GCM)
    Actions->>DB: Create invitation records

    loop For each user
        Actions->>Notif: MarketingNotificationTrigger (Flow 1)
        Notif-->>Actions: gRPC success/failure
        Actions->>DB: Update flow1_triggered_at
    end

    Actions-->>UI: ActionResult with created/failed counts
    UI-->>CEO: Show invitation list with status

    Note over Notif,Mobile: Async - Push notification
    Notif--)Mobile: Push notification with deep link
    Mobile->>Mobile: Open KYC_START screen
```

### Flow 2: Automatic KYC-to-Enrollment Trigger

```mermaid
sequenceDiagram
    participant Cron as node-cron
    participant Poller as Status Poller Job
    participant DB as PostgreSQL
    participant MainAPI as Main API (GraphQL)
    participant BlinkCard as blink-card (gRPC)
    participant Notif as Notification Service

    Cron->>Poller: Every 15 minutes
    Poller->>DB: Fetch active invitations

    Note over Poller,BlinkCard: Batch gRPC call for all KYC_IN_PROGRESS invitations
    Poller->>BlinkCard: GetApplicationStatuses(account_ids[])
    BlinkCard-->>Poller: Map of accountId → granular Rain status

    loop For each invitation
        alt Status = INVITED
            Poller->>MainAPI: accountDetailsByAccountId (L2 status)
            MainAPI-->>Poller: level = TWO
            alt L2 Approved
                Poller->>DB: Update status = KYC_IN_PROGRESS
            end
        else Status = KYC_IN_PROGRESS
            Note over Poller: Use cached gRPC response
            alt Card KYC Approved
                Poller->>DB: Update status = KYC_APPROVED
            else Card KYC Rejected
                Poller->>DB: Update status = KYC_REJECTED
            end
        else Status = KYC_APPROVED
            alt flow2_triggered_at is NULL
                Poller->>Notif: MarketingNotificationTrigger (Flow 2)
                Poller->>DB: Update status = PROGRAM_SIGNUP_TRIGGERED
                Poller->>DB: Set flow2_triggered_at
            end
        end
    end
```

### User Journey: Complete Lifecycle

```mermaid
flowchart TD
    subgraph Admin["Admin Panel"]
        A1[CEO selects users]
        A2[Upload YAML template]
        A3[Send invitations]
        A4[Monitor status dashboard]
        A5[Manual resend if needed]
    end

    subgraph System["Background Automation"]
        S1[Poll KYC status every 15 min]
        S2[Detect L2 approval]
        S3[Detect card KYC approval]
        S4[Auto-trigger Flow 2]
    end

    subgraph User["User Mobile App"]
        U1[Receive Flow 1 notification]
        U2[Complete L2 verification]
        U3[Complete card KYC]
        U4[Receive Flow 2 notification]
        U5[Complete program enrollment]
    end

    A1 --> A2 --> A3
    A3 --> U1
    A3 --> A4

    U1 --> U2 --> U3

    S1 --> S2
    S2 --> S3
    S3 --> S4

    U2 -.-> S2
    U3 -.-> S3
    S4 --> U4

    U4 --> U5

    A4 -.->|Status updates| S1
    A5 --> U1
```

---

## API Design

### Server Actions

```typescript
// app/invitations/actions.ts

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

// Create invitations for multiple users
async function createInvitations(
  userIds: string[],
  templateYaml: string
): Promise<ActionResult<{ created: number; failed: string[] }>>

// Get paginated invitation list with optional status filter
async function getInvitations(
  status?: InvitationStatus,
  limit?: number,
  offset?: number
): Promise<ActionResult<{ invitations: Invitation[]; total: number }>>

// Get single invitation by ID
async function getInvitationById(
  id: string
): Promise<ActionResult<Invitation>>

// Resend notification for an invitation
async function resendNotification(
  invitationId: string,
  flow: 'FLOW1' | 'FLOW2'
): Promise<ActionResult<{ sent: boolean }>>
```

### External GraphQL Queries (Main API)

```graphql
# User search
query accountDetailsByUserPhone($phone: Phone!) {
  accountDetailsByUserPhone(phone: $phone) {
    id
    username
    level
  }
}

# L2 verification status (within account details)
query accountDetailsByAccountId($accountId: ID!) {
  accountDetailsByAccountId(accountId: $accountId) {
    id
    level  # LEVEL_TWO indicates L2 approved
  }
}

# Send notification
mutation marketingNotificationTrigger($input: MarketingNotificationTriggerInput!) {
  marketingNotificationTrigger(input: $input) {
    success
    errors { message }
  }
}
```

### External gRPC Calls (blink-card)

**Proto Contract (NEW - needs to be added to blink-card):**

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

**Why gRPC over GraphQL:**
- blink-card already has gRPC services exposed (trivial to add new RPC)
- Admin GraphQL is monolithic - would need federation infrastructure (supergraph config, Apollo Router, deployment pipeline)
- gRPC is direct service-to-service call (1 hop vs 2 hops)
- Batch API pattern fits background job polling better

### Notification Template Structure

```yaml
# invitation-template.yaml
flow1:
  localizedContents:
    - language: en
      title: "You're invited to join our exclusive program"
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
      title: "Verificación aprobada!"
      body: "Completa tu inscripción"
  icon: CHECK
  deepLinkScreen: PROGRAM_SIGNUP
  shouldSendPush: true
  shouldAddToHistory: true
  shouldAddToBulletin: false
```

---

## Background Job Design

### Polling Architecture

```typescript
// app/jobs/invitation-status-poller.ts
import cron from 'node-cron';

// Runs every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  const invitations = await prisma.invitation.findMany({
    where: {
      status: { in: ['INVITED', 'KYC_IN_PROGRESS', 'KYC_APPROVED'] }
    }
  });

  for (const inv of invitations) {
    await processInvitation(inv);
  }
});
```

### Single-Writer Pattern

| Writer | Columns | Access |
|--------|---------|--------|
| Background Job | `l2VerificationStatus`, `cardKycStatus`, `lastStatusCheckAt`, `status` (transitions), `flow2TriggeredAt` | Exclusive |
| Server Actions | `invitedBy`, `flow1TriggeredAt`, `lastTriggerError` (manual resend), `invitationCode` | Exclusive |
| UI | None | Read-only |

### Idempotency Guard

Flow 2 is triggered **only once** via the `flow2TriggeredAt` column:

```typescript
if (inv.status === 'KYC_APPROVED' && !inv.flow2TriggeredAt) {
  await triggerFlow2Notification(inv);
  await prisma.invitation.update({
    where: { id: inv.id },
    data: {
      status: 'PROGRAM_SIGNUP_TRIGGERED',
      flow2TriggeredAt: new Date()
    }
  });
}
```

---

## Security Considerations

### Invitation Code Authentication

**Purpose:** Prevent unauthorized access to `cardConsumerApplicationCreate` mutation (public GraphQL).

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

| Property | Implementation | Benefit |
|----------|----------------|---------|
| Account binding | `account_id` in encrypted payload | Prevents token transfer between users |
| Expiration | `timestamp` field | Server rejects stale tokens |
| Replay protection | `nonce` value | Each token is unique |
| Confidentiality | AES-256-GCM encryption | Payload cannot be inspected |

**Validation Flow:**

```mermaid
sequenceDiagram
    participant Admin as Admin Panel
    participant Mobile as Mobile App
    participant Card as blink-card

    Admin->>Admin: Encrypt payload (AES-256-GCM)
    Admin->>Admin: Store token in invitation record
    Admin->>Mobile: Deep link with ?code=token
    Mobile->>Card: cardConsumerApplicationCreate(code)
    Card->>Card: Decrypt with shared 32-byte key
    Card->>Card: Validate account_id matches caller
    Card->>Card: Check timestamp not expired
    alt Valid
        Card-->>Mobile: Proceed with KYC
    else Invalid (wrong user, expired, or tampered)
        Card-->>Mobile: Reject with error
    end
```

**Implementation (`lib/invitation-code.ts`):**

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const NONCE_LENGTH = 12;

interface InvitationPayload {
  source_key: string;    // Card program identifier
  account_id: string;    // Binds to specific account
  timestamp: number;     // Unix timestamp (expiration)
  nonce: number;         // Random value for replay protection
}

export function generateInvitationCode(accountId: string): string {
  const secret = Buffer.from(process.env.INVITATION_TOKEN_SECRET!, 'hex'); // 32-byte key
  const iv = crypto.randomBytes(12);  // 12-byte IV for AES-GCM

  const payload: InvitationPayload = {
    source_key: process.env.CARD_PROGRAM_SOURCE_KEY!,
    account_id: accountId,
    timestamp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
    nonce: crypto.randomBytes(8).readBigUInt64BE()  // Random u64 for replay protection
  };

  const cipher = crypto.createCipheriv(ALGORITHM, secret, iv);
  const plaintext = Buffer.from(JSON.stringify(payload));

  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag()  // GCM auth tag appended to ciphertext
  ]);

  // Final token: iv || ciphertext (includes auth tag)
  const token = Buffer.concat([iv, ciphertext]);
  return token.toString('base64url');
}
```

### Access Control

- Inherits existing admin-panel authentication
- All actions logged with admin identity (`invitedBy`)
- No multi-admin role permissions in MVP (single CEO use case)

---

## External Dependencies

### Blocking Dependencies

| Dependency | Owner | Status | Impact |
|------------|-------|--------|--------|
| `KYC_START` DeepLinkScreen | Mobile team | **Required** | Flow 1 deep link |
| `PROGRAM_SIGNUP` DeepLinkScreen | Mobile team | **Required** | Flow 2 deep link |
| `GetApplicationStatuses` gRPC RPC (batch by account_id) | blink-card team | **Required** | Background polling |
| `INVITATION_TOKEN_SECRET` (32-byte AES key) | DevOps + blink-card | **Required** | Token encryption/decryption |
| `CARD_PROGRAM_SOURCE_KEY` (String) | DevOps + blink-card | **Required** | Token payload validation |

### Existing Integrations

| Integration | Service | Status |
|-------------|---------|--------|
| User search by phone/email | Main API | Available |
| L2 verification status | Main API | Available |
| `MarketingNotificationTrigger` | Main API | Available |

---

## Implementation Patterns

### File Organization

```
invitation-dashboard/                # Private repository
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── app/
│   ├── page.tsx                     # Redirect to /invitations
│   ├── layout.tsx                   # Root layout
│   ├── middleware.ts                # NextAuth middleware
│   ├── env.ts                       # Environment validation
│   ├── graphql-rsc.tsx              # Apollo client
│   ├── api/auth/[...nextauth]/      # Auth (replicated from admin-panel)
│   │   ├── route.ts
│   │   └── options.ts
│   ├── invitations/
│   │   ├── page.tsx                 # List view
│   │   ├── [id]/page.tsx            # Detail view
│   │   ├── new/page.tsx             # Create form
│   │   ├── actions.ts               # Server actions
│   │   └── types.ts
│   │
│   └── jobs/
│       ├── cron.ts                  # Scheduler init
│       └── invitation-status-poller.ts
│
├── components/
│   ├── invitations/
│   │   ├── invitation-list.tsx
│   │   ├── invitation-detail.tsx
│   │   ├── invitation-form.tsx
│   │   ├── status-badge.tsx
│   │   ├── template-uploader.tsx
│   │   └── index.ts
│   └── side-bar.tsx                 # Simplified navigation
│
├── lib/
│   ├── prisma.ts                    # Client singleton
│   ├── invitation-service.ts        # Business logic
│   ├── template-parser.ts           # YAML validation
│   ├── invitation-code.ts           # AES-256-GCM token generation
│   └── blink-card-client.ts         # gRPC client for card KYC status
│
├── protos/
│   └── invitation_service.proto     # Vendored from blink-card
│
├── graphql.gql                      # Invitation-specific queries
├── codegen.yml                      # GraphQL codegen (vendored schema)
├── docker-compose.yml               # Local dev environment
└── .env.example                     # Environment template
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| DB tables | snake_case plural | `invitations` |
| DB columns | snake_case | `user_id`, `account_id`, `last_status_check_at` |
| Prisma models | PascalCase singular | `Invitation` |
| Prisma fields | camelCase | `userId`, `lastStatusCheckAt` |
| Status values | SCREAMING_SNAKE_CASE | `KYC_IN_PROGRESS` |
| Server actions | verb + noun | `createInvitations`, `getInvitationById` |

### Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|------------|
| `SumsubStatus`, `RainKycStatus` | `l2VerificationStatus`, `cardKycStatus` |
| Throw errors from server actions | Return `{ success: false, error }` |
| Store templates in database | Pass YAML content at runtime |
| Fetch KYC on every page load | Read from cached columns |
| UI writing to KYC status columns | Background job is single writer |
| Single-language notifications | Multi-language `localizedContents` |
| Assume notification delivered | Fire-and-forget, show "triggered" not "sent" |

---

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Background job misses KYC approval window | Medium | High | Accept 15-min delay; monitor and alert if job hasn't run in >20 min |
| GraphQL API timeout on page load | Medium | Medium | Cache-on-poll eliminates page load dependency; UI reads from local DB |
| Duplicate Flow 2 notifications | Low | High | `flow2TriggeredAt` idempotency guard |
| State inconsistency between polling cycles | Medium | Medium | Single-writer pattern enforced |
| Mobile team coordination delays | Medium | High | Track DeepLinkScreen as explicit blocker |
| Multi-replica duplicate job execution | Low (MVP) | Medium | Use K8s CronJob if scaling needed post-MVP |

### Graceful Degradation

| Service Unavailable | UI Display |
|---------------------|------------|
| Main API timeout (L2 status) | "L2 verification status pending" |
| blink-card gRPC timeout | "Card KYC status pending" |
| Both unavailable | Invitation visible, status shows "Checking..." |
| Notification service down | "Notification pending", manual resend when restored |
