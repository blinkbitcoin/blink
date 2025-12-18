---
stepsCompleted: [1, 2, 3, 4, 7, 8, 9, 10]
inputDocuments:
  - 'docs/bmad/index.md'
  - 'docs/bmad/architecture.md'
  - 'docs/bmad/code-patterns.md'
  - 'docs/bmad/integration-architecture.md'
  - 'docs/bmad/project-overview.md'
  - 'docs/bmad/source-tree-analysis.md'
  - 'docs/bmad/analysis/brainstorming-session-2025-12-17.md'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 1
  projectDocs: 6
workflowType: 'prd'
lastStep: 11
project_name: 'Blink'
user_name: 'hn'
date: '2025-12-18'
---

# Product Requirements Document - Blink

**Author:** hn
**Date:** 2025-12-18

## Executive Summary

The Program Invitation System enables Blink's CEO to personally invite select users to an exclusive two-phase onboarding program, with full visibility into each invitee's journey from invitation to enrollment. When the CEO identifies a VIP to invite, they open the admin panel, select the user, send the invitation with one click, and watch the status update as the user progresses through KYC verification and program signup.

This system supports invitation to any gated program requiring KYC verification, with the initial use case being the exclusive card program.

This feature addresses the immediate need to manage high-touch VIP relationships without dropping the ball. The CEO personally knows these invitees - this isn't bulk marketing, it's relationship management with status transparency.

### What Makes This Special

- **One-click operations**: Select users, send invites, retry failures - no training manual required
- **Real-time status visibility**: See exactly where each invitee is in their journey (invited → KYC in progress → approved → enrolled)
- **Automatic progression**: When KYC completes, the system automatically sends the program signup notification - no manual intervention needed
- **Reliable fallbacks**: If notification delivery fails, a single "Resend" button retries immediately

### Success Criteria

- Invitation to enrollment completion rate tracked per cohort
- Time from invitation sent to enrollment completed (target: minimize drop-off)
- Zero lost invitations - every invite has clear status visibility
- Admin can process a batch of 10 invitations in under 2 minutes

## Project Classification

**Technical Type:** Admin panel extension + background automation
**Domain:** Fintech (KYC/AML compliance flows)
**Complexity:** High (regulatory domain, coordination across blink, blink-card, blink-kyc)
**Project Context:** Brownfield - extending existing Blink admin panel and notification infrastructure
**Primary User:** CEO (single primary admin, potential for additional admins later)

### Technical Approach

The implementation maintains clear service boundaries:
- **Admin-panel** owns invitation state (new database table: invitations) and all UI
- **Notification service** handles delivery via existing `MarketingNotificationTrigger`
- **KYC status** queried from main API (Sumsub) and blink-card (Rain) - with graceful degradation if either service is temporarily unavailable
- **Background job** polls every 15 minutes (configurable) - balancing CEO's need for responsiveness with system load

### Operational Constraints

- Batch invite: up to 50 users per operation
- No automatic retry: manual "Resend" button for failed deliveries only
- Invitation revocation: **out of scope for MVP** (future enhancement to allow cancellation before user begins KYC)

## Success Criteria

### User Success (CEO/Admin)

- **Immediate clarity**: CEO opens panel and instantly sees current status of all invitees without waiting
- **Confidence in delivery**: "I sent the invite and can see it was delivered" - no guessing
- **Hands-off progression**: Users move through KYC without CEO intervention; CEO only acts on failures
- **Quick batch operations**: Select multiple users, invite all, done in under 2 minutes

### Business Success

- **Conversion visibility**: Track invite → enrolled funnel to identify drop-off points
- **Target enrollment rate**: >80% of invited users complete enrollment (VIPs who were personally selected)
- **Time to enrollment**: Majority of users complete within 7 days of invitation
- **Zero lost VIPs**: Every invited user has a clear status; no one falls through the cracks

### Technical Success

- **Real-time status on load**: When CEO opens the invitation panel, status reflects current state (fetched on demand)
- **Reliable auto-progression**: Background job (15 min interval) successfully triggers Flow 2 within one polling cycle of KYC approval
- **Notification delivery**: Inherit existing notification service reliability (no new SLA)
- **Graceful degradation**: If KYC status services are temporarily unavailable, UI shows "status pending" rather than failing

### Measurable Outcomes

| Metric | Target | Measurement |
|--------|--------|-------------|
| Batch invite speed | <2 min for 10 users | Manual testing |
| Status accuracy | Real-time on panel load | Fetch on demand |
| Auto-trigger latency | <15 min after KYC approval | Background job interval |
| Enrollment conversion | >80% | invite → enrolled tracking |
| Time to enrollment | <7 days median | Timestamp tracking |

## Product Scope

### MVP - Minimum Viable Product

**Must have for launch:**
- Invitation list UI with status filtering (all, pending, in-progress, enrolled)
- Batch invite via checkbox selection (up to 50 users)
- Manual "Resend" button for failed notifications
- Real-time status fetch on panel load
- Background job for automatic Flow 2 trigger (15 min polling)
- YAML template upload for notification content
- New DeepLinkScreen values for KYC and program signup flows

**Explicitly out of scope for MVP:**
- Invitation revocation/cancellation
- Automatic notification retry
- Analytics dashboard beyond basic status counts
- Multi-admin role permissions

### Growth Features (Post-MVP)

- Invitation revocation (cancel before user starts KYC)
- Status change notifications to admin (alert when user completes KYC)
- Export invitation data (CSV for reporting)
- Configurable polling interval via admin UI

### Vision (Future)

- Support multiple program types with different KYC requirements
- Self-service invitation request flow (user requests invite, admin approves)
- Integration with CRM for invitation tracking
- Automated re-engagement for stalled invitations

## User Journeys

### Journey 1: CEO Michael - Inviting the First Cohort

Michael, the CEO, has just finalized a list of 12 early supporters who've been asking about the exclusive card program. He knows each of them personally - they're long-time Bitcoin believers who trusted Blink from the early days. He wants to reward their loyalty with priority access.

On Monday morning, Michael opens the admin panel and navigates to the new Invitations section. He sees an empty list with a prominent "Invite Users" button. He searches for the first user by phone number, finds their account, and checks the box. He repeats this for all 12 users - the interface is responsive and he completes the selection in under 3 minutes.

Before sending, Michael uploads a YAML template with a personalized message: "You've been selected for early access to our exclusive card program. Tap to begin your verification." He reviews the preview, takes a breath, and clicks "Send Invitations."

The list immediately shows all 12 users with status "INVITED" and timestamps. Michael screenshots this for his records and closes the laptop, confident that the system will handle the rest.

Over the next few days, Michael checks the panel each morning. He watches statuses change: Maria moved to "KYC_IN_PROGRESS", then "KYC_APPROVED", then "PROGRAM_SIGNUP_SENT", and finally "ENROLLED". By Friday, 9 of 12 users have enrolled. The remaining 3 are still at various stages - he can see exactly where each one is.

**This journey reveals requirements for:**
- User search and selection UI
- Batch invitation with checkbox selection
- YAML template upload and preview
- Real-time status display with timestamps
- Status filtering (to quickly see who's stuck)

---

### Journey 2: CEO Michael - Handling a Stuck Invitation

Two weeks after the initial invitations, Michael notices that Roberto is still showing "INVITED" - he never started KYC. Michael knows Roberto personally and gives him a call.

"Hey Roberto, did you get my invitation to the card program?"
"What invitation? I didn't see anything."

Michael opens the admin panel, finds Roberto's invitation, and clicks "Resend." Roberto's phone buzzes immediately. "Got it! Let me do this now." Michael watches the status change to "KYC_IN_PROGRESS" while still on the call.

A few days later, Michael sees another issue: Sofia's status shows "KYC_REJECTED" with a note indicating her Sumsub verification failed. He calls Sofia, who explains she accidentally submitted a blurry ID photo. Michael can see she needs to retry, but there's nothing for him to do in the admin panel - she just needs to resubmit through the app. He guides her through it over the phone, and watches her status update to "KYC_IN_PROGRESS" again.

**This journey reveals requirements for:**
- Individual "Resend" button per invitation
- Clear status visibility including rejection reasons
- Understanding that some issues are resolved outside the admin panel (user retry in mobile app)
- Status refresh on panel load (real-time visibility)

---

### Journey 3: Sofia the VIP - From Invitation to Enrollment

Sofia has been using Blink for over a year, sending Bitcoin to her family back home. One afternoon, her phone buzzes with a push notification: "You've been selected for early access to our exclusive card program. Tap to begin your verification."

Sofia taps the notification and lands on a KYC verification screen she hasn't seen before. The app explains this is for the card program and requires additional identity verification. She uploads her government ID and takes a selfie. The screen shows "Verification in progress - we'll notify you when complete."

Three days later, Sofia gets another push notification: "Your verification is approved! Complete your card program enrollment." She taps through, reviews the program terms, and confirms her enrollment. A success screen shows her card is on the way.

Sofia screenshots her enrollment confirmation and sends it to her sister: "Finally getting a Bitcoin card!"

**This journey reveals requirements for:**
- Push notification with deep link to KYC start screen (new DeepLinkScreen value needed)
- Mobile app KYC flow (exists in blink-kyc, needs deep link entry point)
- Automatic Flow 2 notification after KYC approval (background job)
- Push notification with deep link to program signup screen (new DeepLinkScreen value needed)
- Mobile app program enrollment flow (exists in blink-card)

---

### Journey 4: VIP Roberto - When Things Go Wrong

Roberto receives the invitation notification but is busy and swipes it away, planning to deal with it later. He forgets about it.

A week later, Michael calls him asking if he got the invitation. Roberto checks his notification history but can't find it. Michael resends, and this time Roberto taps immediately.

He starts the KYC process but gets interrupted by a work call and closes the app. When he returns the next day, he's not sure where to continue. He calls Michael: "I started the verification but now I can't find where to finish it."

Michael looks at the admin panel and sees Roberto is "KYC_IN_PROGRESS." He tells Roberto: "Just open the app and look for the card program section - it should show your verification status and let you continue." Roberto finds it and completes his verification.

**This journey reveals requirements for:**
- Mobile app needs a way to resume/continue KYC (not admin panel scope, but important integration point)
- Admin panel status gives CEO enough info to guide users over the phone
- Clear status definitions help CEO troubleshoot without system access

---

### Journey Requirements Summary

| Capability Area | Requirements Revealed |
|-----------------|----------------------|
| **Invitation Management** | User search, batch selection, send invitations, resend individual |
| **Template System** | YAML upload, preview before send, deep link configuration |
| **Status Dashboard** | Real-time status display, filtering, timestamps, rejection reasons |
| **Notification Integration** | Trigger via MarketingNotificationTrigger, deep links to mobile screens |
| **Mobile App Integration** | New DeepLinkScreen values for KYC start and program signup |
| **Background Automation** | 15 min polling job, automatic Flow 2 trigger on KYC approval |

## Admin Panel Extension Requirements

### Integration Architecture

The Program Invitation System extends the existing admin-panel with these integration points:

#### User Search & Selection
- **Existing capability**: Admin panel can query users by phone number or email via admin GraphQL
- **New requirement**: Add filtering to exclude users already in the program

#### KYC Status Queries

| Service | Status Query | Availability |
|---------|--------------|--------------|
| Sumsub (L2 verification) | Admin GraphQL query | ✅ Exists |
| Rain (blink-card) | Admin GraphQL query | ⚠️ Needs to be added |

**Dependency**: Rain status query must be added to blink-card's admin GraphQL before invitation status can show complete KYC progress.

#### Notification Sending
- **Existing capability**: Admin panel has direct gRPC access to notification service
- **Mechanism**: Use existing `MarketingNotificationTrigger` mutation
- **New requirement**: Configure deep links for KYC start and program signup screens

#### Background Job Infrastructure
- **Current state**: Admin panel has NO background job infrastructure
- **New requirement**: Add job scheduler for automatic Flow 2 triggering

**Recommendation for MVP**: Embedded scheduler (e.g., `node-cron`)
- Simple, self-contained, no external dependencies
- Runs every 15 minutes within the Next.js process

```typescript
// Example implementation
import cron from 'node-cron';

cron.schedule('*/15 * * * *', async () => {
  await triggerFlow2ForApprovedKYC();
});
```

⚠️ **Known Limitation**: If admin-panel scales to multiple replicas, each replica will run its own scheduler, causing duplicate job executions. If scaling is needed later, migrate to K8s CronJob + API endpoint pattern.

### Data Model

**New table in admin-panel database: `invitations`**

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | String | Blink user ID |
| status | Enum | INVITED, KYC_IN_PROGRESS, KYC_APPROVED, PROGRAM_SIGNUP_SENT, ENROLLED, KYC_REJECTED |
| invited_at | Timestamp | When invitation was sent |
| invited_by | String | Admin who sent invitation |
| last_notification_at | Timestamp | Last notification attempt |
| notification_failures | Integer | Count of failed delivery attempts |
| enrolled_at | Timestamp | When user completed enrollment (nullable) |
| metadata | JSONB | Rejection reasons, notes, etc. |

### New GraphQL/API Requirements

**Admin Panel → Main API:**
- Query: User search by phone/email (exists)
- Query: Sumsub L2 verification status (exists)

**Admin Panel → blink-card:**
- Query: Rain KYC status (NEW - needs to be added)
- Query: Program enrollment status (verify if exists)

**Admin Panel Internal:**
- Mutation: Create invitation(s)
- Mutation: Resend notification
- Query: List invitations with filters
- API Route: Background job endpoint for auto-trigger

### Mobile App Requirements (Out of Admin Panel Scope)

These are dependencies that need coordination with mobile team:

- New `DeepLinkScreen` values: `KYC_START`, `PROGRAM_SIGNUP` (or similar)
- Deep link handler for invitation flow entry points
- Resume capability for interrupted KYC flow

## Functional Requirements

### Invitation Management

- FR1: Admin can create an invitation for a single user
- FR2: Admin can create invitations for multiple users in a single batch operation (up to 50)
- FR3: Admin can view a list of all invitations with their current status
- FR4: Admin can filter the invitation list by status (invited, in-progress, approved, enrolled, rejected)
- FR5: Admin can view detailed information for a specific invitation including timestamps and history
- FR6: System records which admin created each invitation

### User Discovery

- FR7: Admin can search for users by phone number
- FR8: Admin can search for users by email address
- FR9: System excludes users who already have an active invitation from search results
- FR10: Admin can select multiple users from search results for batch invitation

### Status Monitoring

- FR11: System displays real-time invitation status when admin opens the panel
- FR12: System fetches latest KYC status from Sumsub (L2 verification) on demand
- FR13: System fetches latest KYC status from Rain (blink-card) on demand
- FR14: System displays rejection reasons when KYC verification fails
- FR15: Admin can see when each status transition occurred (timestamps)

### Notification Delivery

- FR16: System sends push notification to user when invitation is created (Flow 1 - KYC start)
- FR17: System sends push notification to user when KYC is approved (Flow 2 - program signup)
- FR18: Admin can manually resend a notification for any invitation
- FR19: System tracks notification delivery failures per invitation
- FR20: Push notifications include deep links to appropriate mobile app screens

### Automated Workflows

- FR21: System automatically detects when invited user's KYC status changes to approved
- FR22: System automatically triggers Flow 2 notification within 15 minutes of KYC approval
- FR23: System updates invitation status based on KYC status changes
- FR24: System updates invitation status when user completes program enrollment

### Template Management

- FR25: Admin can upload a YAML file containing notification templates
- FR26: Admin can preview notification content before sending invitations
- FR27: Templates support placeholder variables (e.g., user name)
- FR28: Templates specify which deep link screen to open for each flow

## Non-Functional Requirements

### Performance

- NFR1: Invitation list loads with current status within 3 seconds
- NFR2: Batch invitation of 50 users completes within 30 seconds
- NFR3: User search returns results within 2 seconds
- NFR4: Status refresh (fetching KYC status from external services) completes within 5 seconds

### Reliability

- NFR5: Background job executes every 15 minutes with >99% consistency
- NFR6: No invitation data is lost due to system failures (database durability)
- NFR7: Failed notifications are recorded and surfaced for manual retry
- NFR8: System gracefully handles unavailability of external services (Sumsub, Rain) without crashing

### Integration

- NFR9: Admin panel handles timeout/errors from main API without crashing
- NFR10: Admin panel handles timeout/errors from blink-card service gracefully
- NFR11: Notification delivery failures are logged with sufficient detail for debugging
- NFR12: KYC status queries do not impact performance of external services (reasonable rate limiting)

### Security (Inherited)

- NFR13: Only authenticated admins can access the invitation system (inherits admin-panel auth)
- NFR14: All invitation actions are logged with admin identity for audit trail
