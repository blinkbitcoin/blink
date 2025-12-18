---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'Program Invitation System - admin panel extension for inviting users to a two-phase onboarding'
session_goals: 'Design invitation workflow, decide Flow 2 trigger mechanism, keep naming generic, avoid over-engineering'
selected_approach: 'AI-Recommended Techniques'
techniques_used: ['Question Storming', 'Six Thinking Hats', 'First Principles Thinking']
ideas_generated: ['invitation-table-design', 'status-workflow', 'auto-trigger-mechanism', 'yaml-template', 'batch-invite', 'polling-over-webhooks']
context_file: ''
workflow_completed: true
---

# Brainstorming Session Results

**Facilitator:** hn
**Date:** 2025-12-17

## Session Overview

**Topic:** Program Invitation System - admin panel extension for inviting users to a two-phase onboarding (KYC flow → Program sign-up flow)

**Goals:**
1. Design the invitation workflow (admin → push notification → user onboarding)
2. Decide trigger mechanism for Flow 2 (manual vs automatic after KYC approval)
3. Keep UI/code naming generic (e.g., "Program Invitation" not "Privates/Equity")
4. Avoid over-engineering - lean, focused scope

### Technical Context

- **Notification service**: Exists in this repo (separate backend service)
- **blink-card** (../blink-card): Handles Rain KYC + encrypted token validation via `cardConsumerApplicationStart` mutation
- **blink-kyc** (../blink-kyc): Handles Sumsub KYC (must complete before Rain KYC)
- **Admin dashboard**: Exists, needs extension for invitation management
- **Reference branches**: `feat--notification-message-templates`, `feat--visa-card-invitations` (caution: contains over-engineered scope)

### Session Setup

- **Approach Selected:** AI-Recommended Techniques
- **Participant:** hn (facilitator + ideator)

## Technique Selection

**Approach:** AI-Recommended Techniques
**Analysis Context:** Program Invitation System with focus on lean design and practical decision-making

**Recommended Techniques:**

1. **Question Storming (Deep):** Surface essential questions before designing to prevent over-engineering and ensure we solve only real problems
2. **Six Thinking Hats (Structured):** Structured analysis of the manual vs automatic trigger decision from multiple perspectives
3. **First Principles Thinking (Creative):** Strip assumptions and rebuild from fundamentals to achieve minimum viable design

**AI Rationale:** Given the explicit goal to avoid over-engineering and the presence of reference branches with scope creep, this sequence prioritizes clarity (right questions), structured decision-making (trigger mechanism), and lean design (only what's necessary).

## Technique Execution Results

### Question Storming (Deep)

**Key Questions Surfaced & Answered:**

| Question | Answer |
|----------|--------|
| What are the invitation states? | INVITED → CLICKED → KYC_IN_PROGRESS → KYC_APPROVED → PROGRAM_SIGNUP_SENT → ENROLLED (+ rejection states) |
| Where is invitation data stored? | Admin dashboard owns its own invitation table |
| Batch invite support? | Yes, via UI selection (checkboxes), partial failures OK |
| What is "resend"? | Retry failed notification delivery, not a reminder feature |
| KYC rejection handling? | Rain = final rejection, Sumsub = can manually override |
| Who triggers notifications? | Admin dashboard (centralizes deeplink/screen logic) |

**Architectural Decision:**
- Centralize notification/deeplink logic in admin dashboard
- blink-card receives webhook → updates status → admin dashboard queries and triggers notifications
- Rationale: Deeplinks contain screen info; single service to update when screens change

---

### Six Thinking Hats (Structured)

**Decision: Flow 2 Trigger Mechanism**

| Hat | Analysis |
|-----|----------|
| White (Facts) | Admin dashboard will poll statuses anyway; limited invitees; CEO knows them personally |
| Red (Gut) | Automatic feels right; users expect speed after completing KYC |
| Yellow (Benefits) | Faster UX, less manual work, user stays engaged |
| Black (Risks) | Only real risk: notification failure (solved by manual fallback) |
| Green (Creative) | Show failed status in dashboard, manual resend button |
| Blue (Process) | Clear decision with documented rationale |

**Decision: Automatic trigger with manual fallback**
- When Rain KYC approved → auto-send program signup notification
- Dashboard shows failures → admin can manually resend
- Rationale: Users expect speed, only real risk is notification failure (already solved)

---

### First Principles Thinking (Creative)

**Core Constraints Identified:**
- Admin dashboard is separate service, no direct access to main user DB
- Must work with existing services (notification, blink-card, blink-kyc)
- Avoid webhook complexity (reliability edge cases)

**Minimum Viable Design:**

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN DASHBOARD                          │
├─────────────────────────────────────────────────────────────┤
│  Invitation Table:                                          │
│  - user_id, status, invited_at, token_expires               │
│                                                             │
│  Background Job (every ~1hr):                               │
│  - Query Sumsub + Rain KYC statuses                         │
│  - If KYC_APPROVED && Flow 2 not sent → send notification   │
│  - Update local status                                      │
│                                                             │
│  UI:                                                        │
│  - List invitations with combined status                    │
│  - Batch select users → send invites                        │
│  - Manual resend button for failures                        │
│  - Template upload (YAML file)                              │
└─────────────────────────────────────────────────────────────┘
          │                           │
          │ notification service      │ admin graphql queries
          ▼                           ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────┐
│   Notification   │    │    Main API      │    │  blink-card  │
│    Service       │    │  (Sumsub status) │    │ (Rain status)│
└──────────────────┘    └──────────────────┘    └──────────────┘
```

**Template Handling:**
- CEO uploads YAML via admin UI when sending invites
- Stored as file/blob in admin dashboard (no DB tables)
- Template contains: title, body, deeplink screen for each flow

```yaml
# Example template structure
flow1:
  title: "You're invited to join our program"
  body: "Hi {{user_name}}, you've been selected..."
  deeplink_screen: "kyc_start"

flow2:
  title: "Complete your enrollment"
  body: "Your verification is approved! Complete signup..."
  deeplink_screen: "program_signup"
```

**What We Avoided (Over-engineering):**
- No webhooks between services
- No real-time subscriptions
- No complex state machine
- No revoke/approve functions
- No separate template tables in notification service

**What We Kept (Essential):**
- Simple polling for status
- Background job for auto-trigger (~1hr interval)
- Manual fallback for failures
- Batch invite for convenience
- YAML template upload

---

## Idea Organization and Prioritization

### Thematic Organization

**Theme 1: Data & Storage**
- Invitation table lives in admin dashboard (not main repo, not notification service)
- Fields: `user_id`, `status`, `invited_at`, `token_expires`
- Template stored as uploaded YAML file/blob (no DB tables needed)

**Theme 2: Status & Workflow**
- States: `INVITED` → `KYC_IN_PROGRESS` → `KYC_APPROVED` → `PROGRAM_SIGNUP_SENT` → `ENROLLED`
- Rejection states: Sumsub (recoverable via manual override), Rain (final)
- Status fetched via polling/querying, not webhooks (simpler, more reliable)

**Theme 3: Trigger Mechanism**
- Flow 2 auto-triggered via background job (~1hr interval)
- Manual fallback via "resend" button for notification failures
- Deeplink/notification logic centralized in admin dashboard

**Theme 4: UI Features**
- Batch invite via checkbox selection (not file upload)
- Filter by status (MVP scope)
- Resend button for failed notifications
- Template upload for push notification content

### Implementation Workstreams

| Priority | Component | Service | Complexity | Notes |
|----------|-----------|---------|------------|-------|
| 1 | Invitation table + CRUD | Admin Dashboard | Low | Core data model |
| 2 | Rain KYC status admin query | blink-card | Low | New GraphQL query |
| 3 | Invitation list UI | Admin Dashboard | Medium | With status filter |
| 4 | Batch invite mutation | Admin Dashboard | Medium | Checkbox selection |
| 5 | Template upload UI | Admin Dashboard | Low | YAML file storage |
| 6 | Background job (auto Flow 2) | Admin Dashboard | Medium | ~1hr polling interval |
| 7 | Notification service integration | Admin Dashboard | Low | Send push w/ deeplink |

---

## Session Summary

### Key Decisions Made

1. **Storage:** Admin dashboard owns invitation records (separate from main user DB)
2. **Trigger:** Automatic Flow 2 with manual fallback for failures
3. **Integration:** Polling over webhooks (avoids reliability edge cases)
4. **Templates:** YAML file upload, not database tables
5. **Scope:** MVP with status filter only, batch invite included

### What We Avoided (Over-engineering from reference branches)

- Webhooks between services
- Real-time subscriptions
- Complex state machines
- Revoke/approve functions (not our responsibility)
- Separate template tables in notification service

### Session Value

This session transformed a complex feature request with over-engineered reference implementations into a lean, focused design that:
- Minimizes cross-service dependencies
- Uses simple, reliable patterns (polling vs webhooks)
- Keeps template management lightweight
- Provides automatic convenience with manual fallback safety
