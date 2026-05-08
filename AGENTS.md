# EVzone Platform Backend — Agent Guide

This document is the canonical orientation for AI coding agents working on the EVzone Global Green Finance Platform backend. Read it before making any changes.

## Project Overview

This is an **Nx monorepo** containing a modular NestJS backend. It serves four client applications — Investor, Entrepreneur, Assessor (internal role name; "Provider" is legacy copy), and Admin — via a single REST API and several background workers.

The architecture is a **modular monolith** with event-driven workers:
- PostgreSQL + Prisma is the sole source of truth.
- Kafka is used for durable business events via the outbox pattern.
- Redis is used only for short-lived operational data (cache, idempotency, locks), never for critical business-event delivery.
- S3-compatible object storage (MinIO locally, AWS S3 in production) holds file bytes; PostgreSQL holds metadata.

> **Important:** There is a legacy `src/` directory at the project root. It is **not used** by the active apps. The canonical source lives under `apps/` and `libs/`.

## Technology Stack

| Layer | Technology |
|---|---|
| API Framework | NestJS 10 + TypeScript 5 |
| Workspace | Nx 20 |
| Database | PostgreSQL 16 + Prisma 5 |
| Events | Kafka 3.7 + outbox pattern (`kafkajs`) |
| Cache / Ops | Redis 7 (`ioredis`) |
| Files | S3-compatible object storage (`@aws-sdk/client-s3`) |
| Auth | First-party JWT access/refresh tokens (`@nestjs/jwt`) |
| Validation | `class-validator` + `class-transformer` |
| Logging | `winston` + `winston-daily-rotate-file` |
| Testing | Jest 29 + `ts-jest` |
| Lint / Format | ESLint + Prettier |

## Workspace Structure

```text
apps/
  api/                 Main REST API (HTTP, Swagger, domain modules)
  scheduler/           Cron-like scheduled tasks (e.g., close expired deals)
  worker-events/       Outbox publisher: polls `OutboxEvent` rows → Kafka
  worker-media/        Media-processing worker (verify uploads → READY)
  worker-compliance/   Compliance worker (queue open cases for manual review)

libs/
  common/              Decorators, DTOs, filters, interceptors, ledger utilities, shared types
  config/              Typed env parsers + NestJS `registerAs` config factories
  database/            `PrismaModule`, `PrismaService`, `TransactionService`
  auth/                `JwtAuthGuard`, `RolesGuard`, `OwnerOrAdminGuard`, JWT payload types
  permissions/         `PermissionsService` — tenant/ownership checks
  events/              `EventsModule`, `OutboxService`, `KafkaPublisherService`
  redis/               `RedisModule`, `RedisService` (ioredis wrapper)
  storage/             `StorageModule`, `StorageService` (S3 presigned URLs)
  audit/               `AuditModule`, `AuditService` — audit-log persistence

prisma/
  schema.prisma        Single schema (~28 models)
  migrations/          Prisma migration files
  seed.ts              Idempotent seed script with demo accounts

test/
  ledger.spec.ts       Only current test file
```

### App Patterns

- **No app-level `package.json`**. All dependencies are managed at the workspace root.
- Each app has `main.ts` and a root module inline in `main.ts` (for workers) or in `app.module.ts` (for API).
- The `api` app places domain modules as **single flat files** under `apps/api/src/modules/`. Each module file exports its own `@Module`, controllers, services, and DTOs inline. There are no subdirectories per module inside `apps/api/src/modules/`.

### Library Patterns

- Every lib has a barrel file at `libs/<name>/src/index.ts`.
- Most libs export a `@Global()` NestJS module (`<name>.module.ts`) and a primary service (`<name>.service.ts`).
- `common` and `config` are module-less; they export plain utilities and config factories.
- TypeScript path aliases map `@evzone/<name>` → `libs/<name>/src/index.ts`.

## Build and Run Commands

```bash
# Install dependencies
npm install

# Generate Prisma client (required after schema changes)
npm run prisma:generate

# Run migrations
npm run prisma:migrate -- --name <migration_name>

# Seed the database
npm run seed

# Development — API only
npm run start:dev

# Development — individual workers
npm run start:scheduler
npm run start:worker-events
npm run start:worker-media
npm run start:worker-compliance

# Production build (all apps)
npm run build

# Production start (API)
npm start
```

### Docker (Full Local Stack)

```bash
cp .env.example .env
docker compose up -d
```

Compose starts PostgreSQL, Redis, Kafka, MinIO, the API, and all workers. All app services use `Dockerfile.dev` for hot-reload local development. The production image is built from `Dockerfile`.

## Code Style Guidelines

Enforced by `.eslintrc.js`:

- **No explicit `any`**: `@typescript-eslint/no-explicit-any` is `error`.
- **No unsafe assignments / member access**: `error`.
- **Explicit function return types**: required (`expressions` allowed).
- **Strict null checks** and **no implicit any** are enabled in `tsconfig.json`.
- Prettier is integrated via ESLint.

Formatting command:
```bash
npm run format
```

Lint command:
```bash
npm run lint
```

## Testing Instructions

Test configuration lives in `package.json` under the `jest` key.

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:cov

# E2E (config file missing — see Known Gaps)
npm run test:e2e
```

**Current state:** Test coverage is extremely minimal. Only `test/ledger.spec.ts` exists (unit tests for `isBalancedLedgerDraft` / `assertBalancedLedgerDraft`). No app or lib-level `.spec.ts` files exist yet.

## Database and Prisma Conventions

- **Single schema file**: `prisma/schema.prisma`. Do not split into multiple files.
- **PostgreSQL only**.
- **Soft deletes** use `deletedAt` (DateTime, nullable) on `User`, `Project`, and `Document`.
- **Tenant scoping**: Most business tables have `tenantId` with composite indexes.
- **Monetary values**: Always use `Decimal(18,2)`.
- **Flexible data**: JSON fields for `story`, `impactMetrics`, `risks`, `faqs`, `teamMembers`, `evidence`, `metadata`, `assessments`.
- **Outbox pattern**: `OutboxEvent` table with statuses `PENDING`, `PUBLISHED`, `FAILED`.
- **Idempotency**: Financial operations (investments, transactions) require idempotency keys.
- **Balanced ledger**: Investment commitments create balanced double-entry `LedgerEntry` records. Use `isBalancedLedgerDraft()` / `assertBalancedLedgerDraft()` from `@evzone/common`.
- **Prisma commands**:
  ```bash
  npm run prisma:validate
  npm run prisma:generate
  npm run prisma:migrate -- --name <name>
  npm run prisma:deploy
  ```

## Authentication and Authorization

- **JWT-first**: Access tokens (15 min) in `Authorization: Bearer` header; refresh tokens (7 days) rotated on use.
- **Guards**: `JwtAuthGuard`, `RolesGuard`, `OwnerOrAdminGuard`. Apply `@Public()` to skip JWT on specific routes.
- **Roles**: `SUPER_ADMIN`, `ADMIN`, `INVESTOR`, `ENTREPRENEUR`, `ASSESSOR`. `SUPER_ADMIN` bypasses all role checks.
- **Tenant checks**: `PermissionsService.assertTenantAccess()` and `assertOwnerOrAdmin()` must be called for sensitive resource access.
- **Password hashing**: bcrypt with 12 rounds.
- **Rate limiting**: 100 requests/minute per IP; 10 auth attempts/minute.

## Security Considerations

- **Prisma is the only ORM** — no raw SQL injection risk when using the client.
- **Helmet** is enabled for security headers.
- **CORS** is whitelisted to frontend URLs only.
- **Object storage**: Clients receive signed URLs, not credentials. Keys are generated by the backend.
- **Audit logging**: Sensitive actions should write `AuditLog` rows via `AuditService`.
- **Token blacklisting**: Refresh tokens are tracked in the database and revoked on logout.
- **Account lockout**: 5 failed login attempts trigger a 15-minute lockout.

## Event-Driven Architecture

- Domain events are written to `OutboxEvent` inside the same Prisma transaction that mutates business data.
- `worker-events` polls pending outbox rows and publishes them to Kafka.
- Consumers (not yet in repo) read from Kafka topics.
- **Do not use Redis for critical business-event delivery.**

## Deployment

- **Production Docker image**: multi-stage `Dockerfile` based on `node:20-alpine`, runs as unprivileged `nodejs` user (UID 1001).
- **Build output**: `dist/apps/<app>/src/main.js`.
- **Default API port**: `3000`.
- **Healthchecks**: Postgres and Redis have Docker healthchecks; app services depend on them.

## Known Gaps and Notes

- `test/jest-e2e.json` is referenced in `package.json` but does not exist.
- The root `src/` directory is legacy and unused. All new code belongs in `apps/` or `libs/`.
- Demo accounts from seed:
  | Role | Email | Password |
  |---|---|---|
  | Super Admin | `admin@evzone.com` | `Admin123!` |
  | Investor | `sarah.chen@email.com` | `Investor123!` |
  | Entrepreneur | `amina.osei@email.com` | `Entrepreneur123!` |
  | Assessor | `dr.kwame@email.com` | `Provider123!` |
