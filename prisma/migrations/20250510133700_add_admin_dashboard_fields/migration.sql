-- Migration: Add admin dashboard support fields
-- Created manually since DB is not accessible for `prisma migrate dev`

-- 1. Add AssessorAccreditationStatus enum
CREATE TYPE "AssessorAccreditationStatus" AS ENUM ('ACCREDITED', 'PENDING', 'SUSPENDED', 'UNDER_REVIEW');

-- 2. Add accreditationStatus to AssessorProfile
ALTER TABLE "AssessorProfile" ADD COLUMN "accreditationStatus" "AssessorAccreditationStatus" NOT NULL DEFAULT 'PENDING';

-- 3. Add vetting tracking fields to Project
ALTER TABLE "Project" ADD COLUMN "reviewerId" TEXT;
ALTER TABLE "Project" ADD COLUMN "environmentalScore" INTEGER;
ALTER TABLE "Project" ADD COLUMN "statusChangedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "committeeVotes" JSONB;
ALTER TABLE "Project" ADD COLUMN "reviewerNotes" JSONB;

-- 4. Add dispute management fields to Dispute
ALTER TABLE "Dispute" ADD COLUMN "priority" TEXT DEFAULT 'medium';
ALTER TABLE "Dispute" ADD COLUMN "financialImpact" DECIMAL(18, 2);
ALTER TABLE "Dispute" ADD COLUMN "assignedTo" TEXT;

-- 5. Add jurisdiction to AuditLog
ALTER TABLE "AuditLog" ADD COLUMN "jurisdiction" TEXT;
