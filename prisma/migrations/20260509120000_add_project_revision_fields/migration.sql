-- Add project revision request metadata used by the current Prisma schema.
ALTER TABLE "Project"
ADD COLUMN "revisionNotes" TEXT,
ADD COLUMN "revisionRequestedAt" TIMESTAMP(3);
