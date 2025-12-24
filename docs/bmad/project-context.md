---
project_name: 'Blink - Program Invitation System'
user_name: 'hn'
date: '2025-12-24'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality', 'workflow_rules', 'critical_rules']
---

# Project Context for AI Agents

_Critical rules and patterns for implementing the Program Invitation System in a standalone private repository._

---

## Repository Strategy

**Decision:** Separate private repository (`invitation-dashboard`)

**Rationale:**
- blink is public; blink-card is private
- e2e testing requires blink-card Docker image
- CEO-only tool with minimal scope
- Full e2e testing capability in private repo

**Key Differences from admin-panel:**
- Standalone repo (not in blink monorepo)
- Vendored dependencies (GraphQL schema, proto files)
- Own Google OAuth credentials
- Own Terraform deployment module
- Oathkeeper route: `/invitation-admin/*` (not `/admin/*`)

---

## Technology Stack & Versions

**Core (Replicated from admin-panel):**
- Next.js 14 (App Router)
- TypeScript (strict mode)
- React 18
- Tailwind CSS
- Apollo Client (GraphQL)
- NextAuth.js 4.x (JWT sessions)

**New (Adding for this feature):**
- Prisma ORM
- PostgreSQL 15
- node-cron (background jobs)
- js-yaml (template parsing)
- @grpc/grpc-js + @grpc/proto-loader (blink-card communication)

---

## Critical Implementation Rules

### Database & Schema Rules

- **Vendor-agnostic naming**: Use `l2_verification_status` not `sumsub_status`
- **Snake_case for columns**: `user_id`, `account_id`, `last_status_check_at`
- **CamelCase for Prisma fields**: `userId`, `accountId`, `lastStatusCheckAt`
- **Index naming**: `idx_{table}_{column}` pattern
- **account_id**: Fetched via Admin GraphQL at invitation creation, used for blink-card queries

### Server Actions

- **Return ActionResult, never throw**:
  ```typescript
  type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string }
  ```
- **Location**: `app/invitations/actions.ts`
- **Naming**: `verb` + `noun` (e.g., `createInvitations`, `getInvitationById`)

### Background Jobs

- **Single-writer pattern**: Only `invitation-status-poller.ts` writes to KYC status columns
- **UI reads from cache**: Never fetch KYC status on page load
- **Location**: `app/jobs/invitation-status-poller.ts`
- **Idempotency**: Check `flow2TriggeredAt` before sending Flow 2

### Notification Templates

- **Multi-language required**: Always include `localizedContents` array
- **Minimum**: English (`en`) as default/fallback
- **Structure**:
  ```yaml
  flow1:
    localizedContents:
      - language: en
        title: "..."
        body: "..."
    deepLinkScreen: KYC_START
    shouldSendPush: true
  ```

### Status State Machine

Valid states: `INVITED` → `KYC_IN_PROGRESS` → `KYC_APPROVED` → `PROGRAM_SIGNUP_TRIGGERED` → `ENROLLED`

Branch: `KYC_IN_PROGRESS` → `KYC_REJECTED` (final for card program)

**Key insight**: `KYC_IN_PROGRESS` means L2 approved, waiting on card KYC (not "user started KYC")

### Granular Rain KYC Status

The `card_kyc_status` column stores granular Rain status for UI sub-text display:

| Rain Status | Maps to | UI Sub-text |
|-------------|---------|-------------|
| NotStarted, Pending, NeedsInfo, NeedsVerification, ManualReview | `KYC_IN_PROGRESS` | "Card KYC: {status}" |
| Approved | `KYC_APPROVED` | "Card KYC: Approved" |
| Denied, Locked, Canceled | `KYC_REJECTED` | "Card KYC: {status}" |

---

## Anti-Patterns (Never Do)

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

## File Organization

```
invitation-dashboard/                # Private repository
├── prisma/schema.prisma             # Invitation model
├── app/
│   ├── page.tsx                     # Redirect to /invitations
│   ├── layout.tsx                   # Root layout
│   ├── middleware.ts                # NextAuth middleware
│   ├── env.ts                       # Environment validation
│   ├── graphql-rsc.tsx              # Apollo client
│   ├── api/auth/[...nextauth]/      # Auth (copied from admin-panel)
│   ├── invitations/
│   │   ├── page.tsx                 # List view
│   │   ├── [id]/page.tsx            # Detail view
│   │   ├── new/page.tsx             # Create form
│   │   ├── actions.ts               # Server actions
│   │   └── types.ts                 # TypeScript types
│   └── jobs/
│       └── invitation-status-poller.ts
├── components/
│   ├── invitations/
│   │   ├── invitation-list.tsx
│   │   ├── status-badge.tsx
│   │   └── template-uploader.tsx
│   └── side-bar.tsx                 # Simplified navigation
├── lib/
│   ├── prisma.ts                    # Prisma client singleton
│   ├── template-parser.ts           # YAML validation
│   ├── invitation-code.ts           # AES-256-GCM token generation
│   └── blink-card-client.ts         # gRPC client for card KYC status
├── protos/
│   └── invitation_service.proto     # Vendored from blink-card
├── graphql.gql                      # Invitation-specific queries
├── codegen.yml                      # GraphQL codegen (vendored schema)
└── docker-compose.yml               # Local dev environment
```

---

## Invitation Code Security

**Purpose:** Restrict access to `cardConsumerApplicationCreate` mutation (public GraphQL)

**Token Structure (AES-256-GCM):**
```
Encrypted Payload = AES-256-GCM({
  source_key: String,    // From CARD_PROGRAM_SOURCE_KEY env var
  account_id: String,    // Binds token to specific account (prevents transfer)
  timestamp: i64,        // Unix timestamp for expiration checking
  nonce: u64             // Random value for replay protection
})

Final Token = Base64(iv || ciphertext)
                     ↑
                     12-byte IV (separate from payload nonce)
```

**Environment Variables:**
- `INVITATION_TOKEN_SECRET`: 32-byte AES key (shared with blink-card)
- `CARD_PROGRAM_SOURCE_KEY`: String identifying the card program (shared with blink-card)

**Security Properties:**
- Account binding prevents token transfer between users
- Timestamp enables expiration checking
- Nonce ensures uniqueness (replay protection)

**Flow:**
1. Invitation-dashboard encrypts payload using `INVITATION_TOKEN_SECRET`
2. Code included in deep link: `blink://kyc?code=<token>`
3. Mobile passes code to blink-card mutation
4. blink-card decrypts and validates: source_key + account_id match + expiration check

**Implementation:** `lib/invitation-code.ts`

**Schema:** Add `invitationCode` field to Invitation model

---

## Oathkeeper Integration

**Route pattern:** `/invitation-admin/*` → validates with invitation-dashboard session

```yaml
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

**Key insight:** Both `/admin/*` and `/invitation-admin/*` forward to the same backend (`graphql-admin:4001`), but use different session validation endpoints.

---

## External Dependencies (Blockers)

| Dependency | Owner | Status |
|------------|-------|--------|
| `KYC_START` DeepLinkScreen | Mobile team | Required |
| `PROGRAM_SIGNUP` DeepLinkScreen | Mobile team | Required |
| `GetApplicationStatuses` gRPC RPC (batch by account_id) | blink-card team | Required |
| `INVITATION_TOKEN_SECRET` (32-byte AES key) | DevOps + blink-card | Required |
| `CARD_PROGRAM_SOURCE_KEY` (String) | DevOps + blink-card | Required |

---

## Graceful Degradation

When external services unavailable, show explicit states:

| Service Down | UI Display |
|--------------|------------|
| Sumsub API | "L2 verification status pending" |
| Rain API | "Card KYC status pending" |
| Both | Invitation visible, status "Checking..." |

---

## Reference Documents

- Architecture: `docs/bmad/architecture-decision.md`
- PRD: `docs/bmad/prd.md`
- Brownfield docs: `docs/bmad/index.md`
