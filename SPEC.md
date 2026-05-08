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

`PlatformRole.ASSESSOR` is the internal technical role. “Provider” remains only as a legacy display/business label where needed.

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

For a fresh local database:

```bash
npm run prisma:migrate -- --name init
npm run seed
```
