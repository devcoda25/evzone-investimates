# EVzone Backend — Complete API Specification

## Overview
Complete NestJS backend for the EVzone Global Green Finance Platform. Serves 4 frontend applications: Investor, Entrepreneur, Assessor, and Admin.

## Architecture
- **Framework**: NestJS 10 + TypeScript 5
- **Database**: PostgreSQL 16 + TypeORM 0.3
- **Auth**: JWT (access + refresh tokens) + bcrypt + Passport
- **Validation**: class-validator + class-transformer + ValidationPipe
- **Security**: Helmet + CORS + Throttler (rate limiting) + RBAC
- **Docs**: Swagger/OpenAPI 3.0
- **Deployment**: Docker + docker-compose

## Module Structure
```
src/
├── main.ts                    # Entry point
├── app.module.ts              # Root module
├── config/                    # Configuration
│   ├── app.config.ts
│   ├── database.config.ts
│   └── jwt.config.ts
├── common/                    # Shared utilities
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   └── pipes/
├── database/                  # DB config, migrations, seeder
│   ├── data-source.ts
│   └── seeder/
├── modules/
│   ├── auth/                  # Authentication
│   ├── users/                 # Users & profiles
│   ├── projects/              # Projects, deals, campaigns
│   ├── investments/           # Investments, portfolio, transactions
│   ├── due-diligence/         # Assessor engagements & reports
│   ├── admin/                 # Admin oversight (compliance, risk, disputes, audit)
│   ├── notifications/         # In-app notifications
│   ├── documents/             # File uploads
│   └── messaging/             # Internal messaging
```

## Core Entities

### User
```typescript
@Entity('users')
class User {
  id: UUID (PK)
  email: string (unique)
  password: string (bcrypt hash)
  firstName: string
  lastName: string
  avatar: string (URL, nullable)
  phone: string (nullable)
  role: enum [INVESTOR, ENTREPRENEUR, PROVIDER, ADMIN] (default: INVESTOR)
  status: enum [ACTIVE, SUSPENDED, PENDING_VERIFICATION, BLOCKED] (default: PENDING_VERIFICATION)
  kycStatus: enum [NOT_STARTED, PENDING, VERIFIED, REJECTED] (default: NOT_STARTED)
  kycSubmittedAt: Date (nullable)
  kycVerifiedAt: Date (nullable)
  country: string (nullable)
  city: string (nullable)
  bio: text (nullable)
  preferences: jsonb (theme, language, notifications)
  lastLoginAt: Date (nullable)
  loginAttempts: number (default: 0)
  lockoutUntil: Date (nullable)
  createdAt: Date
  updatedAt: Date
  deletedAt: Date (nullable, soft delete)
  
  // Relations
  investorProfile?: InvestorProfile
  entrepreneurProfile?: EntrepreneurProfile
  assessorProfile?: AssessorProfile
  investments?: Investment[]
  projects?: Project[] (as entrepreneur)
  messagesSent?: Message[]
  messagesReceived?: Message[]
  notifications?: Notification[]
  auditLogs?: AuditLog[]
}
```

### InvestorProfile
```typescript
@Entity('investor_profiles')
class InvestorProfile {
  id: UUID (PK)
  userId: UUID (FK -> users)
  investorType: enum [INDIVIDUAL, INSTITUTIONAL, IMPACT_FUND, CORPORATE]
  riskTolerance: enum [CONSERVATIVE, MODERATE, AGGRESSIVE]
  annualIncome: decimal (nullable)
  netWorth: decimal (nullable)
  accreditationStatus: boolean (default: false)
  investmentGoals: text[] (nullable)
  preferredSectors: string[] (nullable)
  totalInvested: decimal (default: 0)
  totalReturns: decimal (default: 0)
  activeInvestments: number (default: 0)
  completedInvestments: number (default: 0)
  esgPreferences: jsonb (nullable)
  // ...timestamps
}
```

### EntrepreneurProfile
```typescript
@Entity('entrepreneur_profiles')
class EntrepreneurProfile {
  id: UUID (PK)
  userId: UUID (FK -> users)
  companyName: string
  companyRegistration: string (nullable)
  companyWebsite: string (nullable)
  industry: string
  foundedYear: number (nullable)
  teamSize: number (nullable)
  stage: enum [IDEA, MVP, EARLY_REVENUE, GROWTH, SCALE]
  pitchDeck: string (URL, nullable)
  previousFunding: decimal (default: 0)
  totalRaised: decimal (default: 0)
  activeCampaigns: number (default: 0)
  completedCampaigns: number (default: 0)
  // ...timestamps
}
```

### AssessorProfile
```typescript
@Entity('assessor_profiles')
class AssessorProfile {
  id: UUID (PK)
  userId: UUID (FK -> users)
  organizationName: string
  organizationType: enum [INDIVIDUAL_CONSULTANT, FIRM, NGO, GOVERNMENT_BODY, ACADEMIC]
  specialties: string[] (e.g. ['ESG_AUDIT', 'FINANCIAL_DUE_DILIGENCE', 'TECHNICAL_ASSESSMENT'])
  credentials: jsonb (certifications, degrees)
  yearsOfExperience: number
  completedEngagements: number (default: 0)
  rating: decimal (0-5, default: 0)
  availabilityStatus: enum [AVAILABLE, BUSY, ON_LEAVE]
  hourlyRate: decimal (nullable)
  serviceRegions: string[] (nullable)
  bio: text (nullable)
  // ...timestamps
}
```

### Project
```typescript
@Entity('projects')
class Project {
  id: UUID (PK)
  entrepreneurId: UUID (FK -> users)
  title: string
  slug: string (unique, for URLs)
  subtitle: string (nullable)
  description: text
  longDescription: text (nullable)
  coverImage: string (URL, nullable)
  galleryImages: string[] (nullable)
  videoUrl: string (nullable)
  status: enum [DRAFT, UNDER_REVIEW, ACTIVE, FUNDED, COMPLETED, CANCELLED] (default: DRAFT)
  
  // Funding
  fundingGoal: decimal
  fundingRaised: decimal (default: 0)
  minInvestment: decimal (default: 100)
  maxInvestment: decimal (nullable)
  currency: string (default: 'USD')
  equityOffered: decimal (nullable) // percentage
  
  // Location
  country: string
  city: string (nullable)
  region: string (nullable)
  coordinates: point (nullable, PostGIS)
  
  // Categorization
  sector: enum [SOLAR, WIND, HYDRO, BIOMASS, EV_CHARGING, GREEN_HYDROGEN, ENERGY_STORAGE, OTHER]
  stage: enum [CONCEPT, FEASIBILITY, CONSTRUCTION, OPERATIONAL, EXPANSION]
  impactMetrics: jsonb (CO2 reduction, jobs created, households served, etc.)
  sdgs: number[] (SDG goal numbers)
  
  // Timeline
  campaignStartDate: Date (nullable)
  campaignEndDate: Date (nullable)
  projectStartDate: Date (nullable)
  projectEndDate: Date (nullable)
  
  // Meta
  documents: ProjectDocument[]
  milestones: Milestone[]
  teamMembers: jsonb (nullable)
  risks: jsonb (nullable)
  faqs: jsonb (nullable)
  viewCount: number (default: 0)
  featured: boolean (default: false)
  featuredOrder: number (nullable)
  
  // Due diligence
  dueDiligenceStatus: enum [NOT_STARTED, IN_PROGRESS, COMPLETED, FAILED] (default: NOT_STARTED)
  dueDiligenceScore: number (nullable, 0-100)
  assessorAssignedId: UUID (nullable, FK -> users)
  
  createdAt: Date
  updatedAt: Date
  deletedAt: Date (nullable)
}
```

### Milestone
```typescript
@Entity('milestones')
class Milestone {
  id: UUID (PK)
  projectId: UUID (FK -> projects)
  title: string
  description: text (nullable)
  order: number
  status: enum [PENDING, IN_PROGRESS, COMPLETED, OVERDUE]
  deliverables: jsonb (nullable)
  fundingTranche: decimal (nullable)
  dueDate: Date
  completedAt: Date (nullable)
  verifiedBy: UUID (nullable, FK -> users)
  // ...timestamps
}
```

### Investment
```typescript
@Entity('investments')
class Investment {
  id: UUID (PK)
  investorId: UUID (FK -> users)
  projectId: UUID (FK -> projects)
  amount: decimal
  currency: string (default: 'USD')
  status: enum [PENDING, CONFIRMED, CANCELLED, REFUNDED]
  paymentMethod: enum [BANK_TRANSFER, CARD, CRYPTO, MOBILE_MONEY]
  transactionReference: string (unique, nullable)
  equityPercentage: decimal (nullable)
  expectedReturns: decimal (nullable)
  actualReturns: decimal (nullable, default: 0)
  investedAt: Date
  confirmedAt: Date (nullable)
  // ...timestamps
}
```

### Transaction
```typescript
@Entity('transactions')
class Transaction {
  id: UUID (PK)
  userId: UUID (FK -> users, nullable)
  investmentId: UUID (FK -> investments, nullable)
  projectId: UUID (FK -> projects, nullable)
  type: enum [DEPOSIT, WITHDRAWAL, INVESTMENT, RETURN, FEE, REFUND]
  amount: decimal
  currency: string
  status: enum [PENDING, COMPLETED, FAILED, CANCELLED]
  paymentMethod: enum [BANK_TRANSFER, CARD, CRYPTO, MOBILE_MONEY]
  paymentProvider: string (nullable, e.g. 'stripe', 'flutterwave')
  providerTransactionId: string (nullable)
  metadata: jsonb (nullable)
  processedAt: Date (nullable)
  // ...timestamps
}
```

### DueDiligenceEngagement
```typescript
@Entity('due_diligence_engagements')
class DueDiligenceEngagement {
  id: UUID (PK)
  projectId: UUID (FK -> projects)
  providerId: UUID (FK -> users)
  status: enum [ASSIGNED, IN_PROGRESS, UNDER_REVIEW, COMPLETED, REJECTED]
  
  // Assessment areas
  financialAssessment: jsonb (score, findings, rating)
  technicalAssessment: jsonb
  legalAssessment: jsonb
  esgAssessment: jsonb
  marketAssessment: jsonb
  overallScore: number (nullable, 0-100)
  riskLevel: enum [LOW, MEDIUM, HIGH, CRITICAL] (nullable)
  
  // Timeline
  assignedAt: Date
  startedAt: Date (nullable)
  submittedAt: Date (nullable)
  reviewedAt: Date (nullable)
  dueDate: Date
  
  // Documents
  reportDocuments: jsonb (nullable)
  
  notes: text (nullable)
  // ...timestamps
}
```

### ComplianceAlert
```typescript
@Entity('compliance_alerts')
class ComplianceAlert {
  id: UUID (PK)
  type: enum [KYC_ISSUE, AML_FLAG, DOCUMENT_EXPIRY, REGULATORY_CHANGE, MANUAL_REVIEW]
  severity: enum [LOW, MEDIUM, HIGH, CRITICAL]
  entityType: enum [USER, PROJECT, TRANSACTION, PROVIDER]
  entityId: UUID
  title: string
  description: text
  status: enum [OPEN, UNDER_REVIEW, RESOLVED, DISMISSED] (default: OPEN)
  assignedTo: UUID (nullable, FK -> users)
  resolvedBy: UUID (nullable, FK -> users)
  resolvedAt: Date (nullable)
  resolutionNotes: text (nullable)
  // ...timestamps
}
```

### Dispute
```typescript
@Entity('disputes')
class Dispute {
  id: UUID (PK)
  initiatorId: UUID (FK -> users)
  respondentId: UUID (FK -> users, nullable)
  projectId: UUID (FK -> projects, nullable)
  investmentId: UUID (FK -> investments, nullable)
  type: enum [PAYMENT, PROJECT_DELIVERY, FRAUD, COMMUNICATION, OTHER]
  title: string
  description: text
  evidence: jsonb (nullable)
  status: enum [OPEN, UNDER_REVIEW, MEDIATION, RESOLVED, ESCALATED, CLOSED]
  resolution: text (nullable)
  resolvedBy: UUID (nullable, FK -> users)
  resolvedAt: Date (nullable)
  // ...timestamps
}
```

### AuditLog
```typescript
@Entity('audit_logs')
class AuditLog {
  id: UUID (PK)
  userId: UUID (FK -> users, nullable)
  action: string (e.g. 'USER_LOGIN', 'PROJECT_CREATED', 'INVESTMENT_MADE')
  entityType: string (nullable)
  entityId: UUID (nullable)
  oldValues: jsonb (nullable)
  newValues: jsonb (nullable)
  ipAddress: string (nullable)
  userAgent: string (nullable)
  metadata: jsonb (nullable)
  createdAt: Date
}
```

### Notification
```typescript
@Entity('notifications')
class Notification {
  id: UUID (PK)
  userId: UUID (FK -> users)
  type: enum [PROJECT_UPDATE, INVESTMENT_UPDATE, DUE_DILIGENCE, COMPLIANCE, MESSAGE, SYSTEM]
  title: string
  message: text
  data: jsonb (nullable)
  read: boolean (default: false)
  readAt: Date (nullable)
  actionUrl: string (nullable)
  // ...timestamps
}
```

### Message
```typescript
@Entity('messages')
class Message {
  id: UUID (PK)
  senderId: UUID (FK -> users)
  recipientId: UUID (FK -> users)
  projectId: UUID (FK -> projects, nullable)
  content: text
  attachments: jsonb (nullable)
  read: boolean (default: false)
  readAt: Date (nullable)
  // ...timestamps
}
```

### RefreshToken
```typescript
@Entity('refresh_tokens')
class RefreshToken {
  id: UUID (PK)
  userId: UUID (FK -> users)
  token: string (hashed)
  expiresAt: Date
  createdAt: Date
  revokedAt: Date (nullable)
  replacedBy: string (nullable)
  ipAddress: string (nullable)
  userAgent: string (nullable)
}
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
| POST | `/due-diligence/engagements/:id/submit` | Submit report | PROVIDER |
| POST | `/due-diligence/engagements/:id/review` | Review report | ADMIN |
| GET | `/due-diligence/projects` | Available projects to assess | PROVIDER |
| GET | `/due-diligence/projects/:id/assessments` | Get assessments | PROVIDER/ADMIN |
| GET | `/due-diligence/assessors` | List assessors | ADMIN |
| GET | `/due-diligence/assessors/:id` | Get assessor profile | ADMIN |
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
7. **SQL Injection**: TypeORM parameterized queries
8. **Account Lockout**: 5 failed login attempts = 15min lockout
9. **Token Blacklisting**: Refresh tokens tracked in DB, revoked on logout
10. **Audit Logging**: All sensitive operations logged
11. **Soft Delete**: No data permanently deleted
12. **File Upload**: Type validation, size limits (10MB), malware scan ready
