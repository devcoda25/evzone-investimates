# Entrepreneur Frontend → Backend API Mapping

> This document maps every entrepreneur frontend page to its corresponding backend endpoint. Use this as the integration guide when wiring axios + zustand.

---

## Authentication

| Frontend Page | Route | Backend Endpoint | Method | Body/Params |
|--------------|-------|-----------------|--------|-------------|
| Login | `/auth/login` | `/api/v1/auth/login` | `POST` | `{ email, password }` |
| Register | `/auth/register` | `/api/v1/auth/register` | `POST` | `{ email, password, firstName, lastName, role: "ENTREPRENEUR" }` |
| Forgot Password | `/auth/forgot` | `/api/v1/auth/forgot-password` | `POST` | `{ email }` |
| Reset Password | (modal) | `/api/v1/auth/reset-password` | `POST` | `{ token, newPassword }` |
| Get Current User | (layout) | `/api/v1/auth/me` | `GET` | — |
| Logout | (layout) | `/api/v1/auth/logout` | `POST` | — |

**Axios Config:** All authenticated requests need `Authorization: Bearer <token>` header.

---

## Dashboard

| Frontend Page | Route | Backend Endpoint | Method |
|--------------|-------|-----------------|--------|
| Dashboard | `/dashboard` | `/api/v1/projects/entrepreneur/dashboard` | `GET` |

**Response Shape:**
```json
{
  "stats": {
    "totalProjects": 5,
    "totalFundingRaised": "125000.00",
    "activeDeals": 2,
    "totalInvestors": 12,
    "pendingReviews": 1
  },
  "projectsByStatus": { "DRAFT": 1, "ACTIVE": 2, "FUNDING": 1, "COMPLETED": 1 },
  "recentProjects": [...],
  "recentDeals": [...]
}
```

**Zustand Store Suggestion:** `useEntrepreneurDashboardStore`

---

## Projects

| Frontend Page | Route | Backend Endpoint | Method | Body/Params |
|--------------|-------|-----------------|--------|-------------|
| Project List | `/projects` | `/api/v1/projects?mine=true` | `GET` | `?status=&sector=&page=&limit=` |
| Project Detail | `/projects/story/:id` | `/api/v1/projects/:id/full` | `GET` | — |
| Create Project | `/create` | `/api/v1/projects` | `POST` | `{ title, description, sector, stage, ... }` |
| Update Project | `/create` (edit mode) | `/api/v1/projects/:id` | `PATCH` | same as create |
| Submit for Review | `/projects` | `/api/v1/projects/:id/submit` | `POST` | — |
| Delete Project | `/projects` | `/api/v1/projects/:id` | `DELETE` | — |
| Project Analytics | `/analytics` | `/api/v1/projects/:id/analytics` | `GET` | — |

### Create Project DTO (6-step wizard mapped to single endpoint)

| Wizard Step | Frontend Fields | Backend Field | Type | Required |
|------------|-----------------|---------------|------|----------|
| 1. Business Info | `projectName` | `title` | `string` | ✅ |
| | `description` | `description` | `string` | ✅ |
| | `sector` | `sector` | `GreenSector` | ✅ |
| | `location` | `country` | `string` | ✅ |
| | `projectImage` | `coverImage` | `string` (URL) | ❌ |
| 2. Team | `teamMembers` | `teamMembers` | `JSON` | ❌ |
| 3. Financials | `targetRaise` | `fundingTarget` | `number` | ✅ |
| | `minInvestment` | `minInvestment` | `number` | ❌ |
| | `valuation` | `valuation` | `number` | ❌ |
| | `fundAllocation` | `expectedImpact` | `JSON` | ❌ |
| 4. Impact | `co2Reduction` | `impactMetrics` | `JSON` | ❌ |
| | `sdgAlignment` | `sdgs` | `number[]` | ❌ |
| 5. Structure | `investmentStructure` | `structure` | `string` | ❌ |
| | `expectedReturn` | `returnTarget` | `number` | ❌ |
| | `equityOffered` | `equityOffered` | `number` | ❌ |
| | `investmentTerms` | `longDescription` | `string` | ❌ |
| 6. Review | `termsAccepted` | (frontend only) | `boolean` | ✅ |

**File Upload Flow:**
1. `POST /api/v1/projects/:id/gallery/upload-intents` → returns presigned URL
2. Upload file directly to S3/MinIO
3. `PATCH /api/v1/projects/:projectId/gallery/:mediaId` → confirm upload

**Zustand Store Suggestion:** `useProjectStore`

---

## Deals

| Frontend Page | Route | Backend Endpoint | Method | Body/Params |
|--------------|-------|-----------------|--------|-------------|
| Deal List | `/deals` | `/api/v1/deals` | `GET` | `?projectId=` |
| Create Deal | (from project) | `/api/v1/deals` | `POST` | `{ projectId, title, targetAmount, ... }` |
| Open Deal | (from project) | `/api/v1/deals/:id/open` | `POST` | — |
| Pause Deal | (from project) | `/api/v1/deals/:id/pause` | `POST` | — |
| Deal Detail | `/deals/:id` | `/api/v1/deals/:id` | `GET` | — |

**Zustand Store Suggestion:** `useDealStore`

---

## Transactions (Project-scoped)

| Frontend Page | Route | Backend Endpoint | Method |
|--------------|-------|-----------------|--------|
| Transaction List | `/transactions` (orphaned) | `/api/v1/investments/project/:projectId` | `GET` |
| Transaction Stats | `/transactions` (orphaned) | `/api/v1/transactions/stats` | `GET` |
| My Transactions | `/transactions` | `/api/v1/transactions` | `GET` |

> **Note:** The `/transactions` page is currently orphaned (no route in App.tsx). Add the route to make it accessible.

---

## Disputes / Messages

| Frontend Page | Route | Backend Endpoint | Method | Body/Params |
|--------------|-------|-----------------|--------|-------------|
| Dispute List | `/messages` | `/api/v1/disputes/my` | `GET` | `?status=&type=&page=&limit=` |
| Dispute Detail | `/messages` (expanded) | `/api/v1/disputes/my/:id` | `GET` | — |
| Create Dispute | `/messages` | `/api/v1/disputes` | `POST` | `{ type, title, description, entityType, entityId }` |
| Update Dispute | `/messages` | `/api/v1/disputes/my/:id` | `PATCH` | `{ status, resolution }` |

**Zustand Store Suggestion:** `useDisputeStore`

---

## Messaging (1:1 Chat)

| Frontend Page | Route | Backend Endpoint | Method | Body/Params |
|--------------|-------|-----------------|--------|-------------|
| Conversation List | `/messages` | `/api/v1/messages/conversations` | `GET` | — |
| Conversation Thread | `/messages` | `/api/v1/messages/conversations/:userId` | `GET` | — |
| Send Message | `/messages` | `/api/v1/messages` | `POST` | `{ recipientId, subject, body }` |
| Mark Read | `/messages` | `/api/v1/messages/:id/read` | `PATCH` | — |
| Unread Count | (badge) | `/api/v1/messages/unread-count` | `GET` | — |

**Zustand Store Suggestion:** `useMessageStore`

---

## Notifications

| Frontend Page | Component | Backend Endpoint | Method |
|--------------|-----------|-----------------|--------|
| Notification List | TopBar dropdown | `/api/v1/notifications` | `GET` |
| Unread Count | TopBar badge | `/api/v1/notifications/unread-count` | `GET` |
| Mark All Read | TopBar button | `/api/v1/notifications/read-all` | `PATCH` |
| Mark One Read | TopBar item | `/api/v1/notifications/:id/read` | `PATCH` |

**Zustand Store Suggestion:** `useNotificationStore`

---

## User Profile / Settings

| Frontend Page | Route | Backend Endpoint | Method | Body/Params |
|--------------|-------|-----------------|--------|-------------|
| Get Profile | `/settings` | `/api/v1/auth/me` | `GET` | — |
| Update Profile | `/settings` (profile) | `/api/v1/users/:id/profile` | `PATCH` | `{ firstName, lastName, phone, bio, ... }` |
| Update Entrepreneur Profile | `/settings` | `/api/v1/users/:id/entrepreneur-profile` | `PATCH` | `{ companyName, industry, stage, ... }` |
| Change Password | `/settings` (security) | `/api/v1/auth/change-password` | `POST` | `{ currentPassword, newPassword }` |
| Notification Preferences | `/settings` (notifications) | `/api/v1/users/:id/notification-preferences` | `GET` / `PATCH` | — |
| Get KYC Status | `/settings` | `/api/v1/users/:id/kyc-application` | `GET` | — |
| Submit KYC | `/settings` | `/api/v1/users/:id/kyc-submit` | `POST` | `{ idType, idNumber, ... }` |
| Submit KYB | `/settings` | `/api/v1/users/:id/kyb-submit` | `POST` | `{ organizationName, registrationNumber, ... }` |

**Zustand Store Suggestion:** `useUserStore`

---

## Documents

| Frontend Page | Route | Backend Endpoint | Method |
|--------------|-------|-----------------|--------|
| List Documents | `/projects` (detail) | `/api/v1/documents/project/:projectId` | `GET` |
| Upload Document | `/projects` (detail) | `/api/v1/documents/upload-intents` | `POST` |
| Download Document | `/projects` (detail) | `/api/v1/documents/:id/download-url` | `GET` |

---

## Due Diligence / Assessors

| Frontend Page | Route | Backend Endpoint | Method |
|--------------|-------|-----------------|--------|
| DD Case Status | `/projects` (detail) | `/api/v1/projects/:id/full` | `GET` |

The `dueDiligence` relation is included in the full project response.

---

## Orphaned Pages → Routes to Add

These pages exist in `src/pages/` but have **no route** in `App.tsx`:

| Page | Add Route | Backend Endpoint |
|------|-----------|-----------------|
| `AuditLogs.tsx` | `/audit` | `/api/v1/admin/audit-logs` |
| `ComplianceCenter.tsx` | `/compliance` | `/api/v1/admin/compliance/*` |
| `ProviderOversight.tsx` | `/providers` | `/api/v1/admin/assessors` |
| `Transactions.tsx` | `/transactions` | `/api/v1/transactions` |
| `UserManagement.tsx` | `/users` | `/api/v1/users` |

> ⚠️ **Note:** Audit, Compliance, Provider, User Management are **admin-only** features. Entrepreneurs should NOT see these. Consider hiding them from the navbar or gating by role.

---

## Zustand Store Architecture Recommendation

```typescript
// stores/auth.store.ts
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

// stores/project.store.ts
interface ProjectState {
  projects: Project[];
  dashboard: DashboardData | null;
  selectedProject: Project | null;
  analytics: AnalyticsData | null;
  fetchDashboard: () => Promise<void>;
  fetchProjects: (filters?) => Promise<void>;
  createProject: (data: CreateProjectDto) => Promise<void>;
  fetchAnalytics: (projectId: string) => Promise<void>;
}

// stores/deal.store.ts
// stores/transaction.store.ts
// stores/dispute.store.ts
// stores/message.store.ts
// stores/notification.store.ts
// stores/user.store.ts
```

---

## Input Validators Needed (Frontend)

Use `zod` or `yup` for form validation. Key schemas:

### CreateProjectSchema
```typescript
const CreateProjectSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(50).max(5000),
  sector: z.enum(["SOLAR", "WIND", "HYDRO", "EV", "BIOGAS", "AGRICULTURE"]),
  country: z.string().min(2),
  fundingTarget: z.number().positive(),
  minInvestment: z.number().positive().optional(),
  valuation: z.number().positive().optional(),
  returnTarget: z.number().min(0).max(100).optional(),
  equityOffered: z.number().min(0).max(100).optional(),
  sdgs: z.array(z.number()).optional(),
  teamMembers: z.array(z.object({ name: z.string(), role: z.string(), email: z.string().email() })).optional(),
});
```

### DisputeSchema
```typescript
const DisputeSchema = z.object({
  type: z.enum(["PAYMENT", "DELIVERY", "QUALITY", "CONTRACT", "OTHER"]),
  title: z.string().min(5).max(200),
  description: z.string().min(20).max(5000),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
});
```

---

## Axios Instance Setup

```typescript
// lib/axios.ts
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      // Try refresh token
      // If refresh fails, redirect to login
    }
    return Promise.reject(err);
  }
);

export default api;
```

---

## Build Verification

```bash
# Backend
nx run api:build              # ✅ PASS
nx run worker-webhooks:build  # ✅ PASS
nx run worker-notifications:build # ✅ PASS
npx prisma generate           # ✅ PASS
```
