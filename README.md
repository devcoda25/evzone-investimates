# EVzone Platform Backend

Complete NestJS REST API powering the EVzone Global Green Finance Platform — serving 4 frontend applications: **Investor**, **Entrepreneur**, **Provider**, and **Admin**.

---

## Quick Start (Docker — Recommended)

The fastest way to get running:

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Start everything (PostgreSQL + Redis + API)
docker-compose up -d

# 3. The API will be available at:
#    API:   http://localhost:3000/api
#    Docs:  http://localhost:3000/docs
#    DB:    localhost:5432
```

To seed demo data:
```bash
docker exec -it evzone-api npm run seed
```

To view logs:
```bash
docker-compose logs -f api
```

To stop:
```bash
docker-compose down
```

---

## Manual Setup (Development)

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Redis 7 (optional, for caching)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your database credentials
```

### 3. Create Database
```bash
createdb evzone_platform
```

### 4. Run Migrations
```bash
npm run migration:run
```

### 5. Start Development Server
```bash
npm run start:dev
```

The API runs at `http://localhost:3000` with hot reload.

### 6. Seed Demo Data (Optional)
```bash
npm run seed
```

This creates 8 users, 9 projects, investments, transactions, due diligence engagements, compliance alerts, disputes, and more.

### 7. View API Documentation
Open `http://localhost:3000/docs` for interactive Swagger UI.

---

## Default Demo Login Credentials

| Role | Email | Password |
|------|-------|----------|
| **Admin** | `admin@evzone.com` | `Admin123!` |
| **Investor** | `sarah.chen@email.com` | `Investor123!` |
| **Investor** | `marcus.johnson@email.com` | `Investor123!` |
| **Entrepreneur** | `amina.osei@email.com` | `Entrepreneur123!` |
| **Entrepreneur** | `raj.patel@email.com` | `Entrepreneur123!` |
| **Provider** | `dr.kwame@email.com` | `Provider123!` |
| **Provider** | `elena.muller@email.com` | `Provider123!` |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS 10 + TypeScript 5 |
| Database | PostgreSQL 16 + TypeORM 0.3 |
| Authentication | JWT (access + refresh) + bcrypt + Passport |
| Validation | class-validator + class-transformer |
| Security | Helmet + CORS + Rate Limiting + RBAC |
| Documentation | Swagger / OpenAPI 3.0 |
| Deployment | Docker + docker-compose |
| Testing | Jest |

---

## Architecture

```
src/
├── main.ts                    # Application entry point
├── app.module.ts              # Root module
│
├── config/                    # Configuration modules
│   ├── app.config.ts          # App settings (port, CORS, uploads)
│   ├── database.config.ts     # PostgreSQL connection
│   └── jwt.config.ts          # JWT secrets and expiry
│
├── common/                    # Shared utilities
│   ├── decorators/            # @CurrentUser, @Roles, @Public
│   ├── enums/                 # All enums (roles, statuses, sectors)
│   ├── filters/               # Global exception filter
│   ├── guards/                # JwtAuthGuard, RolesGuard, OwnerOrAdminGuard
│   ├── interceptors/          # Transform + Logging interceptors
│   └── dto/                   # Pagination DTO
│
├── database/                  # Database configuration
│   ├── database.module.ts     # TypeORM module setup
│   ├── data-source.ts         # CLI data source for migrations
│   └── seeder/                # Demo data seeder
│
└── modules/                   # Domain modules
    ├── auth/                  # Registration, login, JWT, refresh tokens
    ├── users/                 # User CRUD, profiles, KYC
    ├── projects/              # Projects, milestones, campaigns
    ├── investments/           # Investments, portfolio, transactions
    ├── due-diligence/         # Provider engagements, assessments
    ├── admin/                 # Compliance, risk, disputes, audit logs
    ├── notifications/         # In-app notifications
    ├── messaging/             # Internal messaging
    └── documents/             # File uploads
```

---

## API Endpoints

### Authentication (`/api/auth`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | Public | Register new account |
| POST | `/auth/login` | Public | Login, receive JWT tokens |
| POST | `/auth/refresh` | Public | Refresh access token |
| POST | `/auth/logout` | JWT | Logout current session |
| POST | `/auth/logout-all` | JWT | Logout all devices |
| GET | `/auth/me` | JWT | Get current user |
| POST | `/auth/change-password` | JWT | Change password |
| POST | `/auth/forgot-password` | Public | Request password reset |
| POST | `/auth/reset-password` | Public | Reset with token |

### Users (`/api/users`)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/users` | Admin | List all users (paginated, filterable) |
| GET | `/users/:id` | Admin/Self | Get user details |
| PATCH | `/users/:id` | Admin/Self | Update user |
| DELETE | `/users/:id` | Admin | Soft delete user |
| POST | `/users/:id/verify` | Admin | Verify user KYC |
| POST | `/users/:id/suspend` | Admin | Suspend user |
| GET | `/users/:id/profile` | Admin/Self | Get full profile |
| PATCH | `/users/:id/profile` | Self | Update profile |
| POST | `/users/:id/kyc` | Self | Submit KYC |
| GET | `/users/stats/overview` | Admin | User statistics |

### Projects (`/api/projects`)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/projects` | Public | List projects (filtered, paginated) |
| GET | `/projects/featured` | Public | Featured projects |
| GET | `/projects/:id` | Public | Get project |
| GET | `/projects/:id/full` | JWT | Full project details |
| POST | `/projects` | Entrepreneur | Create project |
| PATCH | `/projects/:id` | Owner/Admin | Update project |
| POST | `/projects/:id/submit` | Owner | Submit for review |
| POST | `/projects/:id/approve` | Admin | Approve project |
| POST | `/projects/:id/reject` | Admin | Reject project |
| GET | `/projects/:id/milestones` | JWT | List milestones |
| POST | `/projects/:id/milestones` | Owner | Add milestone |
| GET | `/projects/stats/overview` | Admin | Project statistics |

### Investments (`/api/investments`)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/investments` | Investor | Make investment |
| GET | `/investments` | Investor/Admin | List investments |
| GET | `/investments/portfolio` | Investor | Portfolio dashboard |
| GET | `/investments/portfolio/stats` | Investor | Portfolio stats |
| GET | `/investments/portfolio/performance` | Investor | Performance data |
| POST | `/investments/:id/cancel` | Owner | Cancel investment |

### Transactions (`/api/transactions`)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/transactions` | Self/Admin | List transactions |
| POST | `/transactions/deposit` | JWT | Create deposit |
| POST | `/transactions/withdraw` | JWT | Request withdrawal |

### Due Diligence (`/api/due-diligence`)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/due-diligence/engagements` | Provider/Admin | List engagements |
| POST | `/due-diligence/engagements` | Admin | Create engagement |
| POST | `/due-diligence/engagements/:id/start` | Provider | Start assessment |
| POST | `/due-diligence/engagements/:id/submit` | Provider | Submit report |
| POST | `/due-diligence/engagements/:id/review` | Admin | Review report |
| GET | `/due-diligence/projects` | Provider | Available projects |

### Admin (`/api/admin`)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/admin/dashboard` | Admin | Dashboard metrics |
| GET | `/admin/compliance/alerts` | Admin | Compliance alerts |
| PATCH | `/admin/compliance/alerts/:id` | Admin | Update alert |
| GET | `/admin/disputes` | Admin | List disputes |
| POST | `/admin/disputes/:id/resolve` | Admin | Resolve dispute |
| GET | `/admin/audit-logs` | Admin | Audit log entries |
| GET | `/admin/providers` | Admin | Provider oversight |
| GET | `/admin/transactions` | Admin | All transactions |

### Notifications (`/api/notifications`)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/notifications` | JWT | My notifications |
| GET | `/notifications/unread-count` | JWT | Unread count |
| PATCH | `/notifications/:id/read` | JWT | Mark as read |
| PATCH | `/notifications/read-all` | JWT | Mark all read |

### Messages (`/api/messages`)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/messages/conversations` | JWT | My conversations |
| GET | `/messages/conversations/:userId` | JWT | Conversation thread |
| POST | `/messages` | JWT | Send message |
| GET | `/messages/unread-count` | JWT | Unread count |

### Documents (`/api/documents`)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/documents/upload` | JWT | Upload file |
| DELETE | `/documents/:id` | JWT | Delete file |

---

## Security Features

| Feature | Implementation |
|---------|---------------|
| **Password Hashing** | bcrypt with 12 rounds |
| **JWT Tokens** | Short-lived access (15min) + long-lived refresh (7d) |
| **Token Rotation** | New refresh token issued on each refresh, old revoked |
| **Account Lockout** | 5 failed attempts = 30-minute lockout |
| **Rate Limiting** | 100 req/min global, 10 req/min auth endpoints |
| **CORS** | Whitelist-based, configurable per frontend |
| **Helmet** | Security headers (HSTS, CSP, X-Frame-Options) |
| **RBAC** | Role-based access control on all endpoints |
| **Input Validation** | class-validator on all DTOs, whitelist mode |
| **SQL Injection** | TypeORM parameterized queries only |
| **Soft Delete** | No data permanently deleted |
| **Audit Logging** | All sensitive operations logged |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Environment mode |
| `APP_PORT` | No | `3000` | API server port |
| `DB_HOST` | No | `localhost` | PostgreSQL host |
| `DB_PORT` | No | `5432` | PostgreSQL port |
| `DB_USERNAME` | No | `evzone` | Database user |
| `DB_PASSWORD` | **Yes** | — | Database password |
| `DB_NAME` | No | `evzone_platform` | Database name |
| `JWT_ACCESS_SECRET` | **Yes** | — | JWT access token secret |
| `JWT_REFRESH_SECRET` | **Yes** | — | JWT refresh token secret |
| `REDIS_HOST` | No | `localhost` | Redis host (optional) |
| `REDIS_PASSWORD` | No | — | Redis password |

---

## Database Migrations

```bash
# Generate migration from entity changes
npm run migration:generate src/database/migrations/MigrationName

# Run pending migrations
npm run migration:run

# Revert last migration
npm run migration:revert
```

---

## Testing

```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:cov

# E2E tests
npm run test:e2e
```

---

## Production Deployment

### Using Docker
```bash
# Set production env variables
export NODE_ENV=production
export JWT_ACCESS_SECRET=your-secure-secret
export JWT_REFRESH_SECRET=your-secure-refresh-secret

# Build and run
docker-compose -f docker-compose.yml up -d --build
```

### Manual
```bash
npm install
npm run build
npm run start:prod
```

---

## License

MIT

---

Built for the EVzone Global Green Finance Platform.
