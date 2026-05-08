-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "dueDiligenceCaseId" TEXT,
ADD COLUMN     "dueDiligenceTaskId" TEXT;

-- AlterTable
ALTER TABLE "DueDiligenceTask" DROP COLUMN "assignedTo",
ADD COLUMN     "assignedToUserId" TEXT;

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "dueDiligenceCaseId" TEXT,
ADD COLUMN     "dueDiligenceTaskId" TEXT;

-- CreateIndex
CREATE INDEX "Document_dueDiligenceCaseId_idx" ON "Document"("dueDiligenceCaseId");

-- CreateIndex
CREATE INDEX "Document_dueDiligenceTaskId_idx" ON "Document"("dueDiligenceTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "DueDiligenceCase_finalReportDocumentId_key" ON "DueDiligenceCase"("finalReportDocumentId");

-- CreateIndex
CREATE INDEX "DueDiligenceTask_assignedToUserId_idx" ON "DueDiligenceTask"("assignedToUserId");

-- CreateIndex
CREATE INDEX "MediaAsset_dueDiligenceCaseId_idx" ON "MediaAsset"("dueDiligenceCaseId");

-- CreateIndex
CREATE INDEX "MediaAsset_dueDiligenceTaskId_idx" ON "MediaAsset"("dueDiligenceTaskId");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_dueDiligenceCaseId_fkey" FOREIGN KEY ("dueDiligenceCaseId") REFERENCES "DueDiligenceCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_dueDiligenceTaskId_fkey" FOREIGN KEY ("dueDiligenceTaskId") REFERENCES "DueDiligenceTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_dueDiligenceCaseId_fkey" FOREIGN KEY ("dueDiligenceCaseId") REFERENCES "DueDiligenceCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_dueDiligenceTaskId_fkey" FOREIGN KEY ("dueDiligenceTaskId") REFERENCES "DueDiligenceTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DueDiligenceCase" ADD CONSTRAINT "DueDiligenceCase_finalReportDocumentId_fkey" FOREIGN KEY ("finalReportDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DueDiligenceTask" ADD CONSTRAINT "DueDiligenceTask_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
