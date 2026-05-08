# EVzone Backend API Endpoint Map

This map reflects the Prisma/Nx backend foundation. Routes are served under `/api/v1`.

Legend:

| Symbol | Meaning |
| --- | --- |
| Public | No JWT required |
| Auth | JWT required |
| Role | JWT plus role check |

## Auth

| Endpoint | Method | Access | Notes |
| --- | --- | --- | --- |
| `/auth/register` | POST | Public | Creates user, tenant membership, profile, and tokens |
| `/auth/login` | POST | Public | Email/password login |
| `/auth/refresh` | POST | Public | Rotates refresh token |
| `/auth/logout` | POST | Auth | Revokes active refresh tokens |
| `/auth/me` | GET | Auth | Current user summary |
| `/auth/change-password` | POST | Auth | Changes password and revokes tokens |
| `/auth/forgot-password` | POST | Public | Creates reset token |
| `/auth/reset-password` | POST | Public | Consumes reset token |

## Users

| Endpoint | Method | Access | Notes |
| --- | --- | --- | --- |
| `/users` | GET | Admin/Compliance/Support | Tenant-scoped user list |
| `/users/stats/overview` | GET | Admin/Compliance | Aggregates by role/status/KYC |
| `/users/:id` | GET/PATCH | Auth | Owner/admin access |
| `/users/:id` | DELETE | Admin | Soft delete |
| `/users/:id/verify` | POST | Admin/Compliance | KYC decision |
| `/users/:id/suspend` | POST | Admin | Suspend user |
| `/users/:id/unsuspend` | POST | Admin | Reactivate user |
| `/users/:id/profile` | GET/PATCH | Auth | Owner/admin access |
| `/users/:id/kyc` | GET/POST | Auth | KYC status/submission |

## Projects And Media

| Endpoint | Method | Access | Notes |
| --- | --- | --- | --- |
| `/projects` | GET | Public | Public discovery |
| `/projects/featured` | GET | Public | Featured projects |
| `/projects/stats/overview` | GET | Admin | Project stats |
| `/projects` | POST | Entrepreneur/Admin | Create project |
| `/projects/:id` | GET | Public | Public project detail |
| `/projects/:id/full` | GET | Auth | Tenant/owner/admin full detail |
| `/projects/:id` | PATCH/DELETE | Auth | Owner/admin |
| `/projects/:id/submit` | POST | Entrepreneur | Submit for review |
| `/projects/:id/approve` | POST | Admin | Approve/list as active |
| `/projects/:id/reject` | POST | Admin | Reject |
| `/projects/:id/feature` | POST | Admin | Toggle featured |
| `/projects/:id/gallery` | GET | Public | Gallery metadata |
| `/projects/:id/gallery/upload-intents` | POST | Owner/Admin | Signed upload URL |
| `/projects/:projectId/gallery/:mediaId` | PATCH/DELETE | Owner/Admin | Update/delete media metadata |
| `/projects/:id/gallery/reorder` | POST | Owner/Admin | Sort gallery |
| `/projects/:id/milestones` | GET/POST | Auth | Milestones |
| `/milestones/:id` | PATCH | Auth | Owner/admin |
| `/milestones/:id/complete` | POST | Owner/Admin/Assessor | Complete milestone |

## Documents

| Endpoint | Method | Access | Notes |
| --- | --- | --- | --- |
| `/documents` | GET | Auth | Current user documents |
| `/documents/upload-intents` | POST | Auth | Signed upload URL |
| `/documents/upload` | POST | Auth | Compatibility multipart upload |
| `/documents/:id` | GET/DELETE | Owner/Admin | Metadata/delete |
| `/documents/:id/download-url` | GET | Owner/Admin | Signed read URL |

## Investments And Transactions

| Endpoint | Method | Access | Notes |
| --- | --- | --- | --- |
| `/investments` | POST | Investor | Idempotent commitment and ledger entries |
| `/investments` | GET | Investor/Admin | Own/all investments |
| `/investments/portfolio` | GET | Investor | Portfolio grouping |
| `/investments/portfolio/stats` | GET | Investor | Portfolio totals |
| `/investments/portfolio/performance` | GET | Investor | Timeline scaffold |
| `/investments/project/:projectId` | GET | Entrepreneur/Admin | Project investments |
| `/investments/:id` | GET | Owner/Admin/Project owner | Investment detail |
| `/investments/:id` | PATCH | Admin | Update status |
| `/investments/:id/cancel` | POST | Investor | Cancel own pending commitment |
| `/investments/:id/confirm` | POST | Admin | Confirm investment |
| `/transactions` | GET | Auth | Own/all for admin |
| `/transactions/stats` | GET | Admin | Transaction stats |
| `/transactions/deposit` | POST | Auth | Deposit placeholder |
| `/transactions/withdraw` | POST | Auth | Withdrawal placeholder |
| `/transactions/:id` | GET | Owner/Admin | Transaction detail |
| `/transactions/:id/related` | GET | Owner/Admin | Related project transactions |
| `/transactions/:id/approve|hold|escalate|reverse|process` | POST | Admin | Admin transaction actions |

## Due Diligence

| Endpoint | Method | Access | Notes |
| --- | --- | --- | --- |
| `/due-diligence/engagements` | GET/POST | Assessor/Admin | Case list/create; `providerId` accepted as legacy assessor ID |
| `/due-diligence/engagements/:id` | GET/PATCH | Assessor/Admin | Case detail/update |
| `/due-diligence/engagements/:id/start` | POST | Assessor | Start assigned case |
| `/due-diligence/engagements/:id/submit` | POST | Assessor | Submit report |
| `/due-diligence/engagements/:id/review` | POST | Admin | Approve/reject |
| `/due-diligence/projects` | GET | Assessor/Admin | Available projects |
| `/due-diligence/assessors` | GET | Admin | Assessor list |
| `/due-diligence/stats/overview` | GET | Admin | Case stats |

## Admin, Notifications, Messages

| Endpoint | Method | Access | Notes |
| --- | --- | --- | --- |
| `/admin/dashboard` | GET | Admin/Compliance | Dashboard metrics |
| `/admin/compliance/alerts` | GET | Admin/Compliance | Alerts |
| `/admin/compliance/alerts/:id` | GET/PATCH | Admin/Compliance | Alert detail/update |
| `/admin/compliance/stats` | GET | Admin/Compliance | Compliance stats |
| `/admin/risk/projects` | GET | Admin/Compliance | Risk queue |
| `/admin/risk/projects/:id/assess` | POST | Admin/Compliance | Risk assessment |
| `/admin/disputes` | GET | Admin/Compliance | Disputes |
| `/admin/disputes/:id` | GET/PATCH | Admin/Compliance | Dispute detail/update |
| `/admin/disputes/:id/resolve` | POST | Admin/Compliance | Resolve dispute |
| `/admin/audit-logs` | GET | Admin/Compliance | Audit log |
| `/admin/assessors` | GET | Admin/Compliance | Assessor list |
| `/admin/assessors/:id` | GET | Admin/Compliance | Assessor detail |
| `/admin/assessors/:id/verify` | PATCH | Admin/Compliance | Verify assessor |
| `/admin/assessors/:id/suspend` | POST | Admin/Compliance | Suspend assessor |
| `/admin/transactions` | GET | Admin/Compliance | Transactions |
| `/admin/transactions/stats` | GET | Admin/Compliance | Transaction stats |
| `/notifications` | GET/POST | Auth | User notifications/system create |
| `/notifications/unread-count` | GET | Auth | Unread count |
| `/notifications/read-all` | PATCH | Auth | Mark all read |
| `/notifications/:id/read` | PATCH | Auth | Mark one read |
| `/messages/conversations` | GET | Auth | Conversation list |
| `/messages/conversations/:userId` | GET | Auth | Thread |
| `/messages` | POST | Auth | Send |
| `/messages/:id/read` | PATCH | Auth | Mark read |
| `/messages/unread-count` | GET | Auth | Unread count |