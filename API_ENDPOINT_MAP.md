# EVzone Backend API Endpoint Map

> Generated from frontend mock data analysis across all 4 apps (admin, investor, entrepreneur, provider/assessor).
> Maps every frontend data structure to the exact backend endpoint needed.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Already implemented |
| 🔄 | Partially implemented (needs extension) |
| ❌ | Not yet implemented |
| 🔒 | Requires ADMIN role |
| 🔐 | Requires auth (any role) |
| 👤 | Requires specific role (see notes) |

---

## 1. AUTH & CURRENT USER

### Frontend: `adminProfile`, `users` (current user), OIDC login flow

| Endpoint | Method | Auth | Status | Description |
|----------|--------|------|--------|-------------|
| `/auth/me` | GET | 🔐 | ✅ | Current user with profile |
| `/auth/logout` | POST | 🔐 | ✅ | Clear local session |
| `/auth/callback` | — | Public | ✅ | OIDC redirect (frontend-only) |

**Gap:** Frontend `adminProfile` interface has `permissions`, `department`, `memberSince` — these are not in the `User` entity. Either add to `User.preferences` jsonb or extend the response DTO.

---

## 2. USERS MODULE (`demoData.ts` → `PlatformUser`)

### Frontend features:
- List users with filters (status, role, risk, jurisdiction, search, sort)
- KPI cards: Total, Pending, Active, Suspended
- Bulk actions: Approve, Suspend, Export
- User detail panel with KYC progress, status history, documents
- Actions: Approve, Suspend, Terminate, Edit Role, Message

| Endpoint | Method | Auth | Status | Notes |
|----------|--------|------|--------|-------|
| `/users` | GET | 🔒 | ✅ | Filterable list (role, status, kyc, country, search) |
| `/users/stats/overview` | GET | 🔒 | ✅ | Count by role/status/KYC |
| `/users/:id` | GET | 🔒/👤 | ✅ | Get user by ID |
| `/users/:id` | PATCH | 🔒/👤 | ✅ | Update user |
| `/users/:id/verify` | POST | 🔒 | ✅ | Verify KYC |
| `/users/:id/suspend` | POST | 🔒 | ✅ | Suspend user |
| `/users/:id/unsuspend` | POST | 🔒 | ✅ | Unsuspend user |
| `/users/:id/profile` | GET | 🔒/👤 | ✅ | Get profile |
| `/users/:id/profile` | PATCH | 🔒/👤 | ✅ | Update profile |
| `/users/:id/kyc` | POST | 🔒/👤 | ✅ | Submit KYC |
| `/users/:id/kyc` | GET | 🔒/👤 | ✅ | Get KYC status |
| `/users/:id` | DELETE | 🔒 | ✅ | Soft delete |

**Gaps:**
- ❌ Bulk approve/suspend endpoint (frontend has bulk actions UI)
- ❌ Export users endpoint
- ❌ `riskLevel` field not in `User` entity — needs adding (enum: low/medium/high)
- ❌ `company` field not in `User` entity — entrepreneurs have `companyName` in profile, but frontend expects `company` on all users. Could derive from profile.
- ❌ `jurisdiction` field — frontend uses this, but backend has `country`/`city`. Map `country` → `jurisdiction`.
- ❌ `lastActive` field — frontend expects this, backend has `lastLoginAt`. Map or rename.
- ❌ Status history timeline — not persisted. Could be generated from `AuditLog`.
- ❌ KYC documents list — stored in `preferences.kycDocuments`, needs structured response.

---

## 3. ASSESSORS MODULE (was Providers) (`demoData.ts` → `ProviderAcc`)

### Frontend features:
- List assessors with filters (status, tier, search)
- KPI cards: Accredited, Pending Review, Avg Rating, Under Review
- Detail panel: rating, stats, performance trend, accreditations, quality audits, contract status
- Actions: Accredit, Suspend, Downgrade Tier, Schedule Audit, Message

| Endpoint | Method | Auth | Status | Notes |
|----------|--------|------|--------|-------|
| `/admin/assessors` | GET | 🔒 | 🔄 | List assessors (renamed from `/admin/providers`) |
| `/admin/assessors/:id` | GET | 🔒 | 🔄 | Get assessor by ID |
| `/admin/assessors/:id/verify` | PATCH | 🔒 | 🔄 | Verify assessor |
| `/admin/assessors/:id/suspend` | POST | 🔒 | 🔄 | Suspend assessor |
| `/due-diligence/assessors` | GET | 🔒 | 🔄 | List assessors with filters |

**Gaps:**
- ❌ `ProviderAcc` interface has fields not in `AssessorProfile`:
  - `licenseExpiry` — needs new column
  - `insuranceValid` — needs new column
  - `tier` (Gold/Silver/Bronze) — needs new column
  - `avgTurnaround` — needs new column
  - `activeEngagements` — can be computed from engagements
  - `completedDD` — can be computed from engagements
- ❌ Performance history endpoint (monthly DD completed + rating)
- ❌ Quality audit history endpoint
- ❌ Accreditation/license endpoint
- ❌ Downgrade tier endpoint
- ❌ Schedule audit endpoint

---

## 4. PROJECTS MODULE (`projectStories.ts` → `ProjectStory`)

### Frontend features:
- Public project list with filters (sector, status, country, search)
- Featured projects
- Project detail with rich story data (founder, impact, SDGs, location)
- Entrepreneur: create, edit, submit for review
- Admin: approve, reject, feature/unfeature
- Milestones: CRUD, complete

| Endpoint | Method | Auth | Status | Notes |
|----------|--------|------|--------|-------|
| `/projects` | GET | Public | ✅ | Public list with filters |
| `/projects/featured` | GET | Public | ✅ | Featured projects |
| `/projects/:id` | GET | Public | ✅ | Single project |
| `/projects/:id/full` | GET | 🔐 | ✅ | Full project with relations |
| `/projects` | POST | 👤 ENTREPRENEUR | ✅ | Create project |
| `/projects/:id` | PATCH | 👤 Owner/ADMIN | ✅ | Update project |
| `/projects/:id/submit` | POST | 👤 Owner | ✅ | Submit for review |
| `/projects/:id/approve` | POST | 🔒 | ✅ | Admin approve |
| `/projects/:id/reject` | POST | 🔒 | ✅ | Admin reject |
| `/projects/:id/feature` | POST | 🔒 | ✅ | Toggle featured |
| `/projects/stats/overview` | GET | 🔒 | ✅ | Admin stats |
| `/projects/:id/milestones` | GET | 🔐 | ✅ | List milestones |
| `/projects/:id/milestones` | POST | 👤 Owner/ADMIN | ✅ | Create milestone |
| `/milestones/:id` | PATCH | 👤 Owner/ADMIN | ✅ | Update milestone |
| `/milestones/:id/complete` | POST | 👤 Owner/ASSESSOR/ADMIN | ✅ | Complete milestone |

**Gaps:**
- ❌ `ProjectStory` has rich fields not in `Project` entity:
  - `tagline` — map to `subtitle`
  - `heroImage` — map to `coverImage`
  - `gallery` — map to `galleryImages`
  - `videoUrl` — exists ✅
  - `impactVideo` — needs new column
  - `founder` — map to `teamMembers[0]`
  - `story` (problem/solution/journey/vision) — needs new `story` jsonb column
  - `impact` (co2Avoided, renewableEnergy, etc.) — map to `impactMetrics`
  - `sdgs` — exists ✅
  - `location` (city/country/coords/description) — city/country exist, need `coordinates`, `locationDescription`
  - `valuation` — needs new column
  - `structure` (Equity/Blended Finance/etc.) — needs new column
  - `returnTarget` — needs new column
  - `riskRating` — map to `risks.riskLevel`
  - `investors` — can be computed from investments
  - `daysRemaining` — computed from `campaignEndDate`
  - `amountRaised` — exists as `fundingRaised` ✅

---

## 5. TRANSACTIONS MODULE (`demoData.ts` → `Transaction`)

### Frontend features:
- Transaction list with filters (time range, status, type, risk, jurisdiction)
- KPIs: Total Volume, Flagged Count, Success Rate, In Escrow
- Exception summary
- Detail panel with risk assessment, related transactions, actions (Approve, Hold, Escalate, Reverse)

| Endpoint | Method | Auth | Status | Notes |
|----------|--------|------|--------|-------|
| `/admin/transactions` | GET | 🔒 | 🔄 | List all transactions (pagination only) |
| `/admin/transactions/stats` | GET | 🔒 | 🔄 | Basic stats (count, volume, byStatus, byType) |

**Gaps:**
- ❌ No `Transaction` controller in its own module. Currently only in `AdminService`.
- ❌ Frontend `Transaction` has fields not in entity:
  - `from`, `to`, `project` — not in `Transaction` entity (has `userId`, `investmentId`, `type`)
  - `riskScore` — needs new column
  - `jurisdiction` — needs new column or derive from user
  - `date` — map to `createdAt` or `processedAt`
- ❌ Filter by time range, status, type, risk, jurisdiction
- ❌ Transaction detail endpoint
- ❌ Approve/Hold/Escalate/Reverse actions
- ❌ Related transactions by project
- ❌ Risk assessment endpoint

**Required new controller:** `TransactionsController` in `investments` module or standalone.

---

## 6. COMPLIANCE & KYC MODULE (`demoData.ts` → `KycCase`, `ComplianceAlert`)

### Frontend features:
- Compliance alerts list with filters (severity, status, category)
- KYC pipeline view (pending cases with progress)
- Alert detail with assignee, actions

| Endpoint | Method | Auth | Status | Notes |
|----------|--------|------|--------|-------|
| `/admin/compliance/alerts` | GET | 🔒 | ✅ | List alerts with filters |
| `/admin/compliance/alerts/:id` | GET | 🔒 | ✅ | Get alert by ID |
| `/admin/compliance/alerts/:id` | PATCH | 🔒 | ✅ | Update alert status |
| `/admin/compliance/stats` | GET | 🔒 | ✅ | Compliance stats |

**Gaps:**
- ❌ No dedicated `KycCase` entity. KYC is stored on `User` entity.
- Frontend `KycCase` is a derived view: users with `kycStatus !== 'VERIFIED'`.
- ❌ KYC cases list endpoint (can be derived from `/users?kycStatus=PENDING`)
- ❌ `documentsReceived`/`documentsRequired` — not tracked individually
- ❌ `riskFlags` on KYC case — not implemented
- ❌ `assignedTo` on KYC — not implemented

---

## 7. PROJECT VETTING MODULE (`demoData.ts` → `ProjectVetting`)

### Frontend features:
- Project vetting pipeline (kanban-style stages)
- Stage transitions: submitted → under_review → committee_review → approved/rejected/revision_requested
- Days in stage tracking
- Reviewer assignment

| Endpoint | Method | Auth | Status | Notes |
|----------|--------|------|--------|-------|
| `/projects` | GET | 🔒 | ✅ | Admin sees all including DRAFT/UNDER_REVIEW |
| `/projects/:id/approve` | POST | 🔒 | ✅ | Approve project |
| `/projects/:id/reject` | POST | 🔒 | ✅ | Reject project |
| `/projects/:id/submit` | POST | 👤 Owner | ✅ | Submit for review |

**Gaps:**
- ❌ `ProjectVetting` stage values don't match `ProjectStatus` enum:
  - Frontend: `submitted | under_review | committee_review | approved | rejected | revision_requested`
  - Backend: `DRAFT | UNDER_REVIEW | ACTIVE | FUNDED | COMPLETED | CANCELLED`
  - Need to add `COMMITTEE_REVIEW` and `REVISION_REQUESTED` to `ProjectStatus` enum, OR map frontend stages:
    - `submitted` → `UNDER_REVIEW`
    - `committee_review` → `UNDER_REVIEW` (with flag)
    - `revision_requested` → `UNDER_REVIEW` (with flag)
- ❌ `reviewer` field — not in `Project` entity
- ❌ `daysInStage` — not tracked
- ❌ `environmentalScore` — not in entity
- ❌ `riskRating` — in `risks` jsonb

---

## 8. DISPUTES MODULE (`demoData.ts` → `DisputeCase`)

### Frontend features:
- Disputes list with filters (status, type, priority)
- Detail panel with parties, financial impact, resolution
- Actions: resolve, escalate, mediate

| Endpoint | Method | Auth | Status | Notes |
|----------|--------|------|--------|-------|
| `/admin/disputes` | GET | 🔒 | ✅ | List disputes |
| `/admin/disputes/:id` | GET | 🔒 | ✅ | Get dispute |
| `/admin/disputes/:id` | PATCH | 🔒 | ✅ | Update dispute |
| `/admin/disputes/:id/resolve` | POST | 🔒 | ✅ | Resolve dispute |
| `/admin/disputes/stats` | GET | 🔒 | ✅ | Dispute stats |

**Gaps:**
- ❌ `priority` field not in `Dispute` entity
- ❌ `financialImpact` not in entity
- ❌ `parties` array — entity has `initiatorId`/`respondentId` only
- ❌ `openedDate` — map to `createdAt`
- ❌ Disputes are admin-only; entrepreneurs/investors cannot view their own disputes

---

## 9. AUDIT LOGS MODULE (`demoData.ts` → `AuditLog`)

### Frontend features:
- Audit log table with filters (action, entity, user, date range)
- Before/after values display

| Endpoint | Method | Auth | Status | Notes |
|----------|--------|------|--------|-------|
| `/admin/audit-logs` | GET | 🔒 | ✅ | List audit logs with filters |

**Gaps:**
- ❌ Frontend `AuditLog` has `jurisdiction` — not in entity
- ❌ Frontend has `beforeValue`/`afterValue` as strings — entity has `oldValues`/`newValues` as jsonb. Map in response.
- ❌ No dedicated endpoint to create audit logs (only via `AdminService.createAuditLog`)

---

## 10. RISK MANAGEMENT MODULE (`demoData.ts` → Risk data)

### Frontend features:
- Risk dashboard with project risk ratings
- Risk assessment form
- Risk stats

| Endpoint | Method | Auth | Status | Notes |
|----------|--------|------|--------|-------|
| `/admin/risk/projects` | GET | 🔒 | ✅ | Projects needing risk assessment |
| `/admin/risk/projects/:id/assess` | POST | 🔒 | ✅ | Submit risk assessment |
| `/admin/risk/stats` | GET | 🔒 | ✅ | Risk stats |

**Gaps:**
- ❌ Risk data is stored in `Project.risks` jsonb — needs structured DTO
- ❌ No per-user risk score (frontend `PlatformUser.riskLevel`)
- ❌ No transaction risk scoring endpoint

---

## 11. DUE DILIGENCE MODULE

### Frontend features:
- Engagements list (assessor sees own, admin sees all)
- Engagement detail with project info, assessments
- Start engagement, submit report, review report
- Available projects for assessment

| Endpoint | Method | Auth | Status | Notes |
|----------|--------|------|--------|-------|
| `/due-diligence/engagements` | GET | 👤 ASSESSOR/ADMIN | ✅ | List engagements |
| `/due-diligence/engagements/:id` | GET | 👤 ASSESSOR/ADMIN | ✅ | Get engagement |
| `/due-diligence/engagements` | POST | 🔒 | ✅ | Create engagement |
| `/due-diligence/engagements/:id` | PATCH | 👤 ASSESSOR/ADMIN | ✅ | Update engagement |
| `/due-diligence/engagements/:id/start` | POST | 👤 ASSESSOR | ✅ | Start engagement |
| `/due-diligence/engagements/:id/submit` | POST | 👤 ASSESSOR | ✅ | Submit report |
| `/due-diligence/engagements/:id/review` | POST | 🔒 | ✅ | Review report |
| `/due-diligence/projects` | GET | 👤 ASSESSOR | ✅ | Available projects |
| `/due-diligence/stats/overview` | GET | 🔒 | ✅ | Stats |

**Gaps:**
- ❌ Engagement detail view needs richer project data
- ❌ No file upload for report documents

---

## 12. NOTIFICATIONS MODULE (`demoData.ts` → `Notification`)

### Frontend features:
- Notification bell with unread count
- Mark as read
- Types: info, success, warning, error

| Endpoint | Method | Auth | Status | Notes |
|----------|--------|------|--------|-------|
| `/notifications` | GET | 🔐 | ❌ | List user notifications |
| `/notifications/:id/read` | PATCH | 🔐 | ❌ | Mark as read |
| `/notifications/read-all` | POST | 🔐 | ❌ | Mark all as read |
| `/notifications/unread-count` | GET | 🔐 | ❌ | Get unread count |

**Status:** Entity exists but no controller/service wired to HTTP endpoints.

---

## 13. MESSAGING MODULE

### Frontend features:
- Conversations list
- Message thread
- Send message

| Endpoint | Method | Auth | Status | Notes |
|----------|--------|------|--------|-------|
| `/messages/conversations` | GET | 🔐 | ❌ | List conversations |
| `/messages/conversations/:id` | GET | 🔐 | ❌ | Get conversation messages |
| `/messages` | POST | 🔐 | ❌ | Send message |
| `/messages/:id/read` | PATCH | 🔐 | ❌ | Mark message as read |

**Status:** Entity exists but no controller/service wired to HTTP endpoints.

---

## 14. INVESTMENTS MODULE

### Frontend features:
- Portfolio view
- Invest in project
- Track returns

| Endpoint | Method | Auth | Status | Notes |
|----------|--------|------|--------|-------|
| `/investments` | GET | 🔐 | ❌ | List user's investments |
| `/investments` | POST | 👤 INVESTOR | ❌ | Create investment |
| `/investments/:id` | GET | 🔐 | ❌ | Get investment detail |
| `/investments/portfolio` | GET | 👤 INVESTOR | ❌ | Portfolio summary |

**Status:** Entity exists but minimal controller coverage.

---

## 15. DOCUMENTS MODULE

### Frontend features:
- KYC document upload
- Project document gallery
- DD report documents

| Endpoint | Method | Auth | Status | Notes |
|----------|--------|------|--------|-------|
| `/documents/upload` | POST | 🔐 | ❌ | Upload file |
| `/documents` | GET | 🔐 | ❌ | List user documents |
| `/documents/:id` | GET | 🔐 | ❌ | Download document |

**Status:** Module skeleton exists but not fully wired.

---

## 16. ADMIN DASHBOARD

### Frontend features:
- KPI cards: Pending Users, Active Providers, Flagged Transactions, Open Alerts
- Charts: User Distribution (pie), Transaction Volume (bar), KYC Pipeline
- Quick actions
- Compliance alerts feed
- Project vetting pipeline

| Endpoint | Method | Auth | Status | Notes |
|----------|--------|------|--------|-------|
| `/admin/dashboard` | GET | 🔒 | ✅ | Dashboard metrics aggregate |

**Gap:** The dashboard endpoint returns raw counts. Frontend needs:
- ❌ Pending users count → can derive from `usersByRole` + `byStatus`
- ❌ Active assessors count → need to add to dashboard response
- ❌ Flagged transactions count → need to add to dashboard response
- ❌ Open alerts count → need to add to dashboard response
- ❌ Critical alerts count → need to add to dashboard response
- ❌ Transaction volume by month → need time-series endpoint
- ❌ KYC pipeline cases → need KYC cases endpoint

---

## Summary: Implementation Priority

### Phase A: Critical Gaps (blocks frontend integration)
1. **Transactions Controller** — full CRUD with filters, risk scoring
2. **Notifications Controller** — basic CRUD
3. **Messages Controller** — basic CRUD
4. **Investments Controller** — portfolio + invest endpoints
5. **Documents Controller** — upload/download
6. **Extend Project entity** — add missing story/valuation/structure/returnTarget/impactVideo fields
7. **Extend AssessorProfile entity** — add licenseExpiry, insuranceValid, tier, avgTurnaround
8. **Add User.riskLevel** column

### Phase B: Admin Features
9. **KYC Cases endpoint** — derived from users with pending KYC
10. **Bulk user actions** — approve/suspend multiple
11. **Transaction actions** — approve/hold/escalate/reverse
12. **Audit log enrichment** — map jsonb to frontend string format
13. **Dashboard endpoint enrichment** — add missing KPIs

### Phase C: Polish
14. **File uploads for DD reports**
15. **Real-time notifications (WebSocket/SSE)**
16. **Search/indexing for projects and users**
