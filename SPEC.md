# EVzone Backend Foundation Specification

## Summary

The backend is a modular NestJS platform organized as an Nx workspace. It starts as a modular monolith with event-driven workers, Prisma/PostgreSQL persistence, Kafka outbox publishing, Redis operational helpers, and S3-compatible object storage.

## Deployable Apps

- `apps/api`: REST API for auth, users, projects, documents/media, due diligence, investments, admin, notifications, and messaging.
- `apps/worker-events`: publishes pending outbox events to Kafka.
- `apps/worker-media`: verifies uploaded media and marks ready in the current scaffold.
- `apps/worker-compliance`: queues open compliance cases for manual review in the current scaffold.
- `apps/scheduler`: scheduled deal/deadline tasks.

## Shared Libraries

- `libs/common`: decorators, pagination, filters, interceptors, request types, ledger balance guard.
- `libs/database`: Prisma service/module and transaction helper.
- `libs/auth`: JWT guard, roles guard, owner/admin guard, JWT payload types.
- `libs/permissions`: tenant and owner authorization helpers.
- `libs/events`: outbox service and Kafka publisher.
- `libs/storage`: S3-compatible signed URL and object upload service.
- `libs/redis`: Redis helper service for cache/idempotency/short locks.
- `libs/audit`: audit log writer.
- `libs/config`: environment-backed configuration factories.

## Data Model

Prisma models cover tenants, users, memberships, role-specific profiles, refresh/reset tokens, projects, milestones, media assets, documents, due-diligence cases/tasks, deals, investments, transactions, ledger accounts/entries, compliance alerts/cases, disputes, audit logs, notifications, messages, and outbox events.

`PlatformRole.ASSESSOR` is the internal technical role. "Provider" remains only as a legacy display/business label where needed.

## API Compatibility

Existing high-level routes remain under `/api/v1`:

- `/auth`
- `/users`
- `/projects`
- `/projects/:id/gallery`
- `/milestones`
- `/documents`
- `/investments`
- `/transactions`
- `/due-diligence`
- `/admin`
- `/notifications`
- `/messages`

Responses are DTO/plain-object responses, not raw persistence models.

## Implementation Rules

- PostgreSQL/Prisma is the source of truth.
- Kafka is used for durable platform events via the outbox pattern.
- Redis is not used for critical business workflows.
- Object storage holds file bytes; PostgreSQL holds metadata.
- Financial operations require idempotency.
- Investment commitments create balanced double-entry ledger records.
- Sensitive actions should write audit records as the platform matures.
- Tenant and ownership checks are required for protected resource access.

## Verification

Required checks:

```bash
npm run lint
npm run build
npm test
npm run prisma:validate
npm run prisma:generate
```

## API Endpoints

### Auth Module (`/api/auth`)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/register` | Register new user | Public |
| POST | `/auth/login` | Login, get tokens | Public |
| POST | `/auth/refresh` | Refresh access token | Public (refresh token) |
| POST | `/auth/logout` | Logout, revoke tokens | JWT |
| POST | `/auth/logout-all` | Logout from all devices | JWT |
| GET | `/auth/me` | Get current user | JWT |
| POST | `/auth/change-password` | Change password | JWT |
| POST | `/auth/forgot-password` | Request password reset | Public |
| POST | `/auth/reset-password` | Reset password with token | Public |

### Users Module (`/api/users`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/users` | List users (paginated, filterable) | ADMIN |
| GET | `/users/:id` | Get user by ID | ADMIN/own |
| PATCH | `/users/:id` | Update user | ADMIN/own |
| DELETE | `/users/:id` | Soft delete user | ADMIN |
| POST | `/users/:id/verify` | Verify user KYC | ADMIN |
| POST | `/users/:id/suspend` | Suspend user | ADMIN |
| POST | `/users/:id/unsuspend` | Unsuspend user | ADMIN |
| GET | `/users/:id/profile` | Get full profile | ADMIN/own |
| PATCH | `/users/:id/profile` | Update profile | ADMIN/own |
| POST | `/users/:id/kyc` | Submit KYC documents | own |
| GET | `/users/:id/kyc` | Get KYC status | ADMIN/own |
| GET | `/users/stats/overview` | User statistics | ADMIN |

### Projects Module (`/api/projects`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/projects` | List projects (paginated, filterable) | Public (filtered) |
| GET | `/projects/featured` | Get featured projects | Public |
| GET | `/projects/:id` | Get project by ID | Public (filtered) |
| GET | `/projects/:id/full` | Get project with all relations | JWT |
| POST | `/projects` | Create project | ENTREPRENEUR |
| PATCH | `/projects/:id` | Update project | own ENTREPRENEUR |
| DELETE | `/projects/:id` | Soft delete project | own/ADMIN |
| POST | `/projects/:id/submit` | Submit for review | own |
| POST | `/projects/:id/approve` | Approve project (admin) | ADMIN |
| POST | `/projects/:id/reject` | Reject project | ADMIN |
| POST | `/projects/:id/feature` | Toggle featured | ADMIN |
| GET | `/projects/:id/milestones` | List milestones | JWT |
| POST | `/projects/:id/milestones` | Create milestone | own |
| PATCH | `/milestones/:id` | Update milestone | own/ADMIN |
| POST | `/milestones/:id/complete` | Mark complete | own/assessor |
| GET | `/projects/:id/documents` | List project documents | JWT |
| POST | `/projects/:id/documents` | Upload document | own |
| GET | `/projects/stats/overview` | Project statistics | ADMIN |

### Investments Module (`/api/investments`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/investments` | Make investment | INVESTOR |
| GET | `/investments` | List my investments | INVESTOR/ADMIN |
| GET | `/investments/:id` | Get investment details | own/ADMIN |
| PATCH | `/investments/:id` | Update investment | ADMIN |
| POST | `/investments/:id/cancel` | Cancel investment | own |
| GET | `/investments/portfolio` | Portfolio dashboard | INVESTOR |
| GET | `/investments/portfolio/stats` | Portfolio statistics | INVESTOR |
| GET | `/investments/portfolio/performance` | Performance over time | INVESTOR |
| GET | `/investments/project/:projectId` | Get investments for project | ENTREPRENEUR/ADMIN |
| GET | `/transactions` | List transactions | own/ADMIN |
| GET | `/transactions/:id` | Get transaction | own/ADMIN |
| POST | `/transactions/deposit` | Create deposit | JWT |
| POST | `/transactions/withdraw` | Request withdrawal | JWT |

### Due Diligence Module (`/api/due-diligence`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/due-diligence/engagements` | List engagements | PROVIDER/ADMIN |
| GET | `/due-diligence/engagements/:id` | Get engagement | PROVIDER/ADMIN |
| POST | `/due-diligence/engagements` | Create engagement | ADMIN |
| PATCH | `/due-diligence/engagements/:id` | Update engagement | PROVIDER/ADMIN |
| POST | `/due-diligence/engagements/:id/start` | Start engagement | PROVIDER |
| POST | `/due-diligence/engagements/:id/submit` | Submit report | PROVIDER |
| POST | `/due-diligence/engagements/:id/review` | Review report | ADMIN |
| GET | `/due-diligence/projects` | Available projects to assess | PROVIDER |
| GET | `/due-diligence/assessors` | List assessors | ADMIN |
| GET | `/due-diligence/stats/overview` | DD statistics | ADMIN |

### Admin Module (`/api/admin`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/admin/dashboard` | Admin dashboard metrics | ADMIN |
| GET | `/admin/compliance/alerts` | Compliance alerts | ADMIN |
| GET | `/admin/compliance/alerts/:id` | Alert detail | ADMIN |
| PATCH | `/admin/compliance/alerts/:id` | Update alert | ADMIN |
| GET | `/admin/compliance/stats` | Compliance statistics | ADMIN |
| GET | `/admin/risk/projects` | Risk assessment list | ADMIN |
| GET | `/admin/risk/projects/:id` | Project risk details | ADMIN |
| POST | `/admin/risk/projects/:id/assess` | Submit risk assessment | ADMIN |
| GET | `/admin/risk/stats` | Risk statistics | ADMIN |
| GET | `/admin/disputes` | List disputes | ADMIN |
| GET | `/admin/disputes/:id` | Dispute detail | ADMIN |
| PATCH | `/admin/disputes/:id` | Update dispute | ADMIN |
| POST | `/admin/disputes/:id/resolve` | Resolve dispute | ADMIN |
| GET | `/admin/audit-logs` | Audit log entries | ADMIN |
| GET | `/admin/audit-logs/:id` | Audit log detail | ADMIN |
| GET | `/admin/assessors` | Assessor oversight list | ADMIN |
| GET | `/admin/assessors/:id` | Assessor oversight detail | ADMIN |
| PATCH | `/admin/assessors/:id/verify` | Verify assessor | ADMIN |
| POST | `/admin/assessors/:id/suspend` | Suspend assessor | ADMIN |
| GET | `/admin/transactions` | All transactions | ADMIN |
| GET | `/admin/transactions/stats` | Transaction stats | ADMIN |
| GET | `/admin/user-activities` | User activity feed | ADMIN |

### Notifications Module (`/api/notifications`)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/notifications` | My notifications | JWT |
| GET | `/notifications/unread-count` | Unread count | JWT |
| PATCH | `/notifications/:id/read` | Mark as read | own |
| PATCH | `/notifications/read-all` | Mark all as read | JWT |
| DELETE | `/notifications/:id` | Delete notification | own |

### Messaging Module (`/api/messages`)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/messages/conversations` | My conversations | JWT |
| GET | `/messages/conversations/:userId` | Messages with user | JWT |
| POST | `/messages` | Send message | JWT |
| PATCH | `/messages/:id/read` | Mark as read | JWT |
| GET | `/messages/unread-count` | Unread count | JWT |

### Documents Module (`/api/documents`)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/documents/upload` | Upload file | JWT |
| GET | `/documents/:id` | Get file | JWT |
| DELETE | `/documents/:id` | Delete file | own/ADMIN |

## Authentication Flow
1. **Register**: POST /auth/register → returns { user, accessToken, refreshToken }
2. **Login**: POST /auth/login → returns { user, accessToken, refreshToken }
3. **Access Token**: Sent in Authorization: Bearer <token> header. 15min expiry.
4. **Refresh Token**: Sent in httpOnly cookie or body. 7 day expiry. Used to get new access token.
5. **Logout**: POST /auth/logout → revokes refresh token, blacklists access token
6. **Logout All**: POST /auth/logout-all → revokes all refresh tokens for user

## Authorization Matrix
| Endpoint Pattern | INVESTOR | ENTREPRENEUR | PROVIDER | ADMIN |
|------------------|----------|--------------|----------|-------|
| /auth/* | All | All | All | All |
| /users/:id (own) | Yes | Yes | Yes | Yes |
| /users/:id (other) | No | No | No | Yes |
| /projects (list) | Yes | Yes | Yes | Yes |
| /projects (create) | No | Yes | No | No |
| /projects/:id (update own) | No | Yes | No | No |
| /investments | Yes | No | No | Yes |
| /investments/project/:id | No | Yes (own) | No | Yes |
| /due-diligence/* | No | No | Yes | Yes |
| /admin/* | No | No | No | Yes |
| /notifications/* | Yes | Yes | Yes | Yes |
| /messages/* | Yes | Yes | Yes | Yes |

## Security Measures
1. **Password Hashing**: bcrypt with 12 rounds
2. **JWT**: Short-lived access tokens (15min), long-lived refresh tokens (7d)
3. **Rate Limiting**: 100 requests/minute per IP; 10 auth attempts/minute
4. **Helmet**: Security headers (HSTS, CSP, X-Frame-Options, etc.)
5. **CORS**: Whitelist frontend URLs only
6. **Input Validation**: class-validator on all DTOs
7. **SQL Injection**: Prisma parameterized queries
8. **Account Lockout**: 5 failed login attempts = 15min lockout
9. **Token Blacklisting**: Refresh tokens tracked in DB, revoked on logout
10. **Audit Logging**: All sensitive operations logged
11. **Soft Delete**: No data permanently deleted
12. **File Upload**: Type validation, size limits (10MB), malware scan ready