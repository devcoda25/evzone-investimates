CREATE TYPE "NotificationDispatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

ALTER TABLE "OutboxEvent"
ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

CREATE TABLE "NotificationDispatch" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificationDispatchStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "processingStartedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDispatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationDispatch_eventKey_key" ON "NotificationDispatch"("eventKey");
CREATE INDEX "NotificationDispatch_status_nextAttemptAt_createdAt_idx" ON "NotificationDispatch"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "OutboxEvent_status_nextAttemptAt_createdAt_idx" ON "OutboxEvent"("status", "nextAttemptAt", "createdAt");
