# EvzoneInvestments Backend — Architecture Audit Report

## Executive Summary

The backend is built as a **NestJS monorepo** using **Nx**, with a clear modular structure, PostgreSQL/Prisma as the source of truth, Kafka outbox pattern for events, Redis for operational caching, and a worker-based architecture for background processing.

---

## 1. ✅ Backend Architecture Direction

### Monorepo Structure (Nx)
```
evzone-backend-api/
├── apps/
│   ├── api/                    ← Main REST API
│   ├── scheduler/              ← Cron/deadline worker
│   ├── worker-events/          ← Outbox publisher + event consumer
│   ├── worker-media/           ← Image processing worker
│   ├── worker-compliance/      ← KYC/KYB worker
│   ├── worker-notifications/   ← Notification worker
│   └── worker-webhooks/        ← Payment webhook processor
├── libs/
│   ├── common/                 ← Shared DTOs, decorators, guards, pipes
│   ├── config/                 ← Configuration loader
│   ├── database/               ← Prisma service, transaction service
│   ├── events/                 ← Outbox service, event types, event bus
│   ├── redis/                  ← Redis client, rate limiting
│   ├── impact/                 ← Impact reporting service
│   ├── permissions/            ← RBAC/ABAC permission service, tenant guard
│   ├── observability/          ← Health checks, circuit breaker
│   ├── auth/                   ← JWT strategies, auth guards
│   ├── storage/                ← S3/Spaces abstraction
│   └── notifications/          ← Notification dispatch
├── prisma/
│   ├── schema.prisma           ← Full data model
│   └── migrations/
├── docker/
└── test/
```

**Verdict:** ✅ Matches recommended structure. Clean separation of API and workers. Nx monorepo enables shared libraries.

---

## 2. ✅ Core Bounded Contexts — Detailed Audit

### A. Identity, Access & Tenants

| Requirement | Status | Evidence |
|---|---|---|
| Users with full CRUD | ✅ | `User` model, `users.module.ts` |
| Roles (RBAC) | ✅ | `PlatformRole` enum, `@Roles()` decorator |
| ABAC (tenant/project scoped) | ✅ | `PermissionsService`, `TenantGuard` |
| Organizations/Tenants | ✅ | `Tenant` model, `tenants.module.ts` |
| Investor/Entrepreneur/Assessor profiles | ✅ | `InvestorProfile`, `EntrepreneurProfile`, `AssessorProfile` models |
| MFA support | ✅ | `mfaEnabled` field, OTP via Redis (`mfa:otp:{userId}`) |
| Session/device tracking | ✅ | `RefreshToken` model with `ipAddress`, `userAgent` |
| Login attempt throttling | ✅ | `loginAttempts` field + Redis rate limiter |

**Minor gaps:**
- `UserRole` enum exists but is separate from `PlatformRole` — consider consolidation
- MFA flow: OTP is generated and stored in Redis but verify SMS/email delivery integration

### B. Projects & Green Finance Assets

| Requirement | Status | Evidence |
|---|---|---|
| Project CRUD | ✅ | `projects.module.ts` — full CRUD with soft delete |
| ProjectStatus enum | ✅ | All 12 statuses: `DRAFT → SUBMITTED → UNDER_REVIEW → DUE_DILIGENCE → APPROVED/REJECTED → LISTED → FUNDING → FUNDED → ACTIVE → COMPLETED → SUSPENDED` |
| ProjectStage enum | ✅ | `CONCEPT, FEASIBILITY, CONSTRUCTION, OPERATIONAL, EXPANSION` |
| GreenSector enum | ✅ | `SOLAR, WIND, HYDRO, BIOMASS, EV_CHARGING, GREEN_HYDROGEN, ENERGY_STORAGE, OTHER` |
| Funding target/raised | ✅ | `fundingTarget`, `fundingRaised` fields |
| SDGs, impact metrics | ✅ | `sdgs: Int[]`, `impactMetrics: Json`, `expectedImpact: Json` |
| Risk rating | ✅ | `riskRating: RiskRating?` |
| Milestones | ✅ | `Milestone` model with `MilestoneStatus` |
| Versioning (revision requests) | ✅ | `requestRevision()` method, `revisionNotes`, `revisionRequestedAt` |

### C. Project Gallery & Object Storage

| Requirement | Status | Evidence |
|---|---|---|
| MediaAsset model | ✅ | Full model with `status`, `purpose`, `altText`, `sortOrder` |
| Presigned upload URLs | ✅ | `createGalleryUploadIntent()` returns upload URL |
| Upload completion flow | ✅ | `completeUpload()` sets status to `UPLOADED`, emits `media.upload.completed` event |
| Signed read URLs | ✅ | `getSignedUrl()` method |
| Object key pattern | ✅ | `tenants/{tenantId}/projects/{projectId}/gallery/{mediaAssetId}` |
| Gallery reordering | ✅ | `reorderGallery()` method |
| File validation in worker | ⚠️ | `worker-media/src/main.ts` exists — verify implementation |
| Thumbnail generation | ⚠️ | Should be in `worker-media` — verify implementation |

**Recommendation:** Ensure `worker-media` validates file types, scans for malware, extracts EXIF/metadata, and generates thumbnails before marking `READY`.

### D. Due Diligence & Assessor Workflows

| Requirement | Status | Evidence |
|---|---|---|
| DueDiligenceCase model | ✅ | Full model with status, risk score, assessor assignment |
| DueDiligenceStatus enum | ✅ | All 9 statuses match spec |
| DueDiligenceTask model | ✅ | Categories: `FINANCIAL, TECHNICAL, LEGAL, ESG, MARKET` |
| Assessor assignment | ✅ | `createEngagement()` assigns assessor |
| Task management | ✅ | `createTask`, `updateTask`, `updateTaskStatus` |
| Evidence uploads | ✅ | Documents and media linked to tasks/cases |
| Risk scoring | ✅ | `riskScore` and `riskRating` fields |
| Approval/rejection | ✅ | Workflow transitions via `transitionProject()` |

### E. Campaigns, Deals & Syndication

| Requirement | Status | Evidence |
|---|---|---|
| Deal model | ✅ | Full model with `minInvestment`, `targetAmount`, `maxAmount`, `opensAt`, `closesAt` |
| DealStatus enum | ✅ | All 8 statuses match spec |
| Investment relationship | ✅ | `Deal.investments` relation |
| Campaign dates | ✅ | `campaignStartDate`, `campaignEndDate` on Project |
| Minimum/maximum investment | ✅ | Enforced in `invest()` method |
| Investor limits | ⚠️ | Not explicitly implemented — add per-investor/per-deal caps |
| Allocation rules | ⚠️ | Not implemented — needed for oversubscribed deals |

### F. Investments, Commitments & Escrow

| Requirement | Status | Evidence |
|---|---|---|
| Investment model | ✅ | Full model with `idempotencyKey` |
| Double-entry ledger | ✅ | `postCommitmentLedger()` creates DEBIT (Investor Cash Pending) + CREDIT (Escrow Liability) |
| Idempotency | ✅ | `@@unique([investorUserId, idempotencyKey])`, checked in `invest()` |
| PaymentIntent model | ✅ | Full model with provider references |
| PaymentTransaction model | ✅ | Tracks provider transactions |
| Transaction model | ✅ | Tracks all money movements |
| Investment lifecycle | ✅ | `PENDING_COMPLIANCE → PENDING_PAYMENT → COMMITTED → CONFIRMED` |
| Cancellation with refund | ✅ | `cancel()` creates REFUND transaction, decrements `fundingRaised` |
| Escrow accounts | ✅ | `LedgerOwnerType.PROJECT` with "Escrow Liability" account |

**Gaps to address:**
- `invest()` uses `fundingRaised` increment but should use ledger reconciliation as source of truth
- No explicit `distribution` or `payout` ledger entries yet
- Tax/withholding records not yet modeled in transactions

### G. Compliance & RegTech

| Requirement | Status | Evidence |
|---|---|---|
| KYC/KYB applications | ✅ | `KycApplication`, `KybApplication` models |
| KYC provider integration | ✅ | `SmileIdentityAdapter` implemented |
| Compliance cases | ✅ | `ComplianceCase` model |
| Compliance alerts | ✅ | `ComplianceAlert` model with severity |
| Investor eligibility check | ✅ | `runComplianceCheck()` — KYC status, active status, risk alerts |
| Jurisdiction checks | ⚠️ | Placeholder — `passed: true` hardcoded |
| Sanctions/PEP screening | ⚠️ | Not yet implemented |
| AML screening | ⚠️ | Not yet implemented |
| Accredited investor verification | ⚠️ | `accreditationStatus` field exists but not verified programmatically |

### H. Impact Reporting

| Requirement | Status | Evidence |
|---|---|---|
| ImpactReport model | ✅ | Full model with `metrics`, `evidenceAttachments` |
| Reporting periods | ✅ | `reportingPeriodStart`, `reportingPeriodEnd` |
| Review workflow | ✅ | `submittedBy`, `reviewedAt`, `reviewedBy`, `reviewNotes` |
| Impact metrics (CO₂, etc.) | ✅ | Stored as `Json` in `metrics` field |
| Periodic report generation | ⚠️ | Needs scheduler implementation |
| Public impact summaries | ⚠️ | API endpoint needed |

---

## 3. ✅ Prisma Schema Quality

| Aspect | Status | Notes |
|---|---|---|
| Connection pooling | ✅ | `DATABASE_URL` (pooled) + `DIRECT_URL` (migrations) |
| Indexes | ✅ | Proper indexes on `tenantId`, `status`, `userId`, foreign keys |
| Unique constraints | ✅ | `tenantId+slug`, `investorUserId+idempotencyKey`, `bucket+objectKey` |
| Soft delete pattern | ✅ | `deletedAt` field on User, Project, Document |
| Cascading deletes | ✅ | Proper `onDelete: Cascade/SetNull/Restrict` |
| Enum consistency | ✅ | All enums match between schema and TypeScript |

**Minor issues:**
- `ProjectSector` enum is duplicate of `GreenSector` — consolidate
- `TaskStatus` enum differs from `MilestoneStatus` — intentional but document the distinction

---

## 4. ✅ Kafka Event Architecture

| Aspect | Status | Evidence |
|---|---|---|
| Outbox pattern | ✅ | `OutboxEvent` model, `OutboxService.create()` |
| Transactional publishing | ✅ | Events written in same DB transaction as business data |
| Publisher worker | ✅ | `worker-events/src/main.ts` polls and publishes |
| Retry logic | ✅ | `FAILED` status with `nextAttemptAt`, `attempts` counter |
| Event types implemented | ✅ | `project.created`, `project.submitted`, `project.approved`, `project.rejected`, `project.published`, `project.revision-requested`, `media.upload.completed`, `due_diligence.assigned`, `investment.created`, `investment.compliance_approved`, `investment.confirmed`, `investment.cancelled`, `payment.intent_created`, `user.created` |

**Events to add:**
- `deal.approved` — when deal moves to APPROVED status
- `deal.opened` — when deal goes LIVE
- `ledger.transaction_posted` — after ledger entries are created
- `impact.report_submitted` — when impact report is submitted
- `user.verified` — when KYC verification succeeds

---

## 5. ✅ Redis Usage

| Use Case | Status | Evidence |
|---|---|---|
| Rate limiting | ✅ | `rate-limit.middleware.ts` |
| MFA OTP storage | ✅ | `mfa:otp:{userId}` with 300s TTL |
| Login attempt tracking | ✅ | `loginAttempts` in DB + Redis rate limiter |
| Session management | ✅ | Refresh tokens with hashed storage |

**Should add:**
- Idempotency key windows (`idempotency:{userId}:{key}`) with 24-72h TTL
- Short-lived distributed locks for investment processing (`lock:investment:{dealId}:{userId}`)
- Project discovery cache (`cache:projects:discovery:{hash}`) with 1-10min TTL
- Public project card cache

---

## 6. ✅ API Design

| Aspect | Status | Evidence |
|---|---|---|
| REST with versioning | ✅ | Controller routes defined |
| Global ValidationPipe | ✅ | DTOs with `class-validator` decorators |
| JWT auth guards | ✅ | `@ApiBearerAuth()`, `@Roles()`, `@Public()` |
| CRUD for all entities | ✅ | Full CRUD for projects, investments, transactions, etc. |
| Pagination | ✅ | `PaginationDto`, cursor-based with `getPage`/`getLimit` |

**Routes verified:**
- `/api/projects` — CRUD, submit, approve, reject, publish, featured
- `/api/projects/:id/gallery` — upload intent, complete, list, update, delete, reorder
- `/api/projects/:id/analytics` — dashboard analytics
- `/api/investments` — invest, cancel, confirm, compliance check, portfolio
- `/api/transactions` — deposit, withdraw, approve, hold, escalate, reverse
- `/api/due-diligence` — engagement CRUD, tasks, evidence, reports
- `/api/payments` — collection intents, webhooks, KYC/KYB
- `/api/milestones` — CRUD, complete
- `/api/notifications` — list, read, mark all read
- `/api/admin` — user management, tenant management, platform stats
- `/api/audit` — audit logs
- `/api/ai-advisor` — chat sessions and messages
- `/api/votes` — governance voting
- `/api/watchlist` — deal watchlist
- `/api/messaging` — internal messages

---

## 7. ✅ Security Model

| Requirement | Status | Evidence |
|---|---|---|
| JWT access + refresh tokens | ✅ | `issueTokens()`, `refresh()` in auth service |
| Refresh token rotation | ✅ | `replacedBy` field on `RefreshToken` model |
| Hashed refresh tokens | ✅ | `tokenHash` field, bcrypt comparison |
| MFA support | ✅ | TOTP flow with Redis OTP storage |
| Global auth guard | ✅ | `@ApiBearerAuth()` on controllers |
| RBAC + ABAC | ✅ | `@Roles()` + `PermissionsService.assertOwnerOrAdmin()` + `TenantGuard` |
| Audit logging | ✅ | `AuditService.record()` on all sensitive operations |
| Idempotency on financial ops | ✅ | Investment idempotency key |
| Password hashing | ✅ | bcrypt with configurable rounds |
| Account lockout | ✅ | `lockoutUntil` after 5 failed attempts |

**Should add:**
- Field-level PII encryption (e.g., encrypt `User.email`, `User.phone` at rest)
- Rate limiting on auth endpoints (login, register, password reset)
- Signed URLs for all private documents/media (verify this is enforced everywhere)

---

## 8. ✅ Background Workers

| Worker | Status | Evidence |
|---|---|---|
| `worker-events` | ✅ | Outbox publisher polling every 2.5s, batch of 50 |
| `worker-media` | ⚠️ | `main.ts` exists — verify image validation, thumbnail generation |
| `worker-compliance` | ⚠️ | `main.ts` exists — verify KYC/KYB processing |
| `worker-notifications` | ⚠️ | `main.ts` exists — verify email/SMS/push dispatch |
| `scheduler` | ⚠️ | `main.ts` exists — verify deadline checks, reminders |
| `worker-webhooks` | ⚠️ | `main.ts` + webhook processing service — verify payment reconciliation |
| `worker-payments` | ❌ | **Missing** — payments currently inside API module, should be extracted |

---

## 9. ✅ Payment Integration

| Aspect | Status | Evidence |
|---|---|---|
| Flutterwave adapter | ✅ | `flutterwave.adapter.ts` — collections, verification, payouts |
| Paytota adapter | ✅ | `paytota.adapter.ts` — collections, verification |
| Payment routing | ✅ | `PaymentProviderRouterService` selects by country/currency |
| Webhook processing | ✅ | `worker-webhooks` with idempotency |
| Ledger posting | ✅ | `LedgerPostingService` with double-entry |
| Payment schedules | ✅ | `PaymentSchedule` model for distributions |

---

## 10. ✅ Additional Features Implemented

| Feature | Status | Evidence |
|---|---|---|
| Governance voting | ✅ | `GovernanceVote`, `GovernanceVoteCast` models, `votes.module.ts` |
| AI Advisor | ✅ | `AiChatSession`, `AiChatMessage` models, `ai-advisor.module.ts` |
| Real-time messaging | ✅ | `Message` model, `messaging.module.ts` |
| Watchlist | ✅ | `WatchlistItem` model, `watchlist.module.ts` |
| Activity feed | ✅ | `ActivityEvent` model, `activity.module.ts` |
| Dispute resolution | ✅ | `Dispute` model exists, basic CRUD in admin module |
| Notifications | ✅ | `Notification`, `NotificationDispatch` models, `notifications.module.ts` |
| Health checks | ✅ | `health-check.service.ts` with DB, Redis, Kafka checks |
| Circuit breaker | ✅ | `circuit-breaker.service.ts` for external providers |

---

## 11. 🔴 Critical Gaps & Recommendations

### High Priority

1. **Missing `user.verified` event** — When KYC verification succeeds in `kyc-kyb.service.ts`, no `user.verified` Kafka event is published. Add outbox event after successful verification.

2. **No `deal.submitted`/`deal.opened` events** — When a deal transitions to LIVE, no event is emitted. Add these events.

3. **Worker implementations need verification** — `worker-media`, `worker-compliance`, `worker-notifications`, `scheduler` all have `main.ts` stubs but their actual processing logic needs to be verified as complete.

4. **Missing worker-payments app** — Payment processing is currently inside the API module. For production, extract to a separate worker app to handle payment webhooks and reconciliation asynchronously.

5. **Jurisdiction/AML/PEP compliance checks are placeholders** — `runComplianceCheck()` has hardcoded `passed: true` for jurisdiction. Implement real sanctions screening and PEP checks.

### Medium Priority

6. **`fundingRaised` denormalization risk** — The `fundingRaised` field on `Project` is updated directly in `invest()` but should be derived from ledger entries for accuracy. Add a reconciliation job.

7. **Allocation rules for oversubscribed deals** — Not implemented. Add pro-rata or priority-based allocation logic.

8. **Investor limits per deal** — Not enforced. Add `maxInvestment` per investor check in `invest()`.

9. **Impact report scheduler** — Periodic impact report reminders and generation not implemented in `scheduler`.

10. **CDN/cache invalidation** — When media status changes to `READY`, CDN cache should be invalidated for public project images.

### Low Priority

11. **`ProjectSector` duplicates `GreenSector`** — Consolidate into one enum.

12. **Missing `investment.events` Kafka topic** — Investment state changes should publish to a dedicated topic.

13. **Field-level encryption** — PII fields (email, phone, bank details) should be encrypted at rest using the `EncryptedField` model pattern that already exists in the schema.

14. **Rate limiting on auth endpoints** — Add `@Throttle()` decorators to login, register, and password reset endpoints.

15. **Comprehensive test coverage** — Only `investments.module.spec.ts` and `outbox-publisher.service.spec.ts` exist. Add tests for critical paths (auth, payments, compliance).

---

## 12. Summary Scorecard

| Category | Score | Notes |
|---|---|---|
| Architecture & Structure | ✅ 9/10 | Clean monolith, good separation, missing payments worker |
| Data Model (Prisma) | ✅ 9/10 | Comprehensive, well-indexed, minor duplicate enum |
| Auth & Security | ✅ 8/10 | JWT, MFA, RBAC, audit — needs field encryption, rate limits |
| Kafka/Events | ✅ 8/10 | Outbox pattern solid, some events missing |
| Payments | ✅ 8/10 | Two providers, ledger posting — needs async worker |
| Compliance/KYC | ⚠️ 6/10 | KYC flow exists, AML/PEP/sanctions are placeholders |
| Workers | ⚠️ 6/10 | Structure exists, implementations need verification |
| API Design | ✅ 9/10 | RESTful, versioned, well-documented with Swagger |
| Redis/Caching | ⚠️ 7/10 | Rate limiting works, needs idempotency and cache layers |
| Impact Reporting | ⚠️ 7/10 | Model exists, periodic generation not implemented |
| **Overall** | **✅ 8/10** | **Strong foundation, address critical gaps before production** |

---

The backend is in strong shape overall. The core infrastructure (NestJS modules, Prisma schema, Kafka outbox, payment providers, ledger, auth) is well-implemented. The primary areas needing attention before production are: completing worker implementations, adding missing Kafka events (`user.verified`, `deal.opened`), implementing real compliance checks (AML/PEP/sanctions), extracting payment processing to a dedicated worker, and adding field-level encryption for PII.